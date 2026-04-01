import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { db, schema } from '../db';

const ruleSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

const createGroupSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().optional(),
  isAutomatic: z.boolean().default(false),
  rules: z.array(ruleSchema).optional().default([]),
});

/** Evaluate a single rule against a customer record */
function matchesRule(customer: Record<string, unknown>, rule: z.infer<typeof ruleSchema>): boolean {
  const val = customer[rule.field];
  const rv = rule.value;
  switch (rule.operator) {
    case 'eq':   return val == rv;
    case 'neq':  return val != rv;
    case 'gt':   return Number(val) > Number(rv);
    case 'gte':  return Number(val) >= Number(rv);
    case 'lt':   return Number(val) < Number(rv);
    case 'lte':  return Number(val) <= Number(rv);
    case 'contains':
      return typeof val === 'string' && val.toLowerCase().includes(String(rv).toLowerCase());
    case 'in':
      return Array.isArray(rv) && rv.includes(String(val));
    default:
      return false;
  }
}

export async function groupRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST / — create group
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createGroupSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const [group] = await db
      .insert(schema.customerGroups)
      .values({
        orgId,
        name: body.data.name,
        ...(body.data.description !== undefined ? { description: body.data.description } : {}),
        isAutomatic: body.data.isAutomatic,
        rules: body.data.rules,
      })
      .returning();

    return reply.status(201).send({ data: group });
  });

  // GET / — list groups with member count
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const groups = await db.query.customerGroups.findMany({
      where: eq(schema.customerGroups.orgId, orgId),
      orderBy: (g, { desc }) => [desc(g.createdAt)],
    });
    return reply.status(200).send({ data: groups });
  });

  // GET /:id — group detail with paginated members
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const q = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);

    const group = await db.query.customerGroups.findFirst({
      where: and(eq(schema.customerGroups.id, id), eq(schema.customerGroups.orgId, orgId)),
    });
    if (!group) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const memberRows = await db.query.customerGroupMembers.findMany({
      where: and(
        eq(schema.customerGroupMembers.groupId, id),
        eq(schema.customerGroupMembers.orgId, orgId),
      ),
      with: { customer: true },
      limit,
      offset,
    });

    const members = memberRows.map((m) => m.customer);
    return reply.status(200).send({
      data: group,
      members,
      meta: { total: group.memberCount, limit, offset },
    });
  });

  // POST /:id/members — add customers to manual group
  app.post('/:id/members', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({ customerIds: z.array(z.string().uuid()).min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const group = await db.query.customerGroups.findFirst({
      where: and(eq(schema.customerGroups.id, id), eq(schema.customerGroups.orgId, orgId)),
    });
    if (!group) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (group.isAutomatic) {
      return reply.status(422).send({ title: 'Cannot manually add to automatic group', status: 422 });
    }

    // Insert members, ignore conflicts (already in group)
    const rows = body.data.customerIds.map((customerId) => ({ groupId: id, customerId, orgId }));
    await db.insert(schema.customerGroupMembers).values(rows).onConflictDoNothing();

    // Update member count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.customerGroupMembers)
      .where(eq(schema.customerGroupMembers.groupId, id));
    const count = countResult[0]?.count ?? 0;

    await db
      .update(schema.customerGroups)
      .set({ memberCount: Number(count), updatedAt: new Date() })
      .where(eq(schema.customerGroups.id, id));

    return reply.status(200).send({ data: { added: body.data.customerIds.length, memberCount: Number(count) } });
  });

  // DELETE /:id/members/:customerId — remove from group
  app.delete('/:id/members/:customerId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id, customerId } = request.params as { id: string; customerId: string };

    const group = await db.query.customerGroups.findFirst({
      where: and(eq(schema.customerGroups.id, id), eq(schema.customerGroups.orgId, orgId)),
    });
    if (!group) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (group.isAutomatic) {
      return reply.status(422).send({ title: 'Cannot manually remove from automatic group', status: 422 });
    }

    await db
      .delete(schema.customerGroupMembers)
      .where(
        and(
          eq(schema.customerGroupMembers.groupId, id),
          eq(schema.customerGroupMembers.customerId, customerId),
          eq(schema.customerGroupMembers.orgId, orgId),
        ),
      );

    const deleteCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.customerGroupMembers)
      .where(eq(schema.customerGroupMembers.groupId, id));
    const count = deleteCountResult[0]?.count ?? 0;

    await db
      .update(schema.customerGroups)
      .set({ memberCount: Number(count), updatedAt: new Date() })
      .where(eq(schema.customerGroups.id, id));

    return reply.status(204).send();
  });

  // POST /:id/compute — recompute automatic group membership
  app.post('/:id/compute', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const group = await db.query.customerGroups.findFirst({
      where: and(eq(schema.customerGroups.id, id), eq(schema.customerGroups.orgId, orgId)),
    });
    if (!group) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!group.isAutomatic) {
      return reply.status(422).send({ title: 'Group is not automatic', status: 422 });
    }

    const rules = (group.rules as Array<z.infer<typeof ruleSchema>>) ?? [];

    // Fetch all non-deleted customers for this org
    const allCustomers = await db.query.customers.findMany({
      where: and(eq(schema.customers.orgId, orgId), eq(schema.customers.gdprDeleted, false)),
    });

    // Filter customers matching ALL rules
    const matching = allCustomers.filter((c) =>
      rules.every((rule) => matchesRule(c as unknown as Record<string, unknown>, rule)),
    );

    const matchingIds = matching.map((c) => c.id);

    // Replace all memberships for this group
    await db
      .delete(schema.customerGroupMembers)
      .where(eq(schema.customerGroupMembers.groupId, id));

    if (matchingIds.length > 0) {
      const rows = matchingIds.map((customerId) => ({ groupId: id, customerId, orgId }));
      await db.insert(schema.customerGroupMembers).values(rows).onConflictDoNothing();
    }

    await db
      .update(schema.customerGroups)
      .set({ memberCount: matchingIds.length, lastComputedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.customerGroups.id, id));

    return reply.status(200).send({ data: { memberCount: matchingIds.length, computedAt: new Date() } });
  });

  // DELETE /:id — delete group
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const group = await db.query.customerGroups.findFirst({
      where: and(eq(schema.customerGroups.id, id), eq(schema.customerGroups.orgId, orgId)),
    });
    if (!group) return reply.status(404).send({ title: 'Not Found', status: 404 });

    await db
      .delete(schema.customerGroups)
      .where(and(eq(schema.customerGroups.id, id), eq(schema.customerGroups.orgId, orgId)));

    return reply.status(204).send();
  });
}
