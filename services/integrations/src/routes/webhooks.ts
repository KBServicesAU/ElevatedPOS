import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { deliverWebhook } from '../lib/webhookDelivery';

const ALL_EVENTS = [
  'order.created', 'order.status_changed', 'order.completed', 'order.cancelled', 'order.refunded',
  'payment.captured', 'payment.failed', 'payment.refunded',
  'customer.created', 'customer.updated',
  'product.created', 'product.updated', 'product.deleted',
  'inventory.low_stock', 'inventory.out_of_stock', 'inventory.adjusted',
  'loyalty.points_earned', 'loyalty.points_redeemed', 'loyalty.tier_changed',
] as const;

const createWebhookSchema = z.object({
  label: z.string().max(255).default(''),
  url: z.string().url('Must be a valid HTTPS URL').refine((url) => url.startsWith('https://'), {
    message: 'Webhook URL must use HTTPS',
  }),
  events: z.array(z.enum(ALL_EVENTS)).min(1, 'At least one event must be selected'),
  enabled: z.boolean().default(true),
});

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function updateWebhookHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as { orgId: string };
  const { id } = request.params;

  const body = createWebhookSchema.partial().safeParse(request.body);
  if (!body.success) {
    return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
  }

  const existing = await db.query.webhooks.findFirst({
    where: and(eq(schema.webhooks.id, id), eq(schema.webhooks.orgId, orgId)),
  });

  if (!existing) return reply.status(404).send({ title: 'Webhook not found', status: 404 });

  const updatedRows = await db
    .update(schema.webhooks)
    .set({
      ...(body.data.label !== undefined ? { label: body.data.label } : {}),
      ...(body.data.url !== undefined ? { url: body.data.url } : {}),
      ...(body.data.events !== undefined ? { events: body.data.events as string[] } : {}),
      ...(body.data.enabled !== undefined ? { enabled: body.data.enabled } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.webhooks.id, id))
    .returning();

  const updated = updatedRows[0]!;
  const { secret: _secret, ...safeHook } = updated;
  return reply.status(200).send({ data: safeHook });
}

export async function webhookRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/integrations/webhooks — list all webhooks for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const hooks = await db.query.webhooks.findMany({
      where: eq(schema.webhooks.orgId, orgId),
      orderBy: [desc(schema.webhooks.createdAt)],
    });

    return reply.status(200).send({ data: hooks, meta: { total: hooks.length } });
  });

  // POST /api/v1/integrations/webhooks — create a new webhook
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const body = createWebhookSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const secret = generateSecret();

    const [created] = await db
      .insert(schema.webhooks)
      .values({ orgId, ...body.data, secret })
      .returning();

    // Return the secret only on creation — never again
    return reply.status(201).send({ data: { ...created, secret } });
  });

  // GET /api/v1/integrations/webhooks/:id — get a single webhook
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const hook = await db.query.webhooks.findFirst({
      where: and(eq(schema.webhooks.id, id), eq(schema.webhooks.orgId, orgId)),
    });

    if (!hook) return reply.status(404).send({ title: 'Webhook not found', status: 404 });

    // Never return the secret after initial creation
    const { secret: _secret, ...safeHook } = hook;
    return reply.status(200).send({ data: safeHook });
  });

  // PATCH /api/v1/integrations/webhooks/:id — update URL, events, label, or enabled
  // Also registered as PUT for backwards compatibility
  app.patch('/:id', updateWebhookHandler);

  // PUT /api/v1/integrations/webhooks/:id — update a webhook (legacy alias)
  app.put('/:id', updateWebhookHandler);

  // DELETE /api/v1/integrations/webhooks/:id — delete a webhook
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.webhooks.findFirst({
      where: and(eq(schema.webhooks.id, id), eq(schema.webhooks.orgId, orgId)),
    });

    if (!existing) return reply.status(404).send({ title: 'Webhook not found', status: 404 });

    await db.delete(schema.webhooks).where(eq(schema.webhooks.id, id));
    return reply.status(204).send();
  });

  // POST /api/v1/integrations/webhooks/:id/test — send a test ping
  app.post('/:id/test', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const hook = await db.query.webhooks.findFirst({
      where: and(eq(schema.webhooks.id, id), eq(schema.webhooks.orgId, orgId)),
    });

    if (!hook) return reply.status(404).send({ title: 'Webhook not found', status: 404 });

    const testPayload = {
      id: crypto.randomUUID(),
      type: 'webhook.test',
      merchantId: orgId,
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test ping from ElevatedPOS. Your webhook is working correctly.' },
    };

    const result = await deliverWebhook(id, 'webhook.test', testPayload);
    return reply.status(200).send({ data: result });
  });

  // GET /api/v1/integrations/webhooks/:id/deliveries — last 50 delivery attempts
  app.get('/:id/deliveries', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const hook = await db.query.webhooks.findFirst({
      where: and(eq(schema.webhooks.id, id), eq(schema.webhooks.orgId, orgId)),
    });

    if (!hook) return reply.status(404).send({ title: 'Webhook not found', status: 404 });

    const deliveries = await db.query.webhookDeliveries.findMany({
      where: eq(schema.webhookDeliveries.webhookId, id),
      orderBy: [desc(schema.webhookDeliveries.attemptedAt)],
      limit: 50,
    });

    return reply.status(200).send({ data: deliveries, meta: { total: deliveries.length } });
  });
}
