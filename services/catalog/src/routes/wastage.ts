import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db';

const createWastageSchema = z.object({
  locationId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  recipeId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  reason: z.enum(['over_production', 'spoilage', 'damage', 'expiry', 'other']),
  estimatedCost: z.number().min(0).optional(),
  notes: z.string().optional(),
  recordedAt: z.string().datetime({ offset: true }).optional(),
});

export async function wastageRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/wastage/summary — summary by product/reason/period (group by + sum)
  app.get('/summary', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { from?: string; to?: string; locationId?: string };

    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = q.to ? new Date(q.to) : new Date();

    const events = await db.query.wastageEvents.findMany({
      where: and(
        eq(schema.wastageEvents.orgId, orgId),
        gte(schema.wastageEvents.recordedAt, from),
        lte(schema.wastageEvents.recordedAt, to),
        q.locationId ? eq(schema.wastageEvents.locationId, q.locationId) : undefined,
      ),
      orderBy: [desc(schema.wastageEvents.recordedAt)],
    });

    // Group by productId + reason
    const grouped: Record<string, { productId: string | null; reason: string; totalQuantity: number; totalCost: number; count: number }> = {};
    for (const e of events) {
      const key = `${e.productId ?? 'none'}__${e.reason}`;
      if (!grouped[key]) {
        grouped[key] = { productId: e.productId, reason: e.reason, totalQuantity: 0, totalCost: 0, count: 0 };
      }
      grouped[key].totalQuantity += Number(e.quantity);
      grouped[key].totalCost += Number(e.estimatedCost ?? 0);
      grouped[key].count += 1;
    }

    return reply.status(200).send({
      data: Object.values(grouped),
      meta: { from: from.toISOString(), to: to.toISOString(), totalEvents: events.length },
    });
  });

  // GET /api/v1/wastage/report — full wastage report for a period
  app.get('/report', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { from?: string; to?: string; locationId?: string };

    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = q.to ? new Date(q.to) : new Date();

    const events = await db.query.wastageEvents.findMany({
      where: and(
        eq(schema.wastageEvents.orgId, orgId),
        gte(schema.wastageEvents.recordedAt, from),
        lte(schema.wastageEvents.recordedAt, to),
        q.locationId ? eq(schema.wastageEvents.locationId, q.locationId) : undefined,
      ),
      orderBy: [desc(schema.wastageEvents.recordedAt)],
    });

    const totalQuantity = events.reduce((sum, e) => sum + Number(e.quantity), 0);
    const totalCost = events.reduce((sum, e) => sum + Number(e.estimatedCost ?? 0), 0);

    // Breakdown by reason
    const byReason: Record<string, { count: number; totalQuantity: number; totalCost: number }> = {};
    for (const e of events) {
      if (!byReason[e.reason]) byReason[e.reason] = { count: 0, totalQuantity: 0, totalCost: 0 };
      byReason[e.reason].count += 1;
      byReason[e.reason].totalQuantity += Number(e.quantity);
      byReason[e.reason].totalCost += Number(e.estimatedCost ?? 0);
    }

    // Breakdown by product
    const byProduct: Record<string, { productId: string | null; count: number; totalQuantity: number; totalCost: number }> = {};
    for (const e of events) {
      const key = e.productId ?? 'unknown';
      if (!byProduct[key]) byProduct[key] = { productId: e.productId, count: 0, totalQuantity: 0, totalCost: 0 };
      byProduct[key].count += 1;
      byProduct[key].totalQuantity += Number(e.quantity);
      byProduct[key].totalCost += Number(e.estimatedCost ?? 0);
    }

    return reply.status(200).send({
      data: {
        events,
        summary: { totalEvents: events.length, totalQuantity, totalCost },
        byReason,
        byProduct,
      },
      meta: { from: from.toISOString(), to: to.toISOString() },
    });
  });

  // POST /api/v1/wastage — log wastage event
  app.post('/', async (request, reply) => {
    const { orgId, sub: recordedBy } = request.user as { orgId: string; sub: string };
    const body = createWastageSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const [created] = await db.insert(schema.wastageEvents).values({
      orgId,
      locationId: body.data.locationId,
      productId: body.data.productId,
      recipeId: body.data.recipeId,
      quantity: String(body.data.quantity),
      unit: body.data.unit,
      reason: body.data.reason,
      estimatedCost: body.data.estimatedCost !== undefined ? String(body.data.estimatedCost) : undefined,
      recordedBy,
      notes: body.data.notes,
      recordedAt: body.data.recordedAt ? new Date(body.data.recordedAt) : new Date(),
    }).returning();

    return reply.status(201).send({ data: created });
  });

  // GET /api/v1/wastage — list wastage events
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as {
      productId?: string;
      locationId?: string;
      from?: string;
      to?: string;
      reason?: string;
      limit?: string;
    };
    const limit = Math.min(Number(q.limit ?? 50), 200);

    const results = await db.query.wastageEvents.findMany({
      where: and(
        eq(schema.wastageEvents.orgId, orgId),
        q.productId ? eq(schema.wastageEvents.productId, q.productId) : undefined,
        q.locationId ? eq(schema.wastageEvents.locationId, q.locationId) : undefined,
        q.reason ? eq(schema.wastageEvents.reason, q.reason as 'over_production' | 'spoilage' | 'damage' | 'expiry' | 'other') : undefined,
        q.from ? gte(schema.wastageEvents.recordedAt, new Date(q.from)) : undefined,
        q.to ? lte(schema.wastageEvents.recordedAt, new Date(q.to)) : undefined,
      ),
      orderBy: [desc(schema.wastageEvents.recordedAt)],
      limit,
    });

    return reply.status(200).send({ data: results, meta: { totalCount: results.length, hasMore: results.length === limit } });
  });
}
