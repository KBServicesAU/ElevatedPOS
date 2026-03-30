import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, lte, gte } from 'drizzle-orm';
import { db, schema } from '../db';

const createLotSchema = z.object({
  locationId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  lotNumber: z.string().min(1),
  supplierId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  expiresAt: z.string().datetime().optional(),
  receivedAt: z.string().datetime().optional(),
  unitCost: z.number().positive().optional(),
  notes: z.string().optional(),
});

const recallLotSchema = z.object({
  notes: z.string().min(1),
});

export async function lotTrackingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /expiring — must be registered before /:id
  app.get('/expiring', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { days?: string };
    const days = Math.max(1, Number(q.days ?? 14));
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const now = new Date();

    const lots = await db.query.lotBatches.findMany({
      where: and(
        eq(schema.lotBatches.orgId, orgId),
        eq(schema.lotBatches.status, 'active'),
        gte(schema.lotBatches.expiresAt, now),
        lte(schema.lotBatches.expiresAt, cutoff),
      ),
      orderBy: [asc(schema.lotBatches.expiresAt)],
    });

    return reply.status(200).send({ data: lots, meta: { totalCount: lots.length, days } });
  });

  // POST / — create lot batch (receiving from PO)
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createLotSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { quantity, expiresAt, receivedAt, unitCost, ...rest } = body.data;

    const [created] = await db
      .insert(schema.lotBatches)
      .values({
        ...rest,
        orgId,
        quantity: String(quantity),
        remainingQty: String(quantity),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
        unitCost: unitCost != null ? String(unitCost) : null,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // GET / — list lots (filter: status, productId, expiresAt range)
  // Active lots are sorted FEFO (First Expired First Out) when filtering by productId
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as {
      status?: string;
      productId?: string;
      expiresAtFrom?: string;
      expiresAtTo?: string;
      limit?: string;
    };

    const limit = Math.min(Number(q.limit ?? 50), 200);

    const lots = await db.query.lotBatches.findMany({
      where: and(
        eq(schema.lotBatches.orgId, orgId),
        q.status
          ? eq(schema.lotBatches.status, q.status as 'active' | 'depleted' | 'recalled' | 'expired')
          : undefined,
        q.productId ? eq(schema.lotBatches.productId, q.productId) : undefined,
        q.expiresAtFrom ? gte(schema.lotBatches.expiresAt, new Date(q.expiresAtFrom)) : undefined,
        q.expiresAtTo ? lte(schema.lotBatches.expiresAt, new Date(q.expiresAtTo)) : undefined,
      ),
      // FEFO: sort by expiresAt ASC (nulls last via desc on null awareness handled by DB)
      orderBy: [asc(schema.lotBatches.expiresAt), desc(schema.lotBatches.createdAt)],
      limit,
    });

    return reply.status(200).send({ data: lots, meta: { totalCount: lots.length } });
  });

  // GET /:id — get lot detail
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const lot = await db.query.lotBatches.findFirst({
      where: and(eq(schema.lotBatches.id, id), eq(schema.lotBatches.orgId, orgId)),
    });

    if (!lot) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: lot });
  });

  // POST /:id/recall — mark lot as recalled
  app.post('/:id/recall', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = recallLotSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.lotBatches.findFirst({
      where: and(eq(schema.lotBatches.id, id), eq(schema.lotBatches.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const [updated] = await db
      .update(schema.lotBatches)
      .set({ status: 'recalled', notes: body.data.notes, updatedAt: new Date() })
      .where(and(eq(schema.lotBatches.id, id), eq(schema.lotBatches.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/deplete — mark as depleted
  app.post('/:id/deplete', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.lotBatches.findFirst({
      where: and(eq(schema.lotBatches.id, id), eq(schema.lotBatches.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const [updated] = await db
      .update(schema.lotBatches)
      .set({ status: 'depleted', remainingQty: '0', updatedAt: new Date() })
      .where(and(eq(schema.lotBatches.id, id), eq(schema.lotBatches.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });
}
