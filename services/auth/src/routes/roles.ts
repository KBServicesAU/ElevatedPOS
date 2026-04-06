import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, or, isNull } from 'drizzle-orm';
import { db, schema } from '../db';

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.record(z.boolean()).default({}),
});

export async function roleRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const roles = await db.query.roles.findMany({
      where: or(
        eq(schema.roles.orgId, orgId),
        and(isNull(schema.roles.orgId), eq(schema.roles.isSystemRole, true)),
      ),
    });

    return reply.status(200).send({ data: roles });
  });

  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createRoleSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422 });
    }

    const createdRows = await db
      .insert(schema.roles)
      .values({
        orgId,
        name: body.data.name,
        description: body.data.description ?? null,
        permissions: body.data.permissions,
        isSystemRole: false,
      })
      .returning();
    const created = createdRows[0]!;

    return reply.status(201).send({ data: created });
  });

  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = createRoleSchema.partial().safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422 });
    }

    const existing = await db.query.roles.findFirst({
      where: and(eq(schema.roles.id, id), eq(schema.roles.orgId, orgId), eq(schema.roles.isSystemRole, false)),
    });

    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const updatedRows = await db
      .update(schema.roles)
      .set({
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.description !== undefined ? { description: body.data.description } : {}),
        ...(body.data.permissions !== undefined ? { permissions: body.data.permissions } : {}),
      })
      .where(and(eq(schema.roles.id, id), eq(schema.roles.orgId, orgId)))
      .returning();
    const updated = updatedRows[0]!;

    return reply.status(200).send({ data: updated });
  });
}
