import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createAnthropicClient } from '../lib/anthropic.js';

const COPILOT_SYSTEM_PROMPT =
  'You are ElevatedPOS AI Copilot, an intelligent assistant for retail and hospitality operators. ' +
  'You help with inventory management, sales analysis, customer insights, and operational decisions. ' +
  'Be concise and actionable.';

// ── Simple in-memory suggestions cache ────────────────────────────────────────
interface SuggestionsCacheEntry {
  data: { suggestions: string[] };
  expiresAt: number;
}
const suggestionsCache = new Map<string, SuggestionsCacheEntry>();

// ── Schemas ───────────────────────────────────────────────────────────────────

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    }),
  ).min(1),
  context: z.string().optional(),
});

const analyzeSalesSchema = z.object({
  ordersData: z.array(
    z.object({
      date: z.string(),
      total: z.number(),
      items: z.array(z.unknown()).optional(),
    }),
  ),
  period: z.string(),
});

const forecastStockSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  historicalSales: z.array(
    z.object({
      date: z.string(),
      qty: z.number(),
    }),
  ),
  currentStock: z.number(),
});

const smartPricingSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  currentPrice: z.number(),
  costPrice: z.number(),
  salesVelocity: z.number(),
  competitorPrices: z.array(z.number()).optional(),
});

const customerInsightsSchema = z.object({
  customerId: z.string(),
  purchaseHistory: z.array(
    z.object({
      date: z.string(),
      items: z.array(z.unknown()).optional(),
      total: z.number(),
    }),
  ),
  loyaltyTier: z.string(),
});

// ── Helper ─────────────────────────────────────────────────────────────────────

function requireApiKey(reply: FastifyReply): boolean {
  if (!process.env['ANTHROPIC_API_KEY']) {
    void reply.status(503).send({
      type: 'https://elevatedpos.com/errors/service-unavailable',
      title: 'AI Not Configured',
      status: 503,
      detail: 'Set ANTHROPIC_API_KEY to enable AI features.',
    });
    return false;
  }
  return true;
}

function extractJSON(text: string): unknown {
  const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[1]!);
}

// ── Route registration ─────────────────────────────────────────────────────────

export async function copilotRoutes(app: FastifyInstance) {
  // POST /api/v1/ai/chat — streaming SSE chat
  app.post('/api/v1/ai/chat', { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    if (!requireApiKey(reply)) return;

    const { messages, context } = parsed.data;
    const anthropic = createAnthropicClient();

    const systemPrompt = context
      ? `${COPILOT_SYSTEM_PROMPT}\n\nAdditional context: ${context}`
      : COPILOT_SYSTEM_PROMPT;

    const acceptHeader = request.headers['accept'] ?? '';
    const wantsSSE = acceptHeader.includes('text/event-stream');

    if (wantsSSE) {
      // Streaming SSE response
      const raw = reply.raw;
      raw.setHeader('Content-Type', 'text/event-stream');
      raw.setHeader('Cache-Control', 'no-cache');
      raw.setHeader('Connection', 'keep-alive');
      raw.setHeader('Transfer-Encoding', 'chunked');
      raw.flushHeaders();

      try {
        const stream = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: systemPrompt,
          messages: messages as Array<{ role: 'user' | 'assistant'; content: string }>,
          stream: true,
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const data = JSON.stringify({ type: 'delta', text: event.delta.text });
            raw.write(`data: ${data}\n\n`);
          } else if (event.type === 'message_stop') {
            raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          }
        }
      } catch (err) {
        raw.write(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`);
      }

      raw.end();
      return reply;
    }

    // Non-streaming response
    try {
      const message = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages as Array<{ role: 'user' | 'assistant'; content: string }>,
      });

      const textContent = message.content.find((c) => c.type === 'text');
      return reply.status(200).send({
        content: textContent?.text ?? '',
        model: message.model,
      });
    } catch (err) {
      app.log.error(err, 'chat Claude call failed');
      return reply.status(500).send({
        type: 'https://elevatedpos.com/errors/ai-failure',
        title: 'AI Chat Failed',
        status: 500,
        detail: 'Failed to generate chat response. Please try again.',
      });
    }
  });

  // POST /api/v1/ai/analyze-sales
  app.post(
    '/api/v1/ai/analyze-sales',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = analyzeSalesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://elevatedpos.com/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { ordersData, period } = parsed.data;
      const anthropic = createAnthropicClient();

      const prompt =
        `Analyze the following sales data for the period "${period}" and provide business insights.\n\n` +
        `Orders data:\n${JSON.stringify(ordersData, null, 2)}\n\n` +
        `Provide a JSON response with the following structure:\n` +
        `{\n` +
        `  "insights": "A paragraph summarizing key insights from the sales data",\n` +
        `  "trends": ["trend1", "trend2", "trend3"],\n` +
        `  "recommendations": ["actionable recommendation 1", "actionable recommendation 2", "actionable recommendation 3"]\n` +
        `}\n` +
        `Respond ONLY with valid JSON.`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          system: COPILOT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '') as {
          insights: string;
          trends: string[];
          recommendations: string[];
        };
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'analyze-sales Claude call failed');
        return reply.status(500).send({
          type: 'https://elevatedpos.com/errors/ai-failure',
          title: 'AI Analysis Failed',
          status: 500,
          detail: 'Failed to analyze sales data. Please try again.',
        });
      }
    },
  );

  // POST /api/v1/ai/forecast-stock
  app.post(
    '/api/v1/ai/forecast-stock',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = forecastStockSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://elevatedpos.com/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { productName, historicalSales, currentStock } = parsed.data;
      const anthropic = createAnthropicClient();

      const prompt =
        `Analyze the historical sales data for "${productName}" and forecast stock needs.\n\n` +
        `Current stock: ${currentStock} units\n` +
        `Historical sales:\n${JSON.stringify(historicalSales, null, 2)}\n\n` +
        `Based on the sales trend, predict how many units will be needed for the next 7, 14, and 30 days. ` +
        `Also calculate a reorder point (minimum stock before reordering is needed).\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "forecast7d": 50,\n` +
        `  "forecast14d": 100,\n` +
        `  "forecast30d": 210,\n` +
        `  "reorderPoint": 30,\n` +
        `  "confidence": "high|medium|low",\n` +
        `  "reasoning": "Brief explanation of the forecast methodology and key factors"\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 512,
          system: COPILOT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'forecast-stock Claude call failed');
        return reply.status(500).send({
          type: 'https://elevatedpos.com/errors/ai-failure',
          title: 'AI Forecast Failed',
          status: 500,
          detail: 'Failed to generate stock forecast. Please try again.',
        });
      }
    },
  );

  // POST /api/v1/ai/smart-pricing
  app.post(
    '/api/v1/ai/smart-pricing',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = smartPricingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://elevatedpos.com/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { productName, currentPrice, costPrice, salesVelocity, competitorPrices } =
        parsed.data;
      const anthropic = createAnthropicClient();

      const competitorSection = competitorPrices?.length
        ? `\nCompetitor prices: ${competitorPrices.map((p) => `$${p}`).join(', ')}`
        : '';

      const prompt =
        `Suggest an optimal pricing strategy for "${productName}".\n\n` +
        `Current price: $${currentPrice}\n` +
        `Cost price: $${costPrice}\n` +
        `Current margin: ${(((currentPrice - costPrice) / currentPrice) * 100).toFixed(1)}%\n` +
        `Sales velocity: ${salesVelocity} units/day${competitorSection}\n\n` +
        `Consider profit margin, market positioning, and sales velocity when making recommendations.\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "suggestedPrice": 29.99,\n` +
        `  "minPrice": 24.99,\n` +
        `  "maxPrice": 34.99,\n` +
        `  "strategy": "premium|competitive|penetration|value",\n` +
        `  "reasoning": "Explanation of the pricing recommendation"\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 512,
          system: COPILOT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'smart-pricing Claude call failed');
        return reply.status(500).send({
          type: 'https://elevatedpos.com/errors/ai-failure',
          title: 'AI Pricing Failed',
          status: 500,
          detail: 'Failed to generate pricing recommendations. Please try again.',
        });
      }
    },
  );

  // POST /api/v1/ai/customer-insights
  app.post(
    '/api/v1/ai/customer-insights',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = customerInsightsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          type: 'https://elevatedpos.com/errors/validation',
          title: 'Validation Error',
          status: 422,
          detail: parsed.error.message,
        });
      }

      if (!requireApiKey(reply)) return;

      const { customerId, purchaseHistory, loyaltyTier } = parsed.data;
      const anthropic = createAnthropicClient();

      const totalSpend = purchaseHistory.reduce((s, p) => s + p.total, 0);
      const avgOrderValue = purchaseHistory.length > 0 ? totalSpend / purchaseHistory.length : 0;

      const prompt =
        `Analyze this customer's purchase history and provide insights.\n\n` +
        `Customer ID: ${customerId}\n` +
        `Loyalty tier: ${loyaltyTier}\n` +
        `Total orders: ${purchaseHistory.length}\n` +
        `Total lifetime spend: $${totalSpend.toFixed(2)}\n` +
        `Average order value: $${avgOrderValue.toFixed(2)}\n` +
        `Purchase history:\n${JSON.stringify(purchaseHistory, null, 2)}\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "summary": "Brief customer profile summary",\n` +
        `  "predictedNextPurchase": "Estimated days until next purchase or description",\n` +
        `  "churnRisk": "high|medium|low",\n` +
        `  "churnRiskScore": 0.3,\n` +
        `  "recommendedOffers": ["offer1", "offer2", "offer3"],\n` +
        `  "preferredCategories": ["category1", "category2"],\n` +
        `  "lifetimeValueTrend": "growing|stable|declining"\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          system: COPILOT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = extractJSON(textContent?.text ?? '');
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'customer-insights Claude call failed');
        return reply.status(500).send({
          type: 'https://elevatedpos.com/errors/ai-failure',
          title: 'AI Insights Failed',
          status: 500,
          detail: 'Failed to generate customer insights. Please try again.',
        });
      }
    },
  );

  // GET /api/v1/ai/suggestions — daily AI-generated suggestions (1-hour cache)
  app.get(
    '/api/v1/ai/suggestions',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!requireApiKey(reply)) return;

      // Use orgId from JWT if available, else 'default'
      const jwtPayload = request.user as { orgId?: string } | undefined;
      const cacheKey = jwtPayload?.orgId ?? 'default';
      const now = Date.now();

      const cached = suggestionsCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return reply.status(200).send(cached.data);
      }

      const anthropic = createAnthropicClient();

      const prompt =
        `Generate 3 brief, actionable business suggestions for a retail/hospitality operator today. ` +
        `Focus on practical tips for improving sales, reducing costs, or enhancing customer experience. ` +
        `Each suggestion should be 1-2 sentences and immediately actionable.\n\n` +
        `Respond ONLY with valid JSON in this exact structure:\n` +
        `{\n` +
        `  "suggestions": [\n` +
        `    "Suggestion 1 text here",\n` +
        `    "Suggestion 2 text here",\n` +
        `    "Suggestion 3 text here"\n` +
        `  ]\n` +
        `}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 512,
          system: COPILOT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const textContent = message.content.find((c) => c.type === 'text');
        const result = (extractJSON(textContent?.text ?? '')) as { suggestions: string[] };

        // Cache for 1 hour
        suggestionsCache.set(cacheKey, {
          data: result,
          expiresAt: now + 60 * 60 * 1000,
        });

        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err, 'suggestions Claude call failed');
        return reply.status(500).send({
          type: 'https://elevatedpos.com/errors/ai-failure',
          title: 'AI Suggestions Failed',
          status: 500,
          detail: 'Failed to generate suggestions. Please try again.',
        });
      }
    },
  );
}
