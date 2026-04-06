import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, lte, gte, or } from 'drizzle-orm';
import { db, schema } from '../db';

const createMarkdownSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scope: z.enum(['product', 'category', 'all']),
  targetId: z.string().uuid().optional(),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive(),
  startsAt: z.string().min(1),
  endsAt: z.string().nullable().optional(),
  isClearance: z.boolean().default(false),
  isRecurring: z.boolean().optional(),
  recurringDays: z.array(z.string()).optional(),
  recurringStartTime: z.string().optional(),
  recurringEndTime: z.string().optional(),
});

const updateMarkdownSchema = createMarkdownSchema.partial();

export async function markdownRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /active — must be registered before /:id to avoid route conflict
  app.get('/active', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const now = new Date();

    const active = await db.query.markdowns.findMany({
      where: and(
        eq(schema.markdowns.orgId, orgId),
        eq(schema.markdowns.isActive, true),
        lte(schema.markdowns.startsAt, now),
        or(
          eq(schema.markdowns.endsAt, null as unknown as Date),
          gte(schema.markdowns.endsAt, now),
        ),
      ),
      orderBy: [desc(schema.markdowns.startsAt)],
    });

    return reply.status(200).send({ data: active, meta: { totalCount: active.length } });
  });

  // POST / — schedule markdown
  app.post('/', async (request, reply) => {
    const { orgId, sub: userId } = request.user as { orgId: string; sub: string };
    const body = createMarkdownSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const {
      startsAt,
      endsAt,
      discountValue,
      targetId: rawTargetId,
      // Strip fields that are not in the DB schema
      description: _desc,
      isRecurring: _isRec,
      recurringDays: _recDays,
      recurringStartTime: _recStart,
      recurringEndTime: _recEnd,
      ...rest
    } = body.data;

    const [created] = await db
      .insert(schema.markdowns)
      .values({
        ...rest,
        orgId,
        createdBy: userId,
        targetId: rawTargetId ?? null,
        discountValue: String(discountValue),
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // GET / — list markdowns (filter: isActive, scope)
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { isActive?: string; scope?: string };

    const markdowns = await db.query.markdowns.findMany({
      where: and(
        eq(schema.markdowns.orgId, orgId),
        q.isActive !== undefined
          ? eq(schema.markdowns.isActive, q.isActive === 'true')
          : undefined,
        q.scope
          ? eq(schema.markdowns.scope, q.scope as 'product' | 'category' | 'all')
          : undefined,
      ),
      orderBy: [desc(schema.markdowns.createdAt)],
    });

    return reply.status(200).send({ data: markdowns, meta: { totalCount: markdowns.length } });
  });

  // GET /:id — get markdown
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const markdown = await db.query.markdowns.findFirst({
      where: and(eq(schema.markdowns.id, id), eq(schema.markdowns.orgId, orgId)),
    });

    if (!markdown) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: markdown });
  });

  // PATCH /:id — update (extend, change discount)
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = updateMarkdownSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.markdowns.findFirst({
      where: and(eq(schema.markdowns.id, id), eq(schema.markdowns.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const { startsAt, endsAt, discountValue, ...rest } = body.data;
    const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (startsAt !== undefined) updateData['startsAt'] = new Date(startsAt);
    if (endsAt !== undefined) updateData['endsAt'] = endsAt ? new Date(endsAt) : null;
    if (discountValue !== undefined) updateData['discountValue'] = String(discountValue);

    type MarkdownUpdate = typeof schema.markdowns.$inferInsert;
    const [updated] = await db
      .update(schema.markdowns)
      .set(updateData as unknown as MarkdownUpdate)
      .where(and(eq(schema.markdowns.id, id), eq(schema.markdowns.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // DELETE /:id — cancel/deactivate
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.markdowns.findFirst({
      where: and(eq(schema.markdowns.id, id), eq(schema.markdowns.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    await db
      .update(schema.markdowns)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.markdowns.id, id), eq(schema.markdowns.orgId, orgId)));

    return reply.status(204).send();
  });

  // POST /:id/activate — manually activate now
  app.post('/:id/activate', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.markdowns.findFirst({
      where: and(eq(schema.markdowns.id, id), eq(schema.markdowns.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const now = new Date();
    const [updated] = await db
      .update(schema.markdowns)
      .set({ isActive: true, startsAt: now, updatedAt: now })
      .where(and(eq(schema.markdowns.id, id), eq(schema.markdowns.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/deactivate — deactivate a markdown (frontend uses this endpoint)
  app.post('/:id/deactivate', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.markdowns.findFirst({
      where: and(eq(schema.markdowns.id, id), eq(schema.markdowns.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const [updated] = await db
      .update(schema.markdowns)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.markdowns.id, id), eq(schema.markdowns.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });
}
