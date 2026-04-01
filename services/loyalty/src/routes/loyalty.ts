import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

export async function loyaltyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // --- Programs ---
  app.get('/programs', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const programs = await db.query.loyaltyPrograms.findMany({
      where: and(eq(schema.loyaltyPrograms.orgId, orgId), eq(schema.loyaltyPrograms.active, true)),
      with: { tiers: { orderBy: [schema.loyaltyTiers.minPoints] } },
    });
    return reply.status(200).send({ data: programs });
  });

  app.post('/programs', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = z.object({
      name: z.string().min(1),
      earnRate: z.number().int().positive().default(10),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });
    const [created] = await db.insert(schema.loyaltyPrograms).values({ name: body.data.name, earnRate: body.data.earnRate, orgId }).returning();
    return reply.status(201).send({ data: created });
  });

  // --- Accounts ---
  app.get('/accounts', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { customerId?: string };
    const accounts = await db.query.loyaltyAccounts.findMany({
      where: and(eq(schema.loyaltyAccounts.orgId, orgId), q.customerId ? eq(schema.loyaltyAccounts.customerId, q.customerId) : undefined),
      with: { program: true, tier: true },
      orderBy: [desc(schema.loyaltyAccounts.createdAt)],
    });
    return reply.status(200).send({ data: accounts });
  });

  app.post('/accounts', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = z.object({ customerId: z.string().uuid(), programId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const existing = await db.query.loyaltyAccounts.findFirst({ where: and(eq(schema.loyaltyAccounts.customerId, body.data.customerId), eq(schema.loyaltyAccounts.orgId, orgId)) });
    if (existing) return reply.status(409).send({ title: 'Account already exists', status: 409, detail: `Customer already has a loyalty account.` });

    const [account] = await db.insert(schema.loyaltyAccounts).values({ ...body.data, orgId }).returning();
    return reply.status(201).send({ data: account });
  });

  // --- Earn points ---
  app.post('/accounts/:id/earn', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({
      orderId: z.string().uuid(),
      orderTotal: z.number().positive(),
      idempotencyKey: z.string().min(1),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    // Idempotency check
    const existingTx = await db.query.loyaltyTransactions.findFirst({ where: eq(schema.loyaltyTransactions.idempotencyKey, body.data.idempotencyKey) });
    if (existingTx) return reply.status(200).send({ data: existingTx, idempotent: true });

    const account = await db.query.loyaltyAccounts.findFirst({
      where: and(eq(schema.loyaltyAccounts.id, id), eq(schema.loyaltyAccounts.orgId, orgId)),
      with: { program: true, tier: true },
    });
    if (!account) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const multiplier = Number(account.tier?.multiplier ?? 1);
    const earnRate = Number(account.program.earnRate);
    const pointsEarned = Math.floor(body.data.orderTotal * earnRate * multiplier);
    const newBalance = account.points + pointsEarned;

    await db.update(schema.loyaltyAccounts).set({
      points: newBalance,
      lifetimePoints: account.lifetimePoints + pointsEarned,
      updatedAt: new Date(),
    }).where(eq(schema.loyaltyAccounts.id, id));

    const [tx] = await db.insert(schema.loyaltyTransactions).values({
      accountId: id,
      orgId,
      type: 'earn',
      points: pointsEarned,
      orderId: body.data.orderId,
      idempotencyKey: body.data.idempotencyKey,
    }).returning();

    return reply.status(200).send({ data: { transaction: tx, newPoints: newBalance, pointsEarned } });
  });

  // --- Redeem points ---
  app.post('/accounts/:id/redeem', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({
      points: z.number().int().positive(),
      orderId: z.string().uuid(),
      idempotencyKey: z.string().min(1),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const existingTx = await db.query.loyaltyTransactions.findFirst({ where: eq(schema.loyaltyTransactions.idempotencyKey, body.data.idempotencyKey) });
    if (existingTx) return reply.status(200).send({ data: existingTx, idempotent: true });

    const account = await db.query.loyaltyAccounts.findFirst({
      where: and(eq(schema.loyaltyAccounts.id, id), eq(schema.loyaltyAccounts.orgId, orgId)),
      with: { program: true },
    });
    if (!account) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (account.points < body.data.points) return reply.status(422).send({ title: 'Insufficient points', status: 422 });

    const newBalance = account.points - body.data.points;

    await db.update(schema.loyaltyAccounts).set({
      points: newBalance,
      updatedAt: new Date(),
    }).where(eq(schema.loyaltyAccounts.id, id));

    const [tx] = await db.insert(schema.loyaltyTransactions).values({
      accountId: id,
      orgId,
      type: 'redeem',
      points: -body.data.points,
      orderId: body.data.orderId,
      idempotencyKey: body.data.idempotencyKey,
    }).returning();

    return reply.status(200).send({ data: { transaction: tx, newPoints: newBalance } });
  });

  // --- Transaction history ---
  app.get('/accounts/:id/transactions', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const transactions = await db.query.loyaltyTransactions.findMany({
      where: and(eq(schema.loyaltyTransactions.accountId, id), eq(schema.loyaltyTransactions.orgId, orgId)),
      orderBy: [desc(schema.loyaltyTransactions.createdAt)],
      limit: 100,
    });
    return reply.status(200).send({ data: transactions });
  });
}
