/**
 * v2.7.41 — alert rules persisted to Postgres.
 *
 * Replaces the v2.7.40 in-memory proxy shadow at
 * apps/web-backoffice/app/api/proxy/alerts/rules. The dashboard Alex Center
 * "Alert Rules" panel now calls this service via the /api/proxy/alerts-rules
 * key (see apps/web-backoffice/app/api/proxy/[...path]/route.ts SERVICE_MAP).
 *
 * The DB schema carries { name, channel, condition jsonb, ... }. The
 * dashboard client sends the legacy flat shape { trigger, threshold, channels,
 * recipients, enabled } — we pack trigger/threshold/channels/recipients into
 * `condition` on write and unpack them on read so the client keeps working.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const ALERT_CHANNELS = ['email', 'sms', 'push', 'in_app'] as const;
type AlertChannel = (typeof ALERT_CHANNELS)[number];

const createRuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  // Legacy flat shape from the dashboard client — optional at the Zod level
  // so the real schema ({name, channel, condition}) also validates.
  trigger: z.string().optional(),
  threshold: z.number().optional(),
  channels: z.array(z.enum(ALERT_CHANNELS)).optional(),
  recipients: z.string().optional(),
  // New-shape fields (preferred going forward)
  channel: z.enum(ALERT_CHANNELS).optional(),
  condition: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const updateRuleSchema = createRuleSchema.partial();

type AlertRuleRow = typeof schema.alertRules.$inferSelect;

/**
 * Shape the DB row into the flat response the dashboard expects:
 *   { id, trigger, threshold?, channels, recipients?, enabled, createdAt }
 * while also including the real DB fields (name, channel, condition, etc.)
 * so newer clients can use them.
 */
function toClientShape(row: AlertRuleRow): Record<string, unknown> {
  const cond = (row.condition ?? {}) as Record<string, unknown>;
  const trigger = typeof cond['trigger'] === 'string' ? (cond['trigger'] as string) : row.name;
  const channels = Array.isArray(cond['channels'])
    ? (cond['channels'] as unknown[]).filter((c): c is AlertChannel =>
        typeof c === 'string' && (ALERT_CHANNELS as readonly string[]).includes(c),
      )
    : [row.channel as AlertChannel];
  const threshold = typeof cond['threshold'] === 'number' ? (cond['threshold'] as number) : undefined;
  const recipients = typeof cond['recipients'] === 'string' ? (cond['recipients'] as string) : undefined;
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    description: row.description ?? null,
    channel: row.channel,
    condition: row.condition,
    enabled: row.enabled,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Flat legacy fields the dashboard still reads
    trigger,
    ...(threshold !== undefined ? { threshold } : {}),
    channels,
    ...(recipients !== undefined ? { recipients } : {}),
  };
}

/**
 * Merge incoming legacy fields (trigger/threshold/channels/recipients) into
 * the `condition` jsonb and derive `name` / `channel` for the DB row.
 */
function buildInsertValues(
  parsed: z.infer<typeof createRuleSchema>,
  orgId: string,
  userId: string | undefined,
): {
  orgId: string;
  name: string;
  description: string | null;
  channel: string;
  condition: Record<string, unknown>;
  enabled: boolean;
  createdBy: string | null;
} {
  const condition: Record<string, unknown> = { ...(parsed.condition ?? {}) };
  if (parsed.trigger !== undefined) condition['trigger'] = parsed.trigger;
  if (parsed.threshold !== undefined) condition['threshold'] = parsed.threshold;
  if (parsed.channels !== undefined) condition['channels'] = parsed.channels;
  if (parsed.recipients !== undefined) condition['recipients'] = parsed.recipients;

  // Derive `channel` from the first entry of `channels` if not explicitly given
  const channel: AlertChannel | undefined =
    parsed.channel ?? (parsed.channels && parsed.channels[0]) ?? 'in_app';

  // Derive `name` from the trigger label if not given
  const name = parsed.name ?? parsed.trigger ?? 'Alert rule';

  return {
    orgId,
    name,
    description: parsed.description ?? null,
    channel,
    condition,
    enabled: parsed.enabled ?? true,
    createdBy: userId ?? null,
  };
}

export async function alertRulesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET / — list rules for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const rows = await db
      .select()
      .from(schema.alertRules)
      .where(eq(schema.alertRules.orgId, orgId))
      .orderBy(desc(schema.alertRules.createdAt));
    return reply.status(200).send({ data: rows.map(toClientShape) });
  });

  // POST / — create rule
  app.post('/', async (request, reply) => {
    const { orgId, sub: userId } = request.user as { orgId: string; sub?: string };
    const parsed = createRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    // Minimum viable input: either trigger (legacy) or name+channel (new)
    if (!parsed.data.trigger && !parsed.data.name) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: 'Either `trigger` or `name` is required',
      });
    }

    const values = buildInsertValues(parsed.data, orgId, userId);
    const [created] = await db.insert(schema.alertRules).values(values).returning();
    if (!created) {
      return reply.status(500).send({
        type: 'https://elevatedpos.com/errors/internal',
        title: 'Internal Error',
        status: 500,
        detail: 'Failed to create alert rule',
      });
    }
    return reply.status(201).send({ data: toClientShape(created) });
  });

  // PATCH /:id — update rule
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = updateRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const existing = await db.query.alertRules.findFirst({
      where: and(eq(schema.alertRules.id, id), eq(schema.alertRules.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Alert rule ${id} not found`,
      });
    }

    // Merge legacy fields into condition, preserving existing jsonb entries
    const existingCondition = (existing.condition ?? {}) as Record<string, unknown>;
    const nextCondition: Record<string, unknown> = { ...existingCondition };
    if (parsed.data.condition !== undefined) Object.assign(nextCondition, parsed.data.condition);
    if (parsed.data.trigger !== undefined) nextCondition['trigger'] = parsed.data.trigger;
    if (parsed.data.threshold !== undefined) nextCondition['threshold'] = parsed.data.threshold;
    if (parsed.data.channels !== undefined) nextCondition['channels'] = parsed.data.channels;
    if (parsed.data.recipients !== undefined) nextCondition['recipients'] = parsed.data.recipients;

    const updateSet: Partial<typeof schema.alertRules.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (parsed.data.name !== undefined) updateSet.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateSet.description = parsed.data.description;
    if (parsed.data.channel !== undefined) {
      updateSet.channel = parsed.data.channel;
    } else if (parsed.data.channels && parsed.data.channels[0]) {
      updateSet.channel = parsed.data.channels[0];
    }
    if (parsed.data.enabled !== undefined) updateSet.enabled = parsed.data.enabled;
    // Always re-write condition if any condition-bearing field was given
    if (
      parsed.data.condition !== undefined ||
      parsed.data.trigger !== undefined ||
      parsed.data.threshold !== undefined ||
      parsed.data.channels !== undefined ||
      parsed.data.recipients !== undefined
    ) {
      updateSet.condition = nextCondition;
    }

    const [updated] = await db
      .update(schema.alertRules)
      .set(updateSet)
      .where(and(eq(schema.alertRules.id, id), eq(schema.alertRules.orgId, orgId)))
      .returning();
    if (!updated) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Alert rule ${id} not found`,
      });
    }
    return reply.status(200).send({ data: toClientShape(updated) });
  });

  // DELETE /:id — delete rule
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const existing = await db.query.alertRules.findFirst({
      where: and(eq(schema.alertRules.id, id), eq(schema.alertRules.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Alert rule ${id} not found`,
      });
    }
    await db
      .delete(schema.alertRules)
      .where(and(eq(schema.alertRules.id, id), eq(schema.alertRules.orgId, orgId)));
    return reply.status(204).send();
  });
}
