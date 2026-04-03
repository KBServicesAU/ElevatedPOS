/**
 * Terminal integration routes — ANZ Worldline TIM
 *
 * The ANZ Worldline TIM (Terminal Integration Module) is a local HTTP server
 * running on the EFTPOS terminal. Configuration only requires the terminal's
 * IP address and port (default: 8080) — no API keys needed.
 *
 * Base prefix: /api/v1/terminal
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { AnzWorldlineTIMClient, isApproved, mapCardType } from '../lib/anzworldline';

// ─── Schemas ────────────────────────────────────────────────────────────────

const saveCredentialsSchema = z.object({
  provider:     z.literal('anz'),
  label:        z.string().min(1).max(255).optional(),
  /** IPv4 address of the terminal, e.g. "192.168.1.100" */
  terminalIp:   z.string().min(7).max(45),
  /** Port the terminal HTTP server listens on — default 8080 */
  terminalPort: z.number().int().min(1).max(65535).default(8080),
});

const refundSchema = z.object({
  amount:   z.number().positive(),
  currency: z.string().length(3).default('AUD'),
});

// ─── Helper ──────────────────────────────────────────────────────────────────

async function getTIMClient(orgId: string): Promise<AnzWorldlineTIMClient | null> {
  const creds = await db.query.terminalCredentials.findFirst({
    where: and(
      eq(schema.terminalCredentials.orgId,    orgId),
      eq(schema.terminalCredentials.provider, 'anz'),
      eq(schema.terminalCredentials.isActive, true),
    ),
  });
  if (!creds?.terminalIp) return null;

  return new AnzWorldlineTIMClient({
    terminalIp:   creds.terminalIp,
    terminalPort: creds.terminalPort ?? 8080,
  });
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function terminalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ── Credentials ────────────────────────────────────────────────────────

  /**
   * POST /api/v1/terminal/credentials
   * Save (upsert) the terminal's IP and port for the current org.
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

    const { provider, label, terminalIp, terminalPort } = body.data;

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
        .set({ label: label ?? null, terminalIp, terminalPort, isActive: true, updatedAt: new Date() })
        .where(eq(schema.terminalCredentials.id, existing.id))
        .returning();
      saved = rows[0]!;
    } else {
      const rows = await db
        .insert(schema.terminalCredentials)
        .values({ orgId, provider, label: label ?? null, terminalIp, terminalPort })
        .returning();
      saved = rows[0]!;
    }

    return reply.status(200).send({ data: saved });
  });

  /**
   * GET /api/v1/terminal/credentials
   * List terminal configuration for this org.
   */
  app.get('/credentials', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const rows = await db.query.terminalCredentials.findMany({
      where: eq(schema.terminalCredentials.orgId, orgId),
    });
    return reply.status(200).send({ data: rows });
  });

  /**
   * DELETE /api/v1/terminal/credentials/:id
   * Deactivate a terminal configuration.
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

  // ── ANZ Worldline TIM — Connection ─────────────────────────────────────

  /**
   * POST /api/v1/terminal/anz/test
   * Ping the terminal to confirm it is reachable on the local network.
   */
  app.post('/anz/test', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const client    = await getTIMClient(orgId);
    if (!client) {
      return reply.status(404).send({
        type:   'https://nexus.app/errors/not-configured',
        title:  'Terminal Not Configured',
        status: 404,
        detail: 'No active ANZ Worldline terminal found. Please save the terminal IP and port first.',
      });
    }

    try {
      const { data, httpStatus } = await client.getStatus();
      return reply.status(200).send({
        ok:      httpStatus === 200,
        message: httpStatus === 200
          ? 'Terminal is reachable and ready'
          : 'Terminal responded but may not be ready',
        terminal: data,
      });
    } catch (e) {
      return reply.status(200).send({
        ok:      false,
        message: `Could not reach terminal: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  });

  // ── ANZ Worldline TIM — Payment lifecycle ──────────────────────────────

  /**
   * GET /api/v1/terminal/anz/payments/:paymentId/status
   * Returns the current local DB status of the payment.
   */
  app.get('/anz/payments/:paymentId/status', async (request, reply) => {
    const { orgId }     = request.user as { orgId: string };
    const { paymentId } = request.params as { paymentId: string };

    const payment = await db.query.payments.findFirst({
      where: and(eq(schema.payments.id, paymentId), eq(schema.payments.orgId, orgId)),
    });
    if (!payment) return reply.status(404).send({ title: 'Payment Not Found', status: 404 });

    return reply.status(200).send({ data: payment });
  });

  /**
   * POST /api/v1/terminal/anz/payments/:paymentId/refund
   * Send a refund to the terminal for a previously approved payment.
   * Body: { amount: number (dollars), currency?: string }
   */
  app.post('/anz/payments/:paymentId/refund', async (request, reply) => {
    const { orgId }     = request.user as { orgId: string };
    const { paymentId } = request.params as { paymentId: string };
    const body = refundSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422,
        detail: body.error.message,
      });
    }

    const payment = await db.query.payments.findFirst({
      where: and(eq(schema.payments.id, paymentId), eq(schema.payments.orgId, orgId)),
    });
    if (!payment) return reply.status(404).send({ title: 'Payment Not Found', status: 404 });
    if (payment.status !== 'approved') {
      return reply.status(409).send({
        title:  'Payment Not Refundable',
        status: 409,
        detail: `Cannot refund a payment in '${payment.status}' status.`,
      });
    }
    if (!payment.acquirerTransactionId) {
      return reply.status(409).send({ title: 'No terminal transaction ID on record', status: 409 });
    }

    const client = await getTIMClient(orgId);
    if (!client) return reply.status(404).send({ title: 'Terminal Not Configured', status: 404 });

    const amountCents          = Math.round(body.data.amount * 100);
    const { data, httpStatus } = await client.refund(amountCents, payment.acquirerTransactionId, paymentId);

    if (isApproved(data)) {
      await db.update(schema.payments)
        .set({ status: 'refunded' })
        .where(eq(schema.payments.id, paymentId));
    }

    return reply.status(httpStatus).send({ data, approved: isApproved(data) });
  });

  /**
   * POST /api/v1/terminal/anz/payments/:paymentId/reverse
   * Reverse (void) an approved payment via the terminal.
   */
  app.post('/anz/payments/:paymentId/reverse', async (request, reply) => {
    const { orgId }     = request.user as { orgId: string };
    const { paymentId } = request.params as { paymentId: string };

    const payment = await db.query.payments.findFirst({
      where: and(eq(schema.payments.id, paymentId), eq(schema.payments.orgId, orgId)),
    });
    if (!payment)                          return reply.status(404).send({ title: 'Payment Not Found', status: 404 });
    if (payment.status === 'void')         return reply.status(409).send({ title: 'Payment Already Voided', status: 409 });
    if (!payment.acquirerTransactionId)    return reply.status(409).send({ title: 'No terminal transaction ID on record', status: 409 });

    const client = await getTIMClient(orgId);
    if (!client) return reply.status(404).send({ title: 'Terminal Not Configured', status: 404 });

    const { data, httpStatus } = await client.reverse(payment.acquirerTransactionId);

    if (isApproved(data)) {
      await db.update(schema.payments)
        .set({ status: 'void' })
        .where(eq(schema.payments.id, paymentId));
    }

    return reply.status(httpStatus).send({ data, approved: isApproved(data) });
  });
}
