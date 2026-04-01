import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { randomBytes } from 'crypto';
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

// ─── Mock provider helpers ────────────────────────────────────────────────────

interface ProviderCheckoutResult {
  token: string;
  redirectUrl: string;
  providerTransactionId: string;
}

function simulateProviderCheckout(
  provider: 'afterpay' | 'zip' | 'humm' | 'latitude',
  amount: number,
  orderId: string,
): ProviderCheckoutResult {
  // NOTE: Replace with real Afterpay/Zip API calls when credentials are configured.
  // Afterpay:  POST https://global-api.afterpay.com/v2/checkouts
  //            Headers: Authorization: Basic <base64(merchantId:secretKey)>
  //            Body: { amount: { amount, currency }, consumer, merchant, items, ... }
  // Zip:       POST https://api.zip.co/v1/checkouts
  //            Headers: Authorization: Bearer <apiKey>
  //            Body: { amount, currency, reference, customer, metadata }
  // Humm:      POST https://au-pay.humm.com/api/v2/purchases
  // Latitude:  POST https://api.latitudefinancial.com/v1/order

  const token = randomBytes(16).toString('hex');
  const portalMap: Record<string, string> = {
    afterpay: 'https://portal.afterpay.com/au/order',
    zip: 'https://checkout.zip.co/checkout',
    humm: 'https://au-pay.humm.com/checkout',
    latitude: 'https://checkout.latitudefinancial.com/order',
  };
  const redirectUrl = `${portalMap[provider]}?token=${token}&orderId=${orderId}&amount=${amount}`;
  const providerTransactionId = `${provider.toUpperCase()}-${Date.now()}`;

  return { token, redirectUrl, providerTransactionId };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function bnplRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /initiate — initiate a BNPL checkout session
  app.post('/initiate', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = initiateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { provider, orderId, amount } = body.data;

    // NOTE: Replace with real Afterpay/Zip API calls when credentials are configured.
    const providerResult = simulateProviderCheckout(provider, amount, orderId);

    const [tx] = await db
      .insert(schema.bnplTransactions)
      .values({
        orgId,
        orderId,
        provider,
        status: 'pending',
        amount: String(amount),
        token: providerResult.token,
        redirectUrl: providerResult.redirectUrl,
        providerTransactionId: providerResult.providerTransactionId,
      })
      .returning();

    return reply.status(201).send({
      data: tx,
      token: providerResult.token,
      redirectUrl: providerResult.redirectUrl,
    });
  });

  // POST /confirm — confirm BNPL payment completion (called after customer returns from provider)
  app.post('/confirm', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = confirmSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { token, provider } = body.data;

    // Find the transaction by token and org
    const tx = await db.query.bnplTransactions.findFirst({
      where: and(
        eq(schema.bnplTransactions.token, token),
        eq(schema.bnplTransactions.orgId, orgId),
        eq(schema.bnplTransactions.provider, provider),
      ),
    });

    if (!tx) {
      return reply.status(404).send({ title: 'Not Found', status: 404, detail: 'BNPL transaction not found for the given token.' });
    }

    if (tx.status !== 'pending') {
      return reply.status(409).send({
        title: 'Conflict',
        status: 409,
        detail: `Transaction is already in '${tx.status}' state.`,
      });
    }

    // NOTE: Replace with real Afterpay/Zip capture API call when credentials are configured.
    // Afterpay:  POST https://global-api.afterpay.com/v2/payments/capture
    //            Body: { token, merchantReference }
    // Zip:       POST https://api.zip.co/v1/checkouts/{checkoutId}/capture

    const [updated] = await db
      .update(schema.bnplTransactions)
      .set({
        status: 'approved',
        updatedAt: new Date(),
      })
      .where(eq(schema.bnplTransactions.id, tx.id))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /refund — initiate a BNPL refund
  app.post('/refund', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = refundSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { bnplTransactionId, amount } = body.data;

    const tx = await db.query.bnplTransactions.findFirst({
      where: and(
        eq(schema.bnplTransactions.id, bnplTransactionId),
        eq(schema.bnplTransactions.orgId, orgId),
      ),
    });

    if (!tx) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    if (tx.status !== 'approved' && tx.status !== 'settled') {
      return reply.status(409).send({
        title: 'Conflict',
        status: 409,
        detail: `Cannot refund a transaction with status '${tx.status}'.`,
      });
    }

    const refundAmount = amount ?? parseFloat(tx.amount);

    // NOTE: Replace with real Afterpay/Zip refund API call when credentials are configured.
    // Afterpay:  POST https://global-api.afterpay.com/v2/payments/{orderToken}/refund
    //            Body: { amount: { amount, currency }, merchantReference, refundMerchantReference }
    // Zip:       POST https://api.zip.co/v1/charges/{chargeId}/refunds
    //            Body: { amount, reason }
    //
    // reason is: ${reason ?? 'Customer requested refund'}

    const [updated] = await db
      .update(schema.bnplTransactions)
      .set({
        status: 'refunded',
        updatedAt: new Date(),
      })
      .where(eq(schema.bnplTransactions.id, tx.id))
      .returning();

    return reply.status(200).send({
      data: updated,
      refundAmount,
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
