/**
 * EFTPOS Payment Intent routes
 *
 * Provides CRUD and crash-recovery endpoints for TIM API payment intents.
 * The browser POS creates an intent before starting a terminal transaction,
 * then updates it on every state transition. On startup, the POS queries
 * /recovery to find any in-flight intents and surfaces them to the operator.
 *
 * Base prefix: /api/v1/eftpos
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, inArray, gt, sql } from 'drizzle-orm';
import { db, schema } from '../db';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const intentStateValues = [
  'created', 'initializing_terminal', 'awaiting_terminal_ready',
  'sent_to_terminal', 'awaiting_cardholder', 'authorizing',
  'approved_pending_commit', 'approved', 'declined',
  'cancel_requested', 'cancelled', 'failed_retryable',
  'failed_terminal', 'unknown_outcome', 'recovery_required',
] as const;

const TERMINAL_STATES = ['approved', 'declined', 'cancelled', 'failed_retryable'] as const;

const createIntentSchema = z.object({
  posOrderId:    z.string().min(1).max(255),
  amountCents:   z.number().int().positive(),
  currency:      z.string().length(3).default('AUD'),
  terminalIp:    z.string().max(45),
  terminalPort:  z.number().int().default(80),
  terminalLabel: z.string().max(255).optional(),
  deviceId:      z.string().uuid().optional(),
  locationId:    z.string().uuid().optional(),
});

const updateStateSchema = z.object({
  state:   z.enum(intentStateValues),
  details: z.string().max(500).optional(),
  // Optional result fields — only present when state is approved/declined
  timCorrelationId: z.string().max(255).optional(),
  resultApproved:   z.boolean().optional(),
  resultCode:       z.string().max(50).optional(),
  authCode:         z.string().max(50).optional(),
  cardLast4:        z.string().max(4).optional(),
  cardScheme:       z.string().max(50).optional(),
  rrn:              z.string().max(50).optional(),
  stan:             z.string().max(50).optional(),
  merchantReceipt:  z.string().optional(),
  customerReceipt:  z.string().optional(),
});

const appendLogSchema = z.object({
  entries: z.array(z.object({
    at:      z.string(),
    level:   z.enum(['debug', 'info', 'warn', 'error']),
    event:   z.string().max(100),
    details: z.record(z.unknown()).optional(),
  })).max(100),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function eftposRoutes(app: FastifyInstance) {

  // POST /api/v1/eftpos/intents — create a new payment intent
  app.post('/intents', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const body = createIntentSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error', details: body.error.flatten() });

    const { posOrderId, amountCents, currency, terminalIp, terminalPort, terminalLabel, deviceId, locationId } = body.data;

    const historyEntry = { state: 'created', at: new Date().toISOString() };

    const rows = await db
      .insert(schema.eftposPaymentIntents)
      .values({
        orgId:        user.orgId,
        locationId:   locationId ?? null,
        deviceId:     deviceId   ?? null,
        posOrderId,
        amountCents,
        currency,
        state:        'created',
        stateHistory: [historyEntry],
        terminalIp,
        terminalPort,
        terminalLabel: terminalLabel ?? null,
      })
      .returning({ id: schema.eftposPaymentIntents.id });

    return reply.status(201).send({ data: { id: rows[0]!.id } });
  });

  // PATCH /api/v1/eftpos/intents/:id/state — update state + optional result fields
  app.patch('/intents/:id/state', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const body = updateStateSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error', details: body.error.flatten() });

    // Verify ownership
    const existing = await db.query.eftposPaymentIntents.findFirst({
      where: and(
        eq(schema.eftposPaymentIntents.id, user.orgId ? id : id),
        eq(schema.eftposPaymentIntents.orgId, user.orgId),
      ),
    });
    if (!existing) return reply.status(404).send({ error: 'Intent not found' });

    const { state, details, ...resultFields } = body.data;

    const historyEntry = { state, at: new Date().toISOString(), ...(details ? { details } : {}) };
    const newHistory   = [...((existing.stateHistory as object[]) ?? []), historyEntry];

    await db
      .update(schema.eftposPaymentIntents)
      .set({
        state,
        stateHistory: newHistory,
        updatedAt:    new Date(),
        ...(resultFields.timCorrelationId !== undefined ? { timCorrelationId: resultFields.timCorrelationId } : {}),
        ...(resultFields.resultApproved   !== undefined ? { resultApproved:   resultFields.resultApproved   } : {}),
        ...(resultFields.resultCode       !== undefined ? { resultCode:       resultFields.resultCode       } : {}),
        ...(resultFields.authCode         !== undefined ? { authCode:         resultFields.authCode         } : {}),
        ...(resultFields.cardLast4        !== undefined ? { cardLast4:        resultFields.cardLast4        } : {}),
        ...(resultFields.cardScheme       !== undefined ? { cardScheme:       resultFields.cardScheme       } : {}),
        ...(resultFields.rrn              !== undefined ? { rrn:              resultFields.rrn              } : {}),
        ...(resultFields.stan             !== undefined ? { stan:             resultFields.stan             } : {}),
        ...(resultFields.merchantReceipt  !== undefined ? { merchantReceipt:  resultFields.merchantReceipt  } : {}),
        ...(resultFields.customerReceipt  !== undefined ? { customerReceipt:  resultFields.customerReceipt  } : {}),
      })
      .where(eq(schema.eftposPaymentIntents.id, id));

    return reply.send({ data: { id, state } });
  });

  // POST /api/v1/eftpos/intents/:id/log — append structured support log entries
  app.post('/intents/:id/log', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const body = appendLogSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const existing = await db.query.eftposPaymentIntents.findFirst({
      where: and(
        eq(schema.eftposPaymentIntents.id, id),
        eq(schema.eftposPaymentIntents.orgId, user.orgId),
      ),
    });
    if (!existing) return reply.status(404).send({ error: 'Intent not found' });

    const newLog = [...((existing.supportLog as object[]) ?? []), ...body.data.entries];

    await db
      .update(schema.eftposPaymentIntents)
      .set({ supportLog: newLog, updatedAt: new Date() })
      .where(eq(schema.eftposPaymentIntents.id, id));

    return reply.send({ data: { id, appended: body.data.entries.length } });
  });

  // GET /api/v1/eftpos/intents/:id — fetch a single intent
  app.get('/intents/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const intent = await db.query.eftposPaymentIntents.findFirst({
      where: and(
        eq(schema.eftposPaymentIntents.id, id),
        eq(schema.eftposPaymentIntents.orgId, user.orgId),
      ),
    });
    if (!intent) return reply.status(404).send({ error: 'Intent not found' });

    return reply.send({ data: intent });
  });

  // GET /api/v1/eftpos/recovery — list intents requiring operator attention
  // Returns all non-terminal intents created in the last 24 hours.
  // Called by the POS on startup to detect crashed transactions.
  app.get('/recovery', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const intents = await db.query.eftposPaymentIntents.findMany({
      where: and(
        eq(schema.eftposPaymentIntents.orgId, user.orgId),
        // Not in terminal states
        sql`state NOT IN ('approved', 'declined', 'cancelled', 'failed_retryable')`,
        gt(schema.eftposPaymentIntents.createdAt, cutoff),
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 50,
    });

    return reply.send({ data: intents });
  });

  // POST /api/v1/eftpos/intents/:id/mark-recovery — operator acknowledges unknown_outcome
  app.post('/intents/:id/mark-recovery', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const body = z.object({
      resolution: z.enum(['approved', 'declined', 'cancelled']),
      note:       z.string().max(500).optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const existing = await db.query.eftposPaymentIntents.findFirst({
      where: and(
        eq(schema.eftposPaymentIntents.id, id),
        eq(schema.eftposPaymentIntents.orgId, user.orgId),
      ),
    });
    if (!existing) return reply.status(404).send({ error: 'Intent not found' });

    const historyEntry = {
      state: body.data.resolution,
      at: new Date().toISOString(),
      details: `Operator reconciliation: ${body.data.note ?? 'resolved'}`,
    };

    await db
      .update(schema.eftposPaymentIntents)
      .set({
        state:        body.data.resolution,
        resultApproved: body.data.resolution === 'approved',
        stateHistory: [...((existing.stateHistory as object[]) ?? []), historyEntry],
        updatedAt:    new Date(),
      })
      .where(eq(schema.eftposPaymentIntents.id, id));

    return reply.send({ data: { id, state: body.data.resolution } });
  });
}
