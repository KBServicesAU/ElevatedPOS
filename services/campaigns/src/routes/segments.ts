import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const filterSchema = z.object({
  field: z.enum([
    'totalSpend',
    'lastVisitDays',
    'visitCount',
    'averageOrderValue',
    'loyaltyPoints',
    'city',
    'country',
    'tag',
  ]),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

const createSegmentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  filters: z.array(filterSchema).min(1),
});

/**
 * Applies segment filters against a plain customer object for in-memory estimation.
 * In production this would push down to a SQL query against the customers DB.
 */
function matchesFilters(
  customer: Record<string, unknown>,
  filters: z.infer<typeof filterSchema>[],
): boolean {
  for (const f of filters) {
    const raw = customer[f.field];
    const val = f.value;
    switch (f.operator) {
      case 'eq':
        if (raw !== val) return false;
        break;
      case 'neq':
        if (raw === val) return false;
        break;
      case 'gt':
        if (typeof raw !== 'number' || typeof val !== 'number' || raw <= val) return false;
        break;
      case 'gte':
        if (typeof raw !== 'number' || typeof val !== 'number' || raw < val) return false;
        break;
      case 'lt':
        if (typeof raw !== 'number' || typeof val !== 'number' || raw >= val) return false;
        break;
      case 'lte':
        if (typeof raw !== 'number' || typeof val !== 'number' || raw > val) return false;
        break;
      case 'contains':
        if (typeof raw !== 'string' || typeof val !== 'string' || !raw.includes(val)) return false;
        break;
      case 'in':
        if (!Array.isArray(val) || !val.includes(String(raw))) return false;
        break;
    }
  }
  return true;
}

export async function segmentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST / — create segment
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createSegmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const [created] = await db
      .insert(schema.segments)
      .values({ orgId, ...parsed.data, filters: parsed.data.filters })
      .returning();
    return reply.status(201).send({ data: created });
  });

  // GET / — list segments for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const results = await db.query.segments.findMany({
      where: eq(schema.segments.orgId, orgId),
    });
    return reply.status(200).send({ data: results });
  });

  // GET /:id — segment detail with estimated size
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const segment = await db.query.segments.findFirst({
      where: and(eq(schema.segments.id, id), eq(schema.segments.orgId, orgId)),
    });
    if (!segment) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Segment ${id} not found`,
      });
    }
    // Return segment with a placeholder estimated size — real estimation is via POST /:id/estimate
    return reply.status(200).send({ data: { ...segment, estimatedCount: null } });
  });

  // POST /:id/estimate — run filter logic and return estimated customer count
  app.post('/:id/estimate', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const segment = await db.query.segments.findFirst({
      where: and(eq(schema.segments.id, id), eq(schema.segments.orgId, orgId)),
    });
    if (!segment) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Segment ${id} not found`,
      });
    }

    // In production this would query the customers service or DB directly.
    // Here we return a deterministic mock estimate based on filter complexity
    // so the endpoint is functional without a cross-service DB dependency.
    const filters = segment.filters as z.infer<typeof filterSchema>[];
    const baseCount = 1000;
    const reductionFactor = Math.pow(0.6, filters.length);
    const estimatedCount = Math.max(1, Math.round(baseCount * reductionFactor));

    return reply.status(200).send({ data: { estimatedCount } });
  });

  // POST /:id/export — return up to 1000 matching customer IDs
  app.post('/:id/export', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const segment = await db.query.segments.findFirst({
      where: and(eq(schema.segments.id, id), eq(schema.segments.orgId, orgId)),
    });
    if (!segment) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Segment ${id} not found`,
      });
    }

    // In production this would query the customers service with the filter criteria.
    // We return an empty list here as a safe stub — real implementation would
    // translate segment.filters into a SQL WHERE clause against the customers table.
    const customerIds: string[] = [];

    return reply.status(200).send({
      data: {
        segmentId: id,
        customerIds,
        count: customerIds.length,
        truncated: false,
      },
    });
  });

  // PATCH /:id — update segment
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = createSegmentSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const existing = await db.query.segments.findFirst({
      where: and(eq(schema.segments.id, id), eq(schema.segments.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Segment ${id} not found`,
      });
    }
    const [updated] = await db
      .update(schema.segments)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(schema.segments.id, id), eq(schema.segments.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updated });
  });
}
