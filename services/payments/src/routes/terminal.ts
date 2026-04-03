/**
 * Terminal integration routes — ANZ Worldline
 *
 * Credentials management, connection testing, and lifecycle operations
 * (capture, cancel, refund) on ANZ Worldline payments.
 *
 * Base prefix: /api/v1/terminal
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { AnzWorldlineClient, mapAnzStatusCode } from '../lib/anzworldline';

// ─── Schemas ────────────────────────────────────────────────────────────────

const saveCredentialsSchema = z.object({
  provider:    z.literal('anz'),
  label:       z.string().min(1).max(255).optional(),
  merchantId:  z.string().min(1),
  apiKey:      z.string().min(1),
  apiSecret:   z.string().min(1),
  environment: z.enum(['preprod', 'production']).default('preprod'),
});

const captureSchema = z.object({
  /** Leave undefined to capture full authorised amount */
  amount: z.number().positive().optional(),
});

const refundSchema = z.object({
  amount:   z.number().positive(),
  currency: z.string().length(3).default('AUD'),
});

// ─── Helper ──────────────────────────────────────────────────────────────────

async function getAnzClient(orgId: string): Promise<AnzWorldlineClient | null> {
  const creds = await db.query.terminalCredentials.findFirst({
    where: and(
      eq(schema.terminalCredentials.orgId,      orgId),
      eq(schema.terminalCredentials.provider,   'anz'),
      eq(schema.terminalCredentials.isActive,   true),
    ),
  });
  if (!creds?.merchantId || !creds?.apiKey || !creds?.apiSecret) return null;

  return new AnzWorldlineClient({
    merchantId:  creds.merchantId,
    apiKey:      creds.apiKey,
    apiSecret:   creds.apiSecret,
    environment: (creds.environment ?? 'preprod') as 'preprod' | 'production',
  });
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function terminalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ── Credentials ────────────────────────────────────────────────────────

  /**
   * POST /api/v1/terminal/credentials
   * Save (upsert) ANZ Worldline API credentials for the current org.
   * Returns the record WITHOUT exposing apiKey / apiSecret.
   */
  app.post('/credentials', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = saveCredentialsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type:   'https://nexus.app/errors/validation',
        title:  'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { provider, label, merchantId, apiKey, apiSecret, environment } = body.data;

    const existing = await db.query.terminalCredentials.findFirst({
      where: and(
        eq(schema.terminalCredentials.orgId,    orgId),
        eq(schema.terminalCredentials.provider, provider),
      ),
    });

    let saved;
    if (existing) {
      const rows = await db
        .update(schema.terminalCredentials)
        .set({
          label:       label ?? null,
          merchantId,
          apiKey,
          apiSecret,
          environment,
          isActive:    true,
          updatedAt:   new Date(),
        })
        .where(eq(schema.terminalCredentials.id, existing.id))
        .returning();
      saved = rows[0]!;
    } else {
      const rows = await db
        .insert(schema.terminalCredentials)
        .values({ orgId, provider, label: label ?? null, merchantId, apiKey, apiSecret, environment })
        .returning();
      saved = rows[0]!;
    }

    // Never return secrets in the response
    const { apiKey: _k, apiSecret: _s, ...safe } = saved;
    return reply.status(200).send({ data: safe });
  });

  /**
   * GET /api/v1/terminal/credentials
   * List terminal credential records for the org (no secrets exposed).
   */
  app.get('/credentials', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const rows = await db.query.terminalCredentials.findMany({
      where: eq(schema.terminalCredentials.orgId, orgId),
    });
    const safe = rows.map(({ apiKey: _k, apiSecret: _s, ...r }) => r);
    return reply.status(200).send({ data: safe });
  });

  /**
   * DELETE /api/v1/terminal/credentials/:id
   * Soft-delete (deactivate) a credential record.
   */
  app.delete('/credentials/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id }    = request.params as { id: string };

    const existing = await db.query.terminalCredentials.findFirst({
      where: and(
        eq(schema.terminalCredentials.id,    id),
        eq(schema.terminalCredentials.orgId, orgId),
      ),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    await db
      .update(schema.terminalCredentials)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.terminalCredentials.id, id));

    return reply.status(204).send();
  });

  // ── ANZ Worldline — Connection ──────────────────────────────────────────

  /**
   * POST /api/v1/terminal/anz/test
   * Test the ANZ Worldline API connection using the stored credentials.
   */
  app.post('/anz/test', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const client    = await getAnzClient(orgId);
    if (!client) {
      return reply.status(404).send({
        type:   'https://nexus.app/errors/not-configured',
        title:  'ANZ Worldline Not Configured',
        status: 404,
        detail: 'No active ANZ Worldline credentials found. Please configure them first.',
      });
    }

    const ok = await client.testConnection();
    return reply.status(200).send({
      ok,
      message: ok
        ? 'ANZ Worldline connection successful'
        : 'ANZ Worldline connection failed — check your credentials',
    });
  });

  // ── ANZ Worldline — Payment lifecycle ──────────────────────────────────

  /**
   * GET /api/v1/terminal/anz/payments/:paymentId/status
   * Fetch the live status of an ANZ Worldline transaction.
   */
  app.get('/anz/payments/:paymentId/status', async (request, reply) => {
    const { orgId }    = request.user as { orgId: string };
    const { paymentId } = request.params as { paymentId: string };

    const payment = await db.query.payments.findFirst({
      where: and(
        eq(schema.payments.id,    paymentId),
        eq(schema.payments.orgId, orgId),
      ),
    });
    if (!payment) return reply.status(404).send({ title: 'Payment Not Found', status: 404 });
    if (!payment.acquirerTransactionId) {
      return reply.status(409).send({
        title:  'No Acquirer Transaction',
        status: 409,
        detail: 'This payment has no ANZ Worldline transaction ID.',
      });
    }

    const client = await getAnzClient(orgId);
    if (!client) return reply.status(404).send({ title: 'ANZ Worldline Not Configured', status: 404 });

    const { data, httpStatus } = await client.getPayment(payment.acquirerTransactionId);
    return reply.status(httpStatus).send({ data });
  });

  /**
   * POST /api/v1/terminal/anz/payments/:paymentId/capture
   * Capture a previously authorised ANZ Worldline payment.
   * Optionally supply a partial amount (in dollars) in the body.
   */
  app.post('/anz/payments/:paymentId/capture', async (request, reply) => {
    const { orgId }    = request.user as { orgId: string };
    const { paymentId } = request.params as { paymentId: string };
    const body = captureSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type:   'https://nexus.app/errors/validation',
        title:  'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const payment = await db.query.payments.findFirst({
      where: and(eq(schema.payments.id, paymentId), eq(schema.payments.orgId, orgId)),
    });
    if (!payment) return reply.status(404).send({ title: 'Payment Not Found', status: 404 });
    if (!payment.acquirerTransactionId) {
      return reply.status(409).send({ title: 'No Acquirer Transaction', status: 409 });
    }

    const client = await getAnzClient(orgId);
    if (!client) return reply.status(404).send({ title: 'ANZ Worldline Not Configured', status: 404 });

    const amountCents = body.data.amount !== undefined
      ? Math.round(body.data.amount * 100)
      : undefined;

    const { data, httpStatus } = await client.capturePayment(
      payment.acquirerTransactionId,
      amountCents,
    );

    if (httpStatus === 200 || httpStatus === 201) {
      await db.update(schema.payments)
        .set({ status: 'approved', processedAt: new Date() })
        .where(eq(schema.payments.id, paymentId));
    }

    return reply.status(httpStatus).send({ data });
  });

  /**
   * POST /api/v1/terminal/anz/payments/:paymentId/cancel
   * Cancel / void an ANZ Worldline authorisation.
   * Updates the local payment status to 'void' on success.
   */
  app.post('/anz/payments/:paymentId/cancel', async (request, reply) => {
    const { orgId }    = request.user as { orgId: string };
    const { paymentId } = request.params as { paymentId: string };

    const payment = await db.query.payments.findFirst({
      where: and(eq(schema.payments.id, paymentId), eq(schema.payments.orgId, orgId)),
    });
    if (!payment) return reply.status(404).send({ title: 'Payment Not Found', status: 404 });
    if (!payment.acquirerTransactionId) {
      return reply.status(409).send({ title: 'No Acquirer Transaction', status: 409 });
    }
    if (payment.status === 'void') {
      return reply.status(409).send({ title: 'Payment Already Voided', status: 409 });
    }

    const client = await getAnzClient(orgId);
    if (!client) return reply.status(404).send({ title: 'ANZ Worldline Not Configured', status: 404 });

    const { data, httpStatus } = await client.cancelPayment(payment.acquirerTransactionId);

    if (httpStatus === 200) {
      await db.update(schema.payments)
        .set({ status: 'void' })
        .where(eq(schema.payments.id, paymentId));
    }

    return reply.status(httpStatus).send({ data });
  });

  /**
   * POST /api/v1/terminal/anz/payments/:paymentId/refund
   * Refund a captured ANZ Worldline payment.
   * Body: { amount: number (dollars), currency?: string }
   * Updates the local payment status to 'refunded' on success.
   */
  app.post('/anz/payments/:paymentId/refund', async (request, reply) => {
    const { orgId }    = request.user as { orgId: string };
    const { paymentId } = request.params as { paymentId: string };
    const body = refundSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type:   'https://nexus.app/errors/validation',
        title:  'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const payment = await db.query.payments.findFirst({
      where: and(eq(schema.payments.id, paymentId), eq(schema.payments.orgId, orgId)),
    });
    if (!payment) return reply.status(404).send({ title: 'Payment Not Found', status: 404 });
    if (!payment.acquirerTransactionId) {
      return reply.status(409).send({ title: 'No Acquirer Transaction', status: 409 });
    }
    if (payment.status !== 'approved') {
      return reply.status(409).send({
        title:  'Payment Not Refundable',
        status: 409,
        detail: `Cannot refund a payment in '${payment.status}' status.`,
      });
    }

    const client = await getAnzClient(orgId);
    if (!client) return reply.status(404).send({ title: 'ANZ Worldline Not Configured', status: 404 });

    const amountCents              = Math.round(body.data.amount * 100);
    const { data, httpStatus }     = await client.refundPayment(
      payment.acquirerTransactionId,
      amountCents,
      body.data.currency,
    );

    if (httpStatus === 201) {
      await db.update(schema.payments)
        .set({ status: 'refunded' })
        .where(eq(schema.payments.id, paymentId));
    }

    return reply.status(httpStatus).send({ data });
  });
}
