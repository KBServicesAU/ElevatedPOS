import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, or, ilike, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const createCustomerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dob: z.string().optional(),
  company: z.string().optional(),
  abn: z.string().optional(),
  tags: z.array(z.string()).default([]),
  marketingOptIn: z.boolean().default(false),
  notes: z.string().optional(),
  source: z.string().default('pos'),
  dietaryPreferences: z.array(z.string()).default([]),
  allergenAlerts: z.array(z.string()).default([]),
});

export async function customerRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { search?: string; tag?: string; limit?: string; cursor?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);

    const allCustomers = await db.query.customers.findMany({
      where: and(eq(schema.customers.orgId, orgId), eq(schema.customers.gdprDeleted, false)),
      orderBy: [desc(schema.customers.lastPurchaseAt), desc(schema.customers.createdAt)],
      limit: limit + 1,
    });

    const filtered = q.search
      ? allCustomers.filter((c) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q.search!.toLowerCase()) ||
          (c.email?.toLowerCase().includes(q.search!.toLowerCase()) ?? false) ||
          (c.phone?.includes(q.search!) ?? false),
        )
      : allCustomers;

    const hasMore = filtered.length > limit;
    return reply.status(200).send({ data: filtered.slice(0, limit), meta: { totalCount: filtered.length, hasMore } });
  });

  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const customer = await db.query.customers.findFirst({
      where: and(eq(schema.customers.id, id), eq(schema.customers.orgId, orgId), eq(schema.customers.gdprDeleted, false)),
      with: { storeCreditAccount: true },
    });
    if (!customer) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: customer });
  });

  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createCustomerSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

    const data = { ...body.data, orgId, marketingOptInAt: body.data.marketingOptIn ? new Date() : undefined };
    const [created] = await db.insert(schema.customers).values(data).returning();
    return reply.status(201).send({ data: created });
  });

  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = createCustomerSchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const existing = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, id), eq(schema.customers.orgId, orgId)) });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const updates = { ...body.data, updatedAt: new Date(), ...(body.data.marketingOptIn && !existing.marketingOptIn ? { marketingOptInAt: new Date() } : {}) };
    const [updated] = await db.update(schema.customers).set(updates).where(and(eq(schema.customers.id, id), eq(schema.customers.orgId, orgId))).returning();
    return reply.status(200).send({ data: updated });
  });

  // GDPR delete (anonymise, do not hard delete)
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db.update(schema.customers).set({
      gdprDeleted: true,
      gdprDeletedAt: new Date(),
      firstName: 'Deleted',
      lastName: 'Customer',
      email: null,
      phone: null,
      dob: null,
      notes: null,
      updatedAt: new Date(),
    }).where(and(eq(schema.customers.id, id), eq(schema.customers.orgId, orgId)));
    return reply.status(204).send();
  });

  // POST /api/v1/customers/:id/store-credit
  app.post('/:id/store-credit', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };
    const body = z.object({ amount: z.number(), type: z.enum(['issue', 'redeem', 'adjust']), orderId: z.string().uuid().optional(), notes: z.string().optional() }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    let account = await db.query.storeCreditAccounts.findFirst({ where: and(eq(schema.storeCreditAccounts.customerId, id), eq(schema.storeCreditAccounts.orgId, orgId)) });
    if (!account) {
      const [a] = await db.insert(schema.storeCreditAccounts).values({ customerId: id, orgId, balance: '0' }).returning();
      account = a;
    }

    const delta = body.data.type === 'redeem' ? -Math.abs(body.data.amount) : Math.abs(body.data.amount);
    const newBalance = Number(account.balance) + delta;
    if (newBalance < 0) return reply.status(422).send({ title: 'Insufficient store credit', status: 422 });

    await db.update(schema.storeCreditAccounts).set({ balance: String(newBalance.toFixed(4)), updatedAt: new Date() }).where(eq(schema.storeCreditAccounts.id, account.id));
    await db.insert(schema.storeCreditTransactions).values({ accountId: account.id, orgId, type: body.data.type, amount: String(body.data.amount), orderId: body.data.orderId, notes: body.data.notes, employeeId });

    return reply.status(200).send({ data: { balance: newBalance.toFixed(4), delta } });
  });
}
