import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, gte, count, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db, schema } from '../db';
import { deliverWebhook } from '../lib/deliver';

const createEndpointSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
});

const updateEndpointSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

export async function webhookRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST / — create endpoint
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createEndpointSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const secret = randomBytes(32).toString('hex');

    const endpointRows = await db
      .insert(schema.webhookEndpoints)
      .values({ orgId, url: body.data.url, events: body.data.events, secret })
      .returning();

    return reply.status(201).send({ data: endpointRows[0] });
  });

  // GET / — list org endpoints with last delivery status
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const endpoints = await db.query.webhookEndpoints.findMany({
      where: eq(schema.webhookEndpoints.orgId, orgId),
      orderBy: [desc(schema.webhookEndpoints.createdAt)],
    });

    // Attach last delivery for each endpoint
    const enriched = await Promise.all(
      endpoints.map(async (ep) => {
        const lastDelivery = await db.query.webhookDeliveries.findFirst({
          where: eq(schema.webhookDeliveries.endpointId, ep.id),
          orderBy: [desc(schema.webhookDeliveries.createdAt)],
          columns: { id: true, event: true, status: true, responseCode: true, createdAt: true },
        });
        return { ...ep, lastDelivery: lastDelivery ?? null };
      }),
    );

    return reply.status(200).send({ data: enriched, meta: { totalCount: enriched.length } });
  });

  // GET /:id — get endpoint with delivery stats
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const endpoint = await db.query.webhookEndpoints.findFirst({
      where: and(eq(schema.webhookEndpoints.id, id), eq(schema.webhookEndpoints.orgId, orgId)),
    });
    if (!endpoint) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [stats] = await db
      .select({
        total: count(),
        success: sql<number>`COUNT(*) FILTER (WHERE ${schema.webhookDeliveries.status} = 'success')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${schema.webhookDeliveries.status} = 'failed')`,
      })
      .from(schema.webhookDeliveries)
      .where(
        and(
          eq(schema.webhookDeliveries.endpointId, id),
          gte(schema.webhookDeliveries.createdAt, sevenDaysAgo),
        ),
      );

    return reply.status(200).send({
      data: {
        ...endpoint,
        stats: {
          last7Days: {
            total: Number(stats?.total ?? 0),
            success: Number(stats?.success ?? 0),
            failed: Number(stats?.failed ?? 0),
          },
        },
      },
    });
  });

  // PATCH /:id — update endpoint
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = updateEndpointSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const existing = await db.query.webhookEndpoints.findFirst({
      where: and(eq(schema.webhookEndpoints.id, id), eq(schema.webhookEndpoints.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const updatePayload: {
      updatedAt: Date;
      url?: string;
      events?: string[];
      status?: 'active' | 'inactive' | 'suspended';
    } = { updatedAt: new Date() };
    if (body.data.url !== undefined) updatePayload.url = body.data.url;
    if (body.data.events !== undefined) updatePayload.events = body.data.events;
    if (body.data.status !== undefined) updatePayload.status = body.data.status;

    const updatedRows = await db
      .update(schema.webhookEndpoints)
      .set(updatePayload)
      .where(and(eq(schema.webhookEndpoints.id, id), eq(schema.webhookEndpoints.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updatedRows[0] });
  });

  // DELETE /:id — delete endpoint and delivery history
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.webhookEndpoints.findFirst({
      where: and(eq(schema.webhookEndpoints.id, id), eq(schema.webhookEndpoints.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    // Deliveries are cascade-deleted by FK constraint
    await db
      .delete(schema.webhookEndpoints)
      .where(and(eq(schema.webhookEndpoints.id, id), eq(schema.webhookEndpoints.orgId, orgId)));

    return reply.status(204).send();
  });

  // POST /:id/test — send a test ping
  app.post('/:id/test', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const endpoint = await db.query.webhookEndpoints.findFirst({
      where: and(eq(schema.webhookEndpoints.id, id), eq(schema.webhookEndpoints.orgId, orgId)),
    });
    if (!endpoint) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const testPayload = { event: 'test.ping', data: { timestamp: new Date().toISOString() } };

    // Create a delivery record for the test ping
    const deliveryRows = await db
      .insert(schema.webhookDeliveries)
      .values({
        endpointId: id,
        event: 'test.ping',
        payload: testPayload,
        status: 'pending',
        nextRetryAt: new Date(),
      })
      .returning();

    const delivery = deliveryRows[0]!;

    // Attempt delivery immediately
    const result = await deliverWebhook(delivery, endpoint);

    await db
      .update(schema.webhookDeliveries)
      .set({
        status: result.success ? 'success' : 'failed',
        responseCode: result.responseCode,
        responseBody: result.responseBody,
        attemptCount: 1,
        nextRetryAt: null,
        deliveredAt: result.success ? new Date() : null,
      })
      .where(eq(schema.webhookDeliveries.id, delivery.id));

    return reply.status(200).send({
      data: {
        deliveryId: delivery.id,
        success: result.success,
        responseCode: result.responseCode,
        responseBody: result.responseBody,
      },
    });
  });

  // GET /:id/deliveries — last 50 deliveries for this endpoint
  app.get('/:id/deliveries', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const endpoint = await db.query.webhookEndpoints.findFirst({
      where: and(eq(schema.webhookEndpoints.id, id), eq(schema.webhookEndpoints.orgId, orgId)),
    });
    if (!endpoint) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const deliveries = await db.query.webhookDeliveries.findMany({
      where: eq(schema.webhookDeliveries.endpointId, id),
      orderBy: [desc(schema.webhookDeliveries.createdAt)],
      limit: 50,
    });

    return reply.status(200).send({ data: deliveries, meta: { totalCount: deliveries.length } });
  });
}
