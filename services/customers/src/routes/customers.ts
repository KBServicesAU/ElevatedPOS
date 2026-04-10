import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, ilike, or, sql, gte } from 'drizzle-orm';
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

    const searchFilter = q.search
      ? or(
          ilike(schema.customers.firstName, `%${q.search}%`),
          ilike(schema.customers.lastName, `%${q.search}%`),
          ilike(schema.customers.email, `%${q.search}%`),
          ilike(schema.customers.phone, `%${q.search}%`),
        )
      : undefined;

    const whereClause = and(
      eq(schema.customers.orgId, orgId),
      eq(schema.customers.gdprDeleted, false),
      searchFilter,
    );

    const [customers, countResult] = await Promise.all([
      db.query.customers.findMany({
        where: whereClause,
        orderBy: [desc(schema.customers.lastPurchaseAt), desc(schema.customers.createdAt)],
        limit: limit + 1,
      }),
      db.select({ totalCount: count() }).from(schema.customers).where(whereClause),
    ]);
    const totalCount = countResult[0]?.totalCount ?? 0;

    const hasMore = customers.length > limit;
    return reply.status(200).send({ data: customers.slice(0, limit), meta: { totalCount, hasMore } });
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
    if (!body.success) return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

    const { firstName, lastName, email, phone, dob, company, abn, tags, marketingOptIn, notes: bodyNotes, source, dietaryPreferences, allergenAlerts } = body.data;
    const data = {
      orgId,
      firstName,
      lastName,
      tags,
      marketingOptIn,
      source,
      dietaryPreferences,
      allergenAlerts,
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(dob !== undefined ? { dob } : {}),
      ...(company !== undefined ? { company } : {}),
      ...(abn !== undefined ? { abn } : {}),
      ...(bodyNotes !== undefined ? { notes: bodyNotes } : {}),
      ...(marketingOptIn ? { marketingOptInAt: new Date() } : {}),
    };
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

    const { firstName, lastName, email, phone, dob, company, abn, tags, marketingOptIn, notes, source, dietaryPreferences, allergenAlerts } = body.data;
    const updates = {
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(dob !== undefined ? { dob } : {}),
      ...(company !== undefined ? { company } : {}),
      ...(abn !== undefined ? { abn } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(marketingOptIn !== undefined ? { marketingOptIn } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(source !== undefined ? { source } : {}),
      ...(dietaryPreferences !== undefined ? { dietaryPreferences } : {}),
      ...(allergenAlerts !== undefined ? { allergenAlerts } : {}),
      updatedAt: new Date(),
      ...(body.data.marketingOptIn && !existing.marketingOptIn ? { marketingOptInAt: new Date() } : {}),
    };
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
      account = a!;
    }

    const amount = Math.abs(body.data.amount);

    let updatedRows: { newBalance: string }[];
    if (body.data.type === 'redeem') {
      // Atomic subtract — the WHERE guard prevents the balance going negative
      updatedRows = await db.update(schema.storeCreditAccounts)
        .set({ balance: sql`(balance - ${amount})::numeric(12,4)`, updatedAt: new Date() })
        .where(
          and(
            eq(schema.storeCreditAccounts.id, account.id),
            gte(schema.storeCreditAccounts.balance, String(amount)),
          ),
        )
        .returning({ newBalance: schema.storeCreditAccounts.balance });

      if (updatedRows.length === 0) {
        return reply.code(422).send({
          type: 'about:blank',
          title: 'Insufficient Balance',
          status: 422,
          detail: 'Store credit balance is insufficient for this redemption.',
        });
      }
    } else {
      // issue or adjust — atomic add
      updatedRows = await db.update(schema.storeCreditAccounts)
        .set({ balance: sql`(balance + ${amount})::numeric(12,4)`, updatedAt: new Date() })
        .where(eq(schema.storeCreditAccounts.id, account.id))
        .returning({ newBalance: schema.storeCreditAccounts.balance });
    }

    const newBalance = Number(updatedRows[0]!.newBalance);
    const delta = body.data.type === 'redeem' ? -amount : amount;

    await db.insert(schema.storeCreditTransactions).values({
      accountId: account.id,
      orgId,
      type: body.data.type,
      amount: String(amount),
      ...(body.data.orderId !== undefined ? { orderId: body.data.orderId } : {}),
      ...(body.data.notes !== undefined ? { notes: body.data.notes } : {}),
      employeeId,
    });

    return reply.status(200).send({ data: { balance: newBalance.toFixed(4), delta } });
  });
}
