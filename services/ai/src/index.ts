import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { copilotRoutes } from './routes/copilot.js';

// Type augmentation — allows app.authenticate to be used as a preHandler
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}


const app = Fastify({ logger: true, trustProxy: true });
const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] ?? '' });

const SYSTEM_PROMPT =
  'You are ElevatedPOS AI, a business intelligence assistant for a Point of Sale system. ' +
  'Answer concisely about sales data, inventory, customers, and business performance. ' +
  'If asked about specific metrics, provide data-driven insights.';

const ELEVATEDPOS_SUPPORT_PROMPT =
  'You are ElevatedPOS Support AI, an expert assistant for the ElevatedPOS Point of Sale platform. ' +
  'ElevatedPOS is a modern cloud-based POS system for restaurants, cafes, retail stores, bars, and franchises. ' +
  'It includes: order management, inventory tracking, customer loyalty programs, employee management, ' +
  'campaign marketing, payment processing, kitchen display system (KDS), reporting & analytics, ' +
  'and AI-powered business intelligence. ' +
  'Answer support questions clearly with step-by-step guidance when relevant. ' +
  'Always respond with valid JSON only — no markdown prose outside the JSON block.';

// ─── JSON extraction helper ───────────────────────────────────────────────────

function extractJSON(text: string): unknown {
  const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[1]);
}

// ─── API key guard helper ─────────────────────────────────────────────────────

function requireApiKey(reply: import('fastify').FastifyReply): boolean {
  if (!process.env['ANTHROPIC_API_KEY']) {
    void reply.status(503).send({
      type: 'https://nexus.app/errors/service-unavailable',
      title: 'AI Not Configured',
      status: 503,
      detail: 'Set ANTHROPIC_API_KEY to enable AI features.',
    });
    return false;
  }
  return true;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const querySchema = z.object({
  question: z.string().min(1).max(2000),
});

const upsellSchema = z.object({
  items: z.array(z.string()).min(1),
  customerTier: z.string().optional(),
});

const stockAnomalySchema = z.object({
  orgId: z.string(),
  locationId: z.string().optional(),
  lookbackDays: z.number().int().positive().default(30),
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      sku: z.string(),
      currentStock: z.number(),
      avgDailySales: z.number(),
      daysOfStock: z.number(),
      lastMovementDays: z.number(),
    }),
  ),
});

const churnRiskSchema = z.object({
  customers: z.array(
    z.object({
      customerId: z.string(),
      name: z.string(),
      daysSinceLastVisit: z.number(),
      visitCount30d: z.number(),
      visitCount90d: z.number(),
      avgOrderValue: z.number(),
      lifetimeValue: z.number(),
      tier: z.string(),
    }),
  ),
});

const laborOptimizationSchema = z.object({
  shifts: z.array(
    z.object({
      date: z.string(),
      dayOfWeek: z.string(),
      staffCount: z.number(),
      revenue: z.number(),
      transactions: z.number(),
      avgServiceTime: z.number(),
    }),
  ),
  forecast: z
    .object({
      nextWeek: z.array(
        z.object({
          date: z.string(),
          dayOfWeek: z.string(),
          predictedRevenue: z.number(),
        }),
      ),
    })
    .optional(),
});

const menuEngineeringSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      category: z.string(),
      unitsSold: z.number(),
      revenue: z.number(),
      costPrice: z.number(),
      salePrice: z.number(),
      margin: z.number(),
    }),
  ),
  period: z.string(),
});

const fraudDetectionSchema = z.object({
  events: z.array(
    z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      eventType: z.enum(['refund', 'void', 'discount', 'cash_drawer', 'comp']),
      amount: z.number().optional(),
      orderId: z.string().optional(),
      timestamp: z.string(),
      locationId: z.string(),
    }),
  ),
});

const reorderSuggestionsSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      sku: z.string(),
      supplierId: z.string(),
      supplierName: z.string(),
      currentStock: z.number(),
      avgDailySales: z.number(),
      leadTimeDays: z.number(),
      reorderPoint: z.number(),
      reorderQty: z.number(),
      unitCost: z.number(),
    }),
  ),
});

const onboardingSchema = z.object({
  step: z.string(),
  answers: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

const supportSchema = z.object({
  question: z.string().min(1).max(2000),
  context: z
    .object({
      currentPage: z.string().optional(),
      userRole: z.string().optional(),
      orgType: z.string().optional(),
    })
    .optional(),
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
  });

  app.decorate(
    'authenticate',
    async (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          type: 'https://nexus.app/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
        });
      }
    },
  );

  // ── POST /api/v1/ai/query — natural language business intelligence ───────────
  app.post('/api/v1/ai/query', { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    if (!requireApiKey(reply)) return;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: parsed.data.question }],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    return reply.status(200).send({
      answer: textContent?.text ?? '',
      model: message.model,
    });
  });

  // ── POST /api/v1/ai/upsell — upsell suggestions for current items ───────────
  app.post('/api/v1/ai/upsell', { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = upsellSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    if (!requireApiKey(reply)) return;

    const tierContext = parsed.data.customerTier
      ? ` The customer is a ${parsed.data.customerTier} tier member.`
      : '';
    const prompt =
      `A customer has the following items in their cart: ${parsed.data.items.join(', ')}.${tierContext} ` +
      `Suggest 3 specific upsell or cross-sell items that would complement their purchase. ` +
      `Respond with a JSON array of suggestion strings only, no extra text. Example: ["Item A", "Item B", "Item C"]`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    let suggestions: string[] = [];
    try {
      const rawText = textContent?.text ?? '[]';
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      suggestions = jsonMatch ? (JSON.parse(jsonMatch[0]) as string[]) : [];
    } catch {
      suggestions = [];
    }

    return reply.status(200).send({ suggestions });
  });

  // ── POST /api/v1/ai/stock-anomaly — detect stock movement anomalies ──────────
  // Model: claude-opus-4-5
  app.post(
    '/api/v1/ai/stock-anomaly',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = stockAnomalySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://nexus.app/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { items, lookbackDays } = parsed.data;
      const prompt =
        `Analyze the following inventory stock movement data over the past ${lookbackDays} days ` +
        `and identify anomalies. For each anomalous item classify its type as one of: ` +
        `"spike" (sudden unexpected increase), "stagnant" (no movement for too long), ` +
        `"negative" (stock going below safe levels), or "overstock" (excess inventory). ` +
        `Assign severity as "low", "medium", or "high". Provide a concise message and actionable recommendation.\n\n` +
        `Stock data:\n${JSON.stringify(items, null, 2)}\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "anomalies": [\n` +
        `    { "productId": "...", "name": "...", "type": "spike|stagnant|negative|overstock", ` +
        `"severity": "low|medium|high", "message": "...", "recommendation": "..." }\n` +
        `  ],\n` +
        `  "summary": "..."\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'stock-anomaly Claude call failed');
        return reply.status(500).send({
          type: 'https://nexus.app/errors/ai-failure',
          title: 'AI Analysis Failed',
          status: 500,
          detail: 'Failed to analyze stock anomalies. Please try again.',
        });
      }
    },
  );

  // ── POST /api/v1/ai/churn-risk — customer churn risk scoring ────────────────
  // Model: claude-opus-4-5
  app.post(
    '/api/v1/ai/churn-risk',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = churnRiskSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://nexus.app/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { customers } = parsed.data;
      const prompt =
        `Score each customer's churn risk on a scale of 0.0 to 1.0 based on their visit behavior, ` +
        `order value, and loyalty tier. Classify risk as "high" (≥0.7), "medium" (0.4–0.69), or "low" (<0.4). ` +
        `Identify the primary factor driving their risk and provide a personalized retention recommendation.\n\n` +
        `Customer data:\n${JSON.stringify(customers, null, 2)}\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "scores": [\n` +
        `    { "customerId": "...", "name": "...", "churnRisk": 0.85, "riskLevel": "high|medium|low", ` +
        `"primaryFactor": "...", "recommendation": "..." }\n` +
        `  ],\n` +
        `  "highRiskCount": 5,\n` +
        `  "summary": "..."\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'churn-risk Claude call failed');
        return reply.status(500).send({
          type: 'https://nexus.app/errors/ai-failure',
          title: 'AI Analysis Failed',
          status: 500,
          detail: 'Failed to score churn risk. Please try again.',
        });
      }
    },
  );

  // ── POST /api/v1/ai/labor-optimization — staffing efficiency analysis ────────
  // Model: claude-opus-4-5
  app.post(
    '/api/v1/ai/labor-optimization',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = laborOptimizationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://nexus.app/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { shifts, forecast } = parsed.data;
      const forecastSection = forecast
        ? `\n\nNext-week revenue forecast:\n${JSON.stringify(forecast.nextWeek, null, 2)}`
        : '';

      const prompt =
        `Analyze staffing efficiency for the following shifts. Classify each day as "overstaffed", ` +
        `"understaffed", or "optimal" based on revenue per staff member and transaction volume. ` +
        `Calculate revenue per staff and recommend the ideal staff count. ` +
        `${forecast ? 'Also generate staffing recommendations for the next week based on the provided revenue forecast.' : ''}\n\n` +
        `Shift data:\n${JSON.stringify(shifts, null, 2)}${forecastSection}\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "insights": [\n` +
        `    { "date": "...", "issue": "overstaffed|understaffed|optimal", "actualStaff": 6, ` +
        `"recommendedStaff": 4, "revenuePerStaff": 850, "message": "..." }\n` +
        `  ],\n` +
        `  "nextWeekRecommendations": [\n` +
        `    { "date": "...", "recommendedStaff": 5, "reasoning": "..." }\n` +
        `  ],\n` +
        `  "summary": "..."\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'labor-optimization Claude call failed');
        return reply.status(500).send({
          type: 'https://nexus.app/errors/ai-failure',
          title: 'AI Analysis Failed',
          status: 500,
          detail: 'Failed to analyze labor optimization. Please try again.',
        });
      }
    },
  );

  // ── POST /api/v1/ai/menu-engineering — BCG matrix menu analysis ──────────────
  // Model: claude-opus-4-5
  app.post(
    '/api/v1/ai/menu-engineering',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = menuEngineeringSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://nexus.app/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { items, period } = parsed.data;
      const prompt =
        `Perform menu engineering analysis using the BCG matrix framework for the period: ${period}. ` +
        `Classify each menu item into one of four quadrants:\n` +
        `- "star": high popularity AND high margin (promote heavily)\n` +
        `- "plowhorse": high popularity BUT low margin (optimize cost or reprice)\n` +
        `- "puzzle": low popularity BUT high margin (bundle or reposition)\n` +
        `- "dog": low popularity AND low margin (consider removing)\n\n` +
        `Score popularity (0-1) relative to total units sold across all items. ` +
        `Score margin (0-1) relative to highest margin item. ` +
        `Suggest an action: "promote", "reprice", "remove", or "bundle".\n\n` +
        `Menu item data:\n${JSON.stringify(items, null, 2)}\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "analysis": [\n` +
        `    { "productId": "...", "name": "...", "quadrant": "star|plowhorse|puzzle|dog", ` +
        `"popularityScore": 0.8, "marginScore": 0.6, "recommendation": "...", "action": "promote|reprice|remove|bundle" }\n` +
        `  ],\n` +
        `  "stars": ["name1"],\n` +
        `  "plowhorses": ["name2"],\n` +
        `  "puzzles": ["name3"],\n` +
        `  "dogs": ["name4"],\n` +
        `  "summary": "..."\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'menu-engineering Claude call failed');
        return reply.status(500).send({
          type: 'https://nexus.app/errors/ai-failure',
          title: 'AI Analysis Failed',
          status: 500,
          detail: 'Failed to analyze menu engineering. Please try again.',
        });
      }
    },
  );

  // ── POST /api/v1/ai/fraud-detection — suspicious POS event pattern detection ─
  // Model: claude-opus-4-5
  app.post(
    '/api/v1/ai/fraud-detection',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = fraudDetectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://nexus.app/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { events } = parsed.data;
      const prompt =
        `Analyze the following POS audit events for suspicious patterns that may indicate fraud, ` +
        `theft, or policy violations. Look for patterns such as: excessive voids/refunds, ` +
        `repeated discounts without manager approval, unusual cash drawer openings, ` +
        `comps concentrated to specific employees, or time-based anomalies.\n\n` +
        `Classify each flagged pattern severity as "low", "medium", or "high". ` +
        `Include the relevant event references and provide clear recommendations.\n\n` +
        `Event data:\n${JSON.stringify(events, null, 2)}\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "flags": [\n` +
        `    { "employeeId": "...", "employeeName": "...", "pattern": "...", ` +
        `"severity": "low|medium|high", "events": ["orderId1", "orderId2"], ` +
        `"message": "...", "recommendation": "..." }\n` +
        `  ],\n` +
        `  "riskEmployees": ["name1", "name2"],\n` +
        `  "summary": "..."\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'fraud-detection Claude call failed');
        return reply.status(500).send({
          type: 'https://nexus.app/errors/ai-failure',
          title: 'AI Analysis Failed',
          status: 500,
          detail: 'Failed to run fraud detection analysis. Please try again.',
        });
      }
    },
  );

  // ── POST /api/v1/ai/reorder-suggestions — purchase order recommendations ─────
  // Model: claude-opus-4-5
  app.post(
    '/api/v1/ai/reorder-suggestions',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = reorderSuggestionsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://nexus.app/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { items } = parsed.data;
      const prompt =
        `Generate intelligent reorder suggestions for the following inventory items. ` +
        `Consider current stock levels, average daily sales, supplier lead times, and reorder points. ` +
        `Calculate days until stockout (currentStock / avgDailySales). ` +
        `Classify urgency as:\n` +
        `- "urgent": stockout within lead time (must order immediately)\n` +
        `- "soon": stockout within 2x lead time (order this week)\n` +
        `- "optional": stock healthy but approaching reorder point\n\n` +
        `Only suggest items that actually need reordering. ` +
        `Calculate estimated cost as suggestedQty × unitCost.\n\n` +
        `Inventory data:\n${JSON.stringify(items, null, 2)}\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "suggestions": [\n` +
        `    { "productId": "...", "name": "...", "supplierId": "...", "supplierName": "...", ` +
        `"suggestedQty": 50, "urgency": "urgent|soon|optional", "daysUntilStockout": 5, ` +
        `"estimatedCost": 2500, "reasoning": "..." }\n` +
        `  ],\n` +
        `  "totalEstimatedCost": 12500,\n` +
        `  "urgentCount": 3,\n` +
        `  "summary": "..."\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'reorder-suggestions Claude call failed');
        return reply.status(500).send({
          type: 'https://nexus.app/errors/ai-failure',
          title: 'AI Analysis Failed',
          status: 500,
          detail: 'Failed to generate reorder suggestions. Please try again.',
        });
      }
    },
  );

  // ── POST /api/v1/ai/onboarding — guided onboarding step assistant ────────────
  // Model: claude-haiku-4-5
  app.post(
    '/api/v1/ai/onboarding',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = onboardingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://nexus.app/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { step, answers } = parsed.data;
      const prompt =
        `You are guiding a new business owner through setting up their ElevatedPOS account. ` +
        `They are currently on step: "${step}".\n` +
        `Answers provided so far: ${JSON.stringify(answers)}\n\n` +
        `Based on their answers, determine the next most important question to ask to configure their account. ` +
        `Infer their business vertical (cafe, restaurant, qsr, retail, bar, grocery, franchise) ` +
        `from their answers if possible, or set to null if unclear. ` +
        `Track progress as a 0-1 decimal representing how complete the onboarding is. ` +
        `Include any setup actions that should be triggered based on confirmed answers.\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "nextQuestion": "...",\n` +
        `  "fieldName": "...",\n` +
        `  "type": "text|select|boolean|number",\n` +
        `  "options": ["option1", "option2"],\n` +
        `  "hint": "...",\n` +
        `  "progress": 0.4,\n` +
        `  "verticalPack": "cafe|restaurant|qsr|retail|bar|grocery|franchise|null",\n` +
        `  "setupActions": [{ "action": "...", "description": "...", "completed": false }]\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          system: ELEVATEDPOS_SUPPORT_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'onboarding Claude call failed');
        return reply.status(500).send({
          type: 'https://nexus.app/errors/ai-failure',
          title: 'AI Analysis Failed',
          status: 500,
          detail: 'Failed to generate onboarding guidance. Please try again.',
        });
      }
    },
  );

  // ── POST /api/v1/ai/support — ElevatedPOS platform support Q&A ────────────────────
  // Model: claude-haiku-4-5
  app.post('/api/v1/ai/support', { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = supportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    if (!requireApiKey(reply)) return;

    const { question, context } = parsed.data;
    const contextSection = context
      ? `\nUser context: page="${context.currentPage ?? 'unknown'}", role="${context.userRole ?? 'unknown'}", orgType="${context.orgType ?? 'unknown'}"`
      : '';

    const prompt =
      `Answer the following ElevatedPOS support question clearly and helpfully.${contextSection}\n\n` +
      `Question: ${question}\n\n` +
      `Respond ONLY with valid JSON in this exact structure:\n` +
      `{\n` +
      `  "answer": "...",\n` +
      `  "steps": ["step 1", "step 2"],\n` +
      `  "relatedFeatures": ["feature1", "feature2"],\n` +
      `  "escalate": false\n` +
      `}\n` +
      `Set "escalate" to true only if the question requires human support intervention.`;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: ELEVATEDPOS_SUPPORT_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = message.content.find((c) => c.type === 'text');
      const result = extractJSON(textContent?.text ?? '');
      return reply.status(200).send(result);
    } catch (err) {
      app.log.error(err, 'support Claude call failed');
      return reply.status(500).send({
        type: 'https://nexus.app/errors/ai-failure',
        title: 'AI Analysis Failed',
        status: 500,
        detail: 'Failed to generate support response. Please try again.',
      });
    }
  });

  // ── Copilot routes (chat, analyze-sales, forecast-stock, smart-pricing, etc.) ─
  await app.register(copilotRoutes);

  app.get('/health', async () => ({ status: 'ok', service: 'ai' }));

  const port = Number(process.env['PORT'] ?? 4012);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`AI service listening on port ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
