import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, lte, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const createEventSchema = z.object({
  name: z.string().min(1).max(255),
  multiplier: z.number().positive().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday. Empty array means every day.
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  productIds: z.array(z.string()).nullable().default(null),
  categoryIds: z.array(z.string()).nullable().default(null),
  isActive: z.boolean().default(true),
});

export async function multiplierEventRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST / — create a new multiplier event
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    if (parsed.data.startDate > parsed.data.endDate) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: 'startDate must be before or equal to endDate',
      });
    }
    const [created] = await db
      .insert(schema.pointsMultiplierEvents)
      .values({
        orgId,
        name: parsed.data.name,
        multiplier: String(parsed.data.multiplier),
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        daysOfWeek: parsed.data.daysOfWeek,
        productIds: parsed.data.productIds,
        categoryIds: parsed.data.categoryIds,
        isActive: parsed.data.isActive,
      })
      .returning();
    return reply.status(201).send({ data: created });
  });

  // GET / — list multiplier events, filterable by isActive
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { isActive?: string };

    const conditions = [eq(schema.pointsMultiplierEvents.orgId, orgId)];
    if (q.isActive !== undefined) {
      conditions.push(eq(schema.pointsMultiplierEvents.isActive, q.isActive === 'true'));
    }

    const events = await db.query.pointsMultiplierEvents.findMany({
      where: and(...conditions),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    return reply.status(200).send({ data: events });
  });

  // GET /active — returns currently active multipliers for today
  // checks date range AND day of week
  app.get('/active', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
    const todayDow = today.getDay(); // 0 = Sunday

    // Fetch all events that are active, and whose date range covers today
    const candidates = await db.query.pointsMultiplierEvents.findMany({
      where: and(
        eq(schema.pointsMultiplierEvents.orgId, orgId),
        eq(schema.pointsMultiplierEvents.isActive, true),
        lte(schema.pointsMultiplierEvents.startDate, todayStr),
        gte(schema.pointsMultiplierEvents.endDate, todayStr),
      ),
    });

    // Filter by day of week in application code (JSON column)
    const active = candidates.filter((evt) => {
      const dows = (evt.daysOfWeek ?? []) as number[];
      // empty array means every day
      return dows.length === 0 || dows.includes(todayDow);
    });

    return reply.status(200).send({ data: active });
  });

  // PATCH /:id — update a multiplier event
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = createEventSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const existing = await db.query.pointsMultiplierEvents.findFirst({
      where: and(
        eq(schema.pointsMultiplierEvents.id, id),
        eq(schema.pointsMultiplierEvents.orgId, orgId),
      ),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Multiplier event ${id} not found`,
      });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.multiplier !== undefined) updateData.multiplier = String(parsed.data.multiplier);
    if (parsed.data.startDate !== undefined) updateData.startDate = parsed.data.startDate;
    if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate;
    if (parsed.data.daysOfWeek !== undefined) updateData.daysOfWeek = parsed.data.daysOfWeek;
    if (parsed.data.productIds !== undefined) updateData.productIds = parsed.data.productIds;
    if (parsed.data.categoryIds !== undefined) updateData.categoryIds = parsed.data.categoryIds;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

    const [updated] = await db
      .update(schema.pointsMultiplierEvents)
      .set(updateData)
      .where(
        and(
          eq(schema.pointsMultiplierEvents.id, id),
          eq(schema.pointsMultiplierEvents.orgId, orgId),
        ),
      )
      .returning();
    return reply.status(200).send({ data: updated });
  });

  // DELETE /:id — deactivate (soft delete) a multiplier event
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.pointsMultiplierEvents.findFirst({
      where: and(
        eq(schema.pointsMultiplierEvents.id, id),
        eq(schema.pointsMultiplierEvents.orgId, orgId),
      ),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Multiplier event ${id} not found`,
      });
    }

    await db
      .update(schema.pointsMultiplierEvents)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(schema.pointsMultiplierEvents.id, id),
          eq(schema.pointsMultiplierEvents.orgId, orgId),
        ),
      );
    return reply.status(204).send();
  });
}
