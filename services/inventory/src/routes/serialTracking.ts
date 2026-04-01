import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const receiveSerialSchema = z.object({
  locationId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  serials: z.array(z.string().min(1)).min(1),
  purchaseOrderId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const sellSerialSchema = z.object({
  orderId: z.string().uuid(),
});

const returnSerialSchema = z.object({
  locationId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export async function serialTrackingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /receive — receive serial numbers (array of serials, PO reference)
  app.post('/receive', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = receiveSerialSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { locationId, productId, variantId, serials, purchaseOrderId, notes } = body.data;

    const rows = serials.map((serialNumber) => ({
      orgId,
      locationId,
      productId,
      serialNumber,
      status: 'in_stock' as const,
      ...(variantId !== undefined ? { variantId } : {}),
      ...(purchaseOrderId !== undefined ? { purchaseOrderId } : {}),
      ...(notes !== undefined ? { notes } : {}),
    }));

    const created = await db
      .insert(schema.serialNumbers)
      .values(rows)
      .returning();

    return reply.status(201).send({ data: created, meta: { count: created.length } });
  });

  // GET / — list serials (filter: status, productId, locationId)
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { status?: string; productId?: string; locationId?: string; limit?: string };

    const limit = Math.min(Number(q.limit ?? 50), 200);

    const items = await db.query.serialNumbers.findMany({
      where: and(
        eq(schema.serialNumbers.orgId, orgId),
        q.status
          ? eq(schema.serialNumbers.status, q.status as 'in_stock' | 'sold' | 'returned' | 'scrapped')
          : undefined,
        q.productId ? eq(schema.serialNumbers.productId, q.productId) : undefined,
        q.locationId ? eq(schema.serialNumbers.locationId, q.locationId) : undefined,
      ),
      orderBy: [desc(schema.serialNumbers.receivedAt)],
      limit,
    });

    return reply.status(200).send({ data: items, meta: { totalCount: items.length } });
  });

  // GET /:serial — look up serial number (full chain of custody)
  app.get('/:serial', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { serial } = request.params as { serial: string };

    const item = await db.query.serialNumbers.findFirst({
      where: and(
        eq(schema.serialNumbers.orgId, orgId),
        eq(schema.serialNumbers.serialNumber, serial),
      ),
    });

    if (!item) return reply.status(404).send({ title: 'Not Found', status: 404 });

    // Chain of custody summary derived from the record fields
    const chainOfCustody = [
      { event: 'received', at: item.receivedAt, purchaseOrderId: item.purchaseOrderId },
      ...(item.soldAt ? [{ event: 'sold', at: item.soldAt, orderId: item.orderId }] : []),
      ...(item.status === 'returned' ? [{ event: 'returned', at: null }] : []),
      ...(item.status === 'scrapped' ? [{ event: 'scrapped', at: null }] : []),
    ];

    return reply.status(200).send({ data: { ...item, chainOfCustody } });
  });

  // POST /:serial/sell — mark as sold
  app.post('/:serial/sell', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { serial } = request.params as { serial: string };
    const body = sellSerialSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.serialNumbers.findFirst({
      where: and(
        eq(schema.serialNumbers.orgId, orgId),
        eq(schema.serialNumbers.serialNumber, serial),
      ),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (existing.status !== 'in_stock') {
      return reply.status(409).send({
        title: 'Conflict',
        status: 409,
        detail: `Serial is in status '${existing.status}', cannot sell`,
      });
    }

    const now = new Date();
    const [updated] = await db
      .update(schema.serialNumbers)
      .set({ status: 'sold', orderId: body.data.orderId, soldAt: now })
      .where(and(eq(schema.serialNumbers.orgId, orgId), eq(schema.serialNumbers.serialNumber, serial)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:serial/return — mark as returned
  app.post('/:serial/return', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { serial } = request.params as { serial: string };
    const body = returnSerialSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.serialNumbers.findFirst({
      where: and(
        eq(schema.serialNumbers.orgId, orgId),
        eq(schema.serialNumbers.serialNumber, serial),
      ),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (existing.status !== 'sold') {
      return reply.status(409).send({
        title: 'Conflict',
        status: 409,
        detail: `Serial is in status '${existing.status}', cannot return`,
      });
    }

    const updateData: Record<string, unknown> = { status: 'returned' };
    if (body.data.locationId) updateData['locationId'] = body.data.locationId;
    if (body.data.notes) updateData['notes'] = body.data.notes;

    const [updated] = await db
      .update(schema.serialNumbers)
      .set(updateData)
      .where(and(eq(schema.serialNumbers.orgId, orgId), eq(schema.serialNumbers.serialNumber, serial)))
      .returning();

    return reply.status(200).send({ data: updated });
  });
}
