import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

// NOTE: This module provides a real API surface for BNPL (Buy Now Pay Later) integrations.
// The provider calls are currently SIMULATED — replace the mock implementations with real
// Afterpay/Zip API calls when credentials are configured (see comments in each handler).

// ─── Validation schemas ───────────────────────────────────────────────────────

const initiateSchema = z.object({
  provider: z.enum(['afterpay', 'zip', 'humm', 'latitude']),
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  customerId: z.string().uuid().optional(),
  returnUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const confirmSchema = z.object({
  token: z.string().min(1),
  provider: z.enum(['afterpay', 'zip', 'humm', 'latitude']),
});

const refundSchema = z.object({
  bnplTransactionId: z.string().uuid(),
  amount: z.number().positive().optional(), // optional for partial refunds; defaults to full amount
  reason: z.string().max(500).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function bnplRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /initiate — initiate a BNPL checkout session
  app.post('/initiate', async (request, reply) => {
    const body = initiateSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    return reply.status(501).send({
      type: 'https://elevatedpos.com/errors/not-implemented',
      title: 'BNPL provider integration not yet implemented',
      status: 501,
      detail: 'Afterpay/Zip/Humm/Latitude integration is pending. Contact support.',
    });
  });

  // POST /confirm — confirm BNPL payment completion (called after customer returns from provider)
  app.post('/confirm', async (request, reply) => {
    const body = confirmSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    return reply.status(501).send({
      type: 'https://elevatedpos.com/errors/not-implemented',
      title: 'BNPL provider integration not yet implemented',
      status: 501,
      detail: 'Afterpay/Zip/Humm/Latitude integration is pending. Contact support.',
    });
  });

  // POST /refund — initiate a BNPL refund
  app.post('/refund', async (request, reply) => {
    const body = refundSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    return reply.status(501).send({
      type: 'https://elevatedpos.com/errors/not-implemented',
      title: 'BNPL provider integration not yet implemented',
      status: 501,
      detail: 'Afterpay/Zip/Humm/Latitude integration is pending. Contact support.',
    });
  });

  // GET / — list BNPL transactions for org (filter by provider, status)
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { provider?: string; status?: string; orderId?: string; limit?: string };

    const transactions = await db.query.bnplTransactions.findMany({
      where: and(
        eq(schema.bnplTransactions.orgId, orgId),
        q.provider ? eq(schema.bnplTransactions.provider, q.provider as 'afterpay' | 'zip' | 'humm' | 'latitude') : undefined,
        q.orderId ? eq(schema.bnplTransactions.orderId, q.orderId) : undefined,
      ),
      orderBy: [desc(schema.bnplTransactions.createdAt)],
      limit: q.limit ? Math.min(parseInt(q.limit, 10), 500) : 100,
    });

    // Filter by status in memory (avoids needing a SQL enum cast for query string values)
    const filtered = q.status
      ? transactions.filter((t) => t.status === q.status)
      : transactions;

    return reply.status(200).send({ data: filtered, total: filtered.length });
  });
}
