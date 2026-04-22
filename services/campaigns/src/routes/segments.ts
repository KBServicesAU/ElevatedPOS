import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

// v2.7.40 — the dashboard's segment builder uses its own field names
// (`spent_total`, `visit_count`, `last_visit`, `tag`, `city`) and
// operators (`greater_than`, `less_than`, `equals`, `contains`), and
// wraps them in `conditions` instead of `filters`. Before this change
// every "Save Segment" click failed silently because the strict schema
// rejected the shape. We accept both shapes and keep the JSON exactly
// as sent on the `filters` JSONB column so existing mobile clients
// keep working too.
const filterSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

// POS/mobile sends `filters`; dashboard sends `conditions`. Accept either.
// Kept as a plain ZodObject (no .refine()) so .partial() still works for
// the PATCH handler below.
const createSegmentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  filters: z.array(filterSchema).optional(),
  conditions: z.array(filterSchema).optional(),
});


export async function segmentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST / — create segment
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createSegmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    // v2.7.40 — merge the two shapes into the single `filters` column.
    const allFilters = [
      ...(parsed.data.filters ?? []),
      ...(parsed.data.conditions ?? []),
    ];
    const createdRows = await db
      .insert(schema.segments)
      .values({
        orgId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        filters: allFilters as unknown,
      })
      .returning();
    return reply.status(201).send({ data: createdRows[0] });
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
        type: 'https://elevatedpos.com/errors/not-found',
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
        type: 'https://elevatedpos.com/errors/not-found',
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
        type: 'https://elevatedpos.com/errors/not-found',
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
        type: 'https://elevatedpos.com/errors/validation',
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
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Segment ${id} not found`,
      });
    }
    // v2.7.40 — merge both filter shapes for partial updates too.
    const allFilters = [
      ...(parsed.data.filters ?? []),
      ...(parsed.data.conditions ?? []),
    ];
    const updatedRows = await db
      .update(schema.segments)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description ?? null } : {}),
        ...(allFilters.length > 0 ? { filters: allFilters as unknown } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.segments.id, id), eq(schema.segments.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updatedRows[0] });
  });

  // DELETE /:id — delete segment
  // v2.7.40 — added to support the dashboard's "Delete Segment" action.
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const existing = await db.query.segments.findFirst({
      where: and(eq(schema.segments.id, id), eq(schema.segments.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Segment ${id} not found`,
      });
    }
    await db
      .delete(schema.segments)
      .where(and(eq(schema.segments.id, id), eq(schema.segments.orgId, orgId)));
    return reply.status(204).send();
  });
}
