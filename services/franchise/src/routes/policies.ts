import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const createPolicySchema = z.object({
  fieldPath: z.string().min(1),
  lockType: z.enum(['locked', 'store_managed', 'hq_default']),
  lockedValue: z.unknown().optional(),
  description: z.string().optional(),
});

export async function policyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /groups/:groupId/policies — list field lock policies
  app.get('/groups/:groupId/policies', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId } = request.params as { groupId: string };
    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }
    const policies = await db.query.fieldLockPolicies.findMany({
      where: eq(schema.fieldLockPolicies.groupId, groupId),
    });
    return reply.status(200).send({ data: policies });
  });

  // POST /groups/:groupId/policies — create/update a field lock policy
  app.post('/groups/:groupId/policies', async (request, reply) => {
    const { orgId, sub: userId } = request.user as { orgId: string; sub: string };
    const { groupId } = request.params as { groupId: string };
    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }
    const parsed = createPolicySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const [created] = await db
      .insert(schema.fieldLockPolicies)
      .values({
        groupId,
        fieldPath: parsed.data.fieldPath,
        lockType: parsed.data.lockType,
        lockedValue: parsed.data.lockedValue ?? null,
        description: parsed.data.description,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .returning();
    return reply.status(201).send({ data: created });
  });

  // DELETE /groups/:groupId/policies/:id — remove policy
  app.delete('/groups/:groupId/policies/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId, id } = request.params as { groupId: string; id: string };
    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }
    const policy = await db.query.fieldLockPolicies.findFirst({
      where: and(eq(schema.fieldLockPolicies.id, id), eq(schema.fieldLockPolicies.groupId, groupId)),
    });
    if (!policy) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Policy ${id} not found`,
      });
    }
    await db
      .delete(schema.fieldLockPolicies)
      .where(and(eq(schema.fieldLockPolicies.id, id), eq(schema.fieldLockPolicies.groupId, groupId)));
    return reply.status(204).send();
  });

  // GET /check-policy?groupId=&fieldPath= — check if a field is locked
  app.get('/check-policy', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { groupId?: string; fieldPath?: string };
    if (!q.groupId || !q.fieldPath) {
      return reply.status(400).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Bad Request',
        status: 400,
        detail: 'groupId and fieldPath query params are required',
      });
    }
    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, q.groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${q.groupId} not found`,
      });
    }
    const policy = await db.query.fieldLockPolicies.findFirst({
      where: and(
        eq(schema.fieldLockPolicies.groupId, q.groupId),
        eq(schema.fieldLockPolicies.fieldPath, q.fieldPath),
      ),
    });
    return reply.status(200).send({
      data: {
        fieldPath: q.fieldPath,
        isLocked: policy?.lockType === 'locked',
        lockType: policy?.lockType ?? null,
        lockedValue: policy?.lockedValue ?? null,
        policy: policy ?? null,
      },
    });
  });
}
