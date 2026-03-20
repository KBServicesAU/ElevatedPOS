import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const app = Fastify({ logger: true, trustProxy: true });
const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

const SYSTEM_PROMPT =
  'You are NEXUS AI, a business intelligence assistant for a Point of Sale system. ' +
  'Answer concisely about sales data, inventory, customers, and business performance. ' +
  'If asked about specific metrics, provide data-driven insights.';

const querySchema = z.object({
  question: z.string().min(1).max(2000),
});

const upsellSchema = z.object({
  items: z.array(z.string()).min(1),
  customerTier: z.string().optional(),
});

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    verify: { issuer: 'nexus-auth' },
  });

  app.decorate(
    'authenticate',
    async (
      request: Parameters<typeof app.authenticate>[0],
      reply: Parameters<typeof app.authenticate>[1],
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

  // POST /api/v1/ai/query — natural language business intelligence
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

    if (!process.env['ANTHROPIC_API_KEY']) {
      return reply.status(503).send({
        type: 'https://nexus.app/errors/service-unavailable',
        title: 'AI Not Configured',
        status: 503,
        detail: 'Set ANTHROPIC_API_KEY to enable AI features.',
      });
    }

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

  // POST /api/v1/ai/upsell — upsell suggestions for current items
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

    if (!process.env['ANTHROPIC_API_KEY']) {
      return reply.status(503).send({
        type: 'https://nexus.app/errors/service-unavailable',
        title: 'AI Not Configured',
        status: 503,
        detail: 'Set ANTHROPIC_API_KEY to enable AI features.',
      });
    }

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

  app.get('/health', async () => ({ status: 'ok', service: 'ai' }));

  const port = Number(process.env['PORT'] ?? 4012);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`AI service listening on port ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
