import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db, schema } from '../db';

type StoreCreditAccount = InferSelectModel<typeof schema.storeCreditAccounts>;

export async function storeCreditRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /:customerId/balance
  app.get('/:customerId/balance', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { customerId } = request.params as { customerId: string };

    const account = await db.query.storeCreditAccounts.findFirst({
      where: and(
        eq(schema.storeCreditAccounts.customerId, customerId),
        eq(schema.storeCreditAccounts.orgId, orgId),
      ),
    });

    if (!account) {
      return reply.status(200).send({ data: { balance: '0.0000', customerId, hasAccount: false } });
    }

    return reply.status(200).send({
      data: {
        balance: account.balance,
        customerId,
        hasAccount: true,
        accountId: account.id,
        expiresAt: account.expiresAt,
      },
    });
  });

  // POST /:customerId/issue — issue store credit
  app.post('/:customerId/issue', async (request, reply) => {
    const { orgId, sub: userId } = request.user as { orgId: string; sub: string };
    const { customerId } = request.params as { customerId: string };

    const body = z
      .object({
        amount: z.number().positive(),
        reason: z.string().min(1),
        expiresAt: z.string().datetime().optional(),
        notes: z.string().optional(),
        issuedBy: z.string().uuid().optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    // Ensure customer exists
    const customer = await db.query.customers.findFirst({
      where: and(eq(schema.customers.id, customerId), eq(schema.customers.orgId, orgId), eq(schema.customers.gdprDeleted, false)),
    });
    if (!customer) return reply.status(404).send({ title: 'Customer not found', status: 404 });

    // Find or create account
    let account = await db.query.storeCreditAccounts.findFirst({
      where: and(
        eq(schema.storeCreditAccounts.customerId, customerId),
        eq(schema.storeCreditAccounts.orgId, orgId),
      ),
    });
    if (!account) {
      const [a] = await db
        .insert(schema.storeCreditAccounts)
        .values({ customerId, orgId, balance: '0' })
        .returning();
      account = a!;
    }

    await db
      .update(schema.storeCreditAccounts)
      .set({ balance: sql`balance + ${body.data.amount}`, updatedAt: new Date() })
      .where(eq(schema.storeCreditAccounts.id, account.id));

    const [updatedAccount] = await db
      .select({ balance: schema.storeCreditAccounts.balance })
      .from(schema.storeCreditAccounts)
      .where(eq(schema.storeCreditAccounts.id, account.id));

    const [tx] = await db
      .insert(schema.storeCreditTransactions)
      .values({
        accountId: account.id,
        orgId,
        type: 'issue',
        amount: String(body.data.amount),
        reason: body.data.reason,
        ...(body.data.notes !== undefined ? { notes: body.data.notes } : {}),
        issuedBy: body.data.issuedBy ?? userId,
        ...(body.data.expiresAt !== undefined ? { expiresAt: new Date(body.data.expiresAt) } : {}),
      })
      .returning();

    return reply.status(201).send({ data: { transaction: tx, balance: updatedAccount?.balance ?? '0' } });
  });

  // POST /:customerId/redeem — redeem store credit
  app.post('/:customerId/redeem', async (request, reply) => {
    const { orgId, sub: userId } = request.user as { orgId: string; sub: string };
    const { customerId } = request.params as { customerId: string };

    const body = z
      .object({
        amount: z.number().positive(),
        orderId: z.string().uuid().optional(),
        notes: z.string().optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const account = await db.query.storeCreditAccounts.findFirst({
      where: and(
        eq(schema.storeCreditAccounts.customerId, customerId),
        eq(schema.storeCreditAccounts.orgId, orgId),
      ),
    });

    if (!account) {
      return reply.status(422).send({ title: 'No store credit account found', status: 422 });
    }

    // Check expiry before attempting redemption
    if (account.expiresAt && account.expiresAt < new Date()) {
      return reply.status(422).send({ title: 'Store credit has expired', status: 422 });
    }

    // Atomic conditional decrement — only succeeds when balance >= amount,
    // preventing a race condition where two concurrent redeems both read the
    // same balance and both proceed past the JS-level check.
    const updated = await db
      .update(schema.storeCreditAccounts)
      .set({ balance: sql`balance - ${body.data.amount}`, updatedAt: new Date() })
      .where(and(
        eq(schema.storeCreditAccounts.id, account.id),
        gte(schema.storeCreditAccounts.balance, String(body.data.amount)),
      ))
      .returning({ balance: schema.storeCreditAccounts.balance });

    if (updated.length === 0) {
      return reply.status(422).send({
        title: 'Insufficient store credit balance',
        status: 422,
      });
    }

    const newBalance = updated[0]!.balance;

    const [tx] = await db
      .insert(schema.storeCreditTransactions)
      .values({
        accountId: account.id,
        orgId,
        type: 'redeem',
        amount: String(body.data.amount),
        ...(body.data.orderId !== undefined ? { orderId: body.data.orderId } : {}),
        ...(body.data.notes !== undefined ? { notes: body.data.notes } : {}),
        employeeId: userId,
      })
      .returning();

    return reply.status(200).send({ data: { transaction: tx, balance: newBalance } });
  });

  // POST /:customerId/void — void a specific credit issuance
  app.post('/:customerId/void', async (request, reply) => {
    const { orgId, sub: userId } = request.user as { orgId: string; sub: string };
    const { customerId } = request.params as { customerId: string };

    const body = z
      .object({
        creditId: z.string().uuid(),
        reason: z.string().min(1),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    // Find the transaction
    const tx = await db.query.storeCreditTransactions.findFirst({
      where: and(
        eq(schema.storeCreditTransactions.id, body.data.creditId),
        eq(schema.storeCreditTransactions.orgId, orgId),
      ),
      with: { account: true },
    });

    if (!tx) return reply.status(404).send({ title: 'Transaction not found', status: 404 });
    const account = tx.account as unknown as StoreCreditAccount;
    if (account.customerId !== customerId) {
      return reply.status(404).send({ title: 'Transaction not found', status: 404 });
    }
    if (tx.voidedAt) {
      return reply.status(422).send({ title: 'Transaction already voided', status: 422 });
    }
    if (tx.type !== 'issue') {
      return reply.status(422).send({ title: 'Only issue transactions can be voided', status: 422 });
    }

    // Atomic conditional decrement — prevents a race where two concurrent void
    // requests both pass the JS-level balance check and both subtract.
    const reverseAmount = Number(tx.amount);

    const updated = await db
      .update(schema.storeCreditAccounts)
      .set({
        balance: sql`(balance - ${reverseAmount})::numeric(12,4)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.storeCreditAccounts.id, account.id),
          gte(schema.storeCreditAccounts.balance, String(reverseAmount)),
        ),
      )
      .returning({ newBalance: schema.storeCreditAccounts.balance });

    if (updated.length === 0) {
      return reply.status(422).send({
        type: 'about:blank',
        title: 'Insufficient Balance',
        status: 422,
        detail: 'Balance is insufficient to void this amount.',
      });
    }

    const newBalance = updated[0]!.newBalance;
    const voidedAt = new Date();

    await db
      .update(schema.storeCreditTransactions)
      .set({ voidedAt, voidedBy: userId, voidReason: body.data.reason })
      .where(eq(schema.storeCreditTransactions.id, body.data.creditId));

    // Record a void transaction for the ledger
    await db.insert(schema.storeCreditTransactions).values({
      accountId: account.id,
      orgId,
      type: 'adjust', // 'void' is a semantic alias for adjustment — enum uses 'adjust'
      amount: tx.amount,
      reason: body.data.reason,
      employeeId: userId,
    });

    return reply.status(200).send({ data: { balance: newBalance, voidedAt } });
  });

  // GET /:customerId/history — credit ledger
  app.get('/:customerId/history', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { customerId } = request.params as { customerId: string };
    const q = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);

    const account = await db.query.storeCreditAccounts.findFirst({
      where: and(
        eq(schema.storeCreditAccounts.customerId, customerId),
        eq(schema.storeCreditAccounts.orgId, orgId),
      ),
    });

    if (!account) {
      return reply.status(200).send({ data: [], meta: { balance: '0.0000', total: 0 } });
    }

    const transactions = await db.query.storeCreditTransactions.findMany({
      where: eq(schema.storeCreditTransactions.accountId, account.id),
      orderBy: [desc(schema.storeCreditTransactions.createdAt)],
      limit,
      offset,
    });

    return reply.status(200).send({
      data: transactions,
      meta: {
        balance: account.balance,
        total: transactions.length,
        limit,
        offset,
      },
    });
  });
}
