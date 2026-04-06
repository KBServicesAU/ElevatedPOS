import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const createProgramSchema = z.object({
  name: z.string().min(1).max(255),
  earnRate: z.number().int().min(1).default(10),
  active: z.boolean().default(true),
});

export async function programRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /programs — list programs for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const programs = await db.query.loyaltyPrograms.findMany({
      where: eq(schema.loyaltyPrograms.orgId, orgId),
    });
    return reply.status(200).send({ data: programs });
  });

  // POST /programs — create program
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createProgramSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const [created] = await db
      .insert(schema.loyaltyPrograms)
      .values({ orgId, ...parsed.data })
      .returning();
    return reply.status(201).send({ data: created });
  });

  // GET /programs/:id — get program by id
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const program = await db.query.loyaltyPrograms.findFirst({
      where: and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)),
    });
    if (!program) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Loyalty program ${id} not found`,
      });
    }
    return reply.status(200).send({ data: program });
  });

  // PATCH /programs/:id — update program
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = createProgramSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const existing = await db.query.loyaltyPrograms.findFirst({
      where: and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Loyalty program ${id} not found`,
      });
    }
    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData['name'] = parsed.data.name;
    if (parsed.data.earnRate !== undefined) updateData['earnRate'] = parsed.data.earnRate;
    if (parsed.data.active !== undefined) updateData['active'] = parsed.data.active;
    const [updated] = await db
      .update(schema.loyaltyPrograms)
      .set(updateData)
      .where(and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updated });
  });

  // DELETE /programs/:id — delete program
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const existing = await db.query.loyaltyPrograms.findFirst({
      where: and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Loyalty program ${id} not found`,
      });
    }
    await db
      .delete(schema.loyaltyPrograms)
      .where(and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)));
    return reply.status(204).send();
  });
}
