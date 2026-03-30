import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const createFulfillmentSchema = z.object({
  orderId: z.string().uuid(),
  type: z.enum(['click_and_collect', 'ship_from_store', 'endless_aisle']),
  sourceLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const assignSchema = z.object({
  fulfillmentId: z.string().uuid(),
  employeeId: z.string().uuid(),
});

const clickAndCollectSchema = z.object({
  orderId: z.string().uuid(),
  pickupLocationId: z.string().uuid(),
  estimatedPickupAt: z.string().datetime().optional(),
});

export async function fulfillmentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /api/v1/fulfillment/click-and-collect — create a click-and-collect fulfillment request
  app.post('/click-and-collect', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = clickAndCollectSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, body.data.orderId), eq(schema.orders.orgId, orgId)),
    });
    if (!order) return reply.status(404).send({ title: 'Order Not Found', status: 404 });

    const [created] = await db
      .insert(schema.fulfillmentRequests)
      .values({
        orgId,
        orderId: body.data.orderId,
        type: 'click_and_collect',
        sourceLocationId: body.data.pickupLocationId,
        notes: body.data.estimatedPickupAt
          ? `Estimated pickup: ${body.data.estimatedPickupAt}`
          : undefined,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // GET /api/v1/fulfillment/collect-queue — orders ready for collection at a location
  app.get('/collect-queue', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { locationId?: string };

    if (!q.locationId) {
      return reply.status(400).send({ title: 'Bad Request', status: 400, detail: 'locationId is required' });
    }

    const results = await db.query.fulfillmentRequests.findMany({
      where: and(
        eq(schema.fulfillmentRequests.orgId, orgId),
        eq(schema.fulfillmentRequests.status, 'ready'),
        eq(schema.fulfillmentRequests.sourceLocationId, q.locationId),
      ),
      orderBy: [desc(schema.fulfillmentRequests.readyAt)],
    });

    return reply.status(200).send({ data: results, meta: { totalCount: results.length } });
  });

  // POST /api/v1/fulfillment/assign — assign fulfillment to employee
  app.post('/assign', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = assignSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(
        eq(schema.fulfillmentRequests.id, body.data.fulfillmentId),
        eq(schema.fulfillmentRequests.orgId, orgId),
      ),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const [updated] = await db
      .update(schema.fulfillmentRequests)
      .set({ assignedToEmployeeId: body.data.employeeId, updatedAt: new Date() })
      .where(and(eq(schema.fulfillmentRequests.id, body.data.fulfillmentId), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/fulfillment — create a fulfillment request for an order
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createFulfillmentSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    // Verify the order belongs to this org
    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, body.data.orderId), eq(schema.orders.orgId, orgId)),
    });
    if (!order) return reply.status(404).send({ title: 'Order Not Found', status: 404 });

    const [created] = await db
      .insert(schema.fulfillmentRequests)
      .values({ ...body.data, orgId })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // GET /api/v1/fulfillment — list fulfillment requests
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as {
      type?: string;
      status?: string;
      sourceLocationId?: string;
      assignedToEmployeeId?: string;
      limit?: string;
    };
    const limit = Math.min(Number(q.limit ?? 50), 200);

    const results = await db.query.fulfillmentRequests.findMany({
      where: and(
        eq(schema.fulfillmentRequests.orgId, orgId),
        q.type ? eq(schema.fulfillmentRequests.type, q.type as 'click_and_collect' | 'ship_from_store' | 'endless_aisle') : undefined,
        q.status ? eq(schema.fulfillmentRequests.status, q.status as 'pending' | 'picked' | 'packed' | 'ready' | 'dispatched' | 'collected' | 'cancelled') : undefined,
        q.sourceLocationId ? eq(schema.fulfillmentRequests.sourceLocationId, q.sourceLocationId) : undefined,
        q.assignedToEmployeeId ? eq(schema.fulfillmentRequests.assignedToEmployeeId, q.assignedToEmployeeId) : undefined,
      ),
      orderBy: [desc(schema.fulfillmentRequests.createdAt)],
      limit,
    });

    return reply.status(200).send({ data: results, meta: { totalCount: results.length, hasMore: results.length === limit } });
  });

  // GET /api/v1/fulfillment/:id — get fulfillment detail
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const result = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });

    if (!result) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: result });
  });

  // POST /api/v1/fulfillment/:id/pick — mark as picked
  app.post('/:id/pick', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (existing.status !== 'pending') {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot pick from status '${existing.status}'` });
    }

    const [updated] = await db
      .update(schema.fulfillmentRequests)
      .set({ status: 'picked', pickedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/fulfillment/:id/pack — mark as packed
  app.post('/:id/pack', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (existing.status !== 'picked') {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot pack from status '${existing.status}'` });
    }

    const [updated] = await db
      .update(schema.fulfillmentRequests)
      .set({ status: 'packed', packedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/fulfillment/:id/ready — mark ready for collection
  app.post('/:id/ready', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (existing.status !== 'packed') {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot mark ready from status '${existing.status}'` });
    }

    const now = new Date();
    const [updated] = await db
      .update(schema.fulfillmentRequests)
      .set({ status: 'ready', readyAt: now, customerNotifiedAt: now, updatedAt: now })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/fulfillment/:id/dispatch — mark dispatched
  app.post('/:id/dispatch', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({
      trackingNumber: z.string().optional(),
      shippingCarrier: z.string().optional(),
      shippingLabel: z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!['packed', 'ready'].includes(existing.status)) {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot dispatch from status '${existing.status}'` });
    }

    const [updated] = await db
      .update(schema.fulfillmentRequests)
      .set({
        status: 'dispatched',
        dispatchedAt: new Date(),
        trackingNumber: body.data.trackingNumber ?? existing.trackingNumber,
        shippingCarrier: body.data.shippingCarrier ?? existing.shippingCarrier,
        shippingLabel: body.data.shippingLabel ?? existing.shippingLabel,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/fulfillment/:id/collect — mark collected/delivered
  app.post('/:id/collect', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!['ready', 'dispatched'].includes(existing.status)) {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot collect from status '${existing.status}'` });
    }

    const [updated] = await db
      .update(schema.fulfillmentRequests)
      .set({ status: 'collected', collectedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/fulfillment/:id/cancel — cancel
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().optional() }).safeParse(request.body ?? {});

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (['collected', 'cancelled'].includes(existing.status)) {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot cancel from status '${existing.status}'` });
    }

    const [updated] = await db
      .update(schema.fulfillmentRequests)
      .set({
        status: 'cancelled',
        notes: body.success && body.data.reason ? body.data.reason : existing.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });
}
