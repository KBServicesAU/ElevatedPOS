import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

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
      account = a;
    }

    const newBalance = (Number(account.balance) + body.data.amount).toFixed(4);
    await db
      .update(schema.storeCreditAccounts)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(schema.storeCreditAccounts.id, account.id));

    const [tx] = await db
      .insert(schema.storeCreditTransactions)
      .values({
        accountId: account.id,
        orgId,
        type: 'issue',
        amount: String(body.data.amount),
        reason: body.data.reason,
        notes: body.data.notes,
        issuedBy: body.data.issuedBy ?? userId,
        expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : undefined,
      })
      .returning();

    return reply.status(201).send({ data: { transaction: tx, balance: newBalance } });
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

    const currentBalance = Number(account.balance);
    if (currentBalance < body.data.amount) {
      return reply.status(422).send({
        title: 'Insufficient store credit',
        status: 422,
        detail: `Available balance: ${currentBalance.toFixed(4)}, requested: ${body.data.amount}`,
      });
    }

    const newBalance = (currentBalance - body.data.amount).toFixed(4);
    await db
      .update(schema.storeCreditAccounts)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(schema.storeCreditAccounts.id, account.id));

    const [tx] = await db
      .insert(schema.storeCreditTransactions)
      .values({
        accountId: account.id,
        orgId,
        type: 'redeem',
        amount: String(body.data.amount),
        orderId: body.data.orderId,
        notes: body.data.notes,
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
    if (tx.account.customerId !== customerId) {
      return reply.status(404).send({ title: 'Transaction not found', status: 404 });
    }
    if (tx.voidedAt) {
      return reply.status(422).send({ title: 'Transaction already voided', status: 422 });
    }
    if (tx.type !== 'issue') {
      return reply.status(422).send({ title: 'Only issue transactions can be voided', status: 422 });
    }

    // Reverse balance
    const account = tx.account;
    const reverseAmount = Number(tx.amount);
    const currentBalance = Number(account.balance);
    if (currentBalance < reverseAmount) {
      return reply.status(422).send({ title: 'Insufficient balance to void this credit', status: 422 });
    }

    const newBalance = (currentBalance - reverseAmount).toFixed(4);
    await db
      .update(schema.storeCreditAccounts)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(schema.storeCreditAccounts.id, account.id));

    await db
      .update(schema.storeCreditTransactions)
      .set({ voidedAt: new Date(), voidedBy: userId, voidReason: body.data.reason })
      .where(eq(schema.storeCreditTransactions.id, body.data.creditId));

    // Record a void transaction for the ledger
    await db.insert(schema.storeCreditTransactions).values({
      accountId: account.id,
      orgId,
      type: 'void',
      amount: tx.amount,
      reason: body.data.reason,
      employeeId: userId,
    });

    return reply.status(200).send({ data: { balance: newBalance, voidedAt: new Date() } });
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
