import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';

const createGroupSchema = z.object({
  name: z.string().min(1),
  selectionType: z.enum(['single', 'multiple']).default('single'),
  required: z.boolean().default(false),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(1).default(1),
  sortOrder: z.number().int().default(0),
  options: z.array(z.object({
    name: z.string().min(1),
    priceAdjustment: z.number().default(0),
    isDefault: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
  })).default([]),
});

export async function modifierRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/groups', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const groups = await db.query.modifierGroups.findMany({
      where: and(eq(schema.modifierGroups.orgId, orgId), eq(schema.modifierGroups.isActive, true)),
      with: { options: { orderBy: [schema.modifierOptions.sortOrder] } },
    });
    return reply.status(200).send({ data: groups });
  });

  app.post('/groups', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createGroupSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const { options, ...groupData } = body.data;
    const [group] = await db.insert(schema.modifierGroups).values({ ...groupData, orgId }).returning();

    if (options.length > 0) {
      await db.insert(schema.modifierOptions).values(options.map((o) => ({ ...o, groupId: group.id })));
    }

    const created = await db.query.modifierGroups.findFirst({
      where: eq(schema.modifierGroups.id, group.id),
      with: { options: true },
    });

    return reply.status(201).send({ data: created });
  });

  app.delete('/groups/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db.update(schema.modifierGroups).set({ isActive: false }).where(and(eq(schema.modifierGroups.id, id), eq(schema.modifierGroups.orgId, orgId)));
    return reply.status(204).send();
  });
}
