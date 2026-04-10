import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { db, schema } from '../db';

const CUSTOMERS_URL = process.env['CUSTOMERS_SERVICE_URL'] ?? 'http://customers:4006';

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

  // GET /loyalty/accounts/lookup?phone=0412345678
  // Convenience endpoint: resolves customer by phone then returns their loyalty account + balance.
  app.get('/accounts/lookup', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { phone?: string };
    if (!q.phone) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: 'phone query parameter required' });
    }
    // Look up customer by phone via internal customers service call
    const internalToken = process.env['INTERNAL_SERVICE_TOKEN'] ?? process.env['JWT_SECRET'];
    let customerId: string | null = null;
    try {
      const custRes = await fetch(
        `${CUSTOMERS_URL}/api/v1/customers?phone=${encodeURIComponent(q.phone)}&limit=1`,
        { headers: { Authorization: `Bearer ${internalToken}`, 'x-org-id': orgId }, signal: AbortSignal.timeout(3000) },
      );
      if (custRes.ok) {
        const custData = await custRes.json() as { data?: Array<{ id: string }> };
        customerId = custData.data?.[0]?.id ?? null;
      }
    } catch {
      // Customers service unavailable — return 503
      return reply.status(503).send({ title: 'Customers service unavailable', status: 503 });
    }
    if (!customerId) {
      return reply.status(404).send({ title: 'Not Found', status: 404, detail: `No customer found with phone ${q.phone}` });
    }
    const account = await db.query.loyaltyAccounts.findFirst({
      where: and(eq(schema.loyaltyAccounts.customerId, customerId), eq(schema.loyaltyAccounts.orgId, orgId)),
      with: { program: true, tier: true },
    });
    if (!account) {
      return reply.status(404).send({ title: 'Not Found', status: 404, detail: `No loyalty account for customer` });
    }
    return reply.status(200).send({ data: account });
  });

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

    const account = await db.query.loyaltyAccounts.findFirst({
      where: and(eq(schema.loyaltyAccounts.id, id), eq(schema.loyaltyAccounts.orgId, orgId)),
      with: { program: true, tier: true },
    });
    if (!account) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const multiplier = Number(account.tier?.multiplier ?? 1);
    const earnRate = Number(account.program.earnRate);
    const pointsEarned = Math.floor(body.data.orderTotal * earnRate * multiplier);

    // Wrap idempotency guard + transaction insert atomically to prevent duplicate earning
    const tx = await db.transaction(async (trx) => {
      // Lock the account row first to serialize concurrent earn calls for the same account.
      // Without this, two concurrent requests can both pass the idempotency check before
      // either one writes its transaction record.
      const lockedRows = await trx.execute(
        sql`SELECT id FROM loyalty_accounts WHERE id = ${id} FOR UPDATE`,
      );
      if (!lockedRows.rows || lockedRows.rows.length === 0) {
        throw new Error('Account not found');
      }

      // Idempotency check (now safe — we hold the row lock)
      const existingTx = await trx.query.loyaltyTransactions.findFirst({
        where: and(
          eq(schema.loyaltyTransactions.orgId, orgId),
          eq(schema.loyaltyTransactions.idempotencyKey, body.data.idempotencyKey),
        ),
      });
      if (existingTx) return existingTx;

      // Atomic increment — avoids read-modify-write race condition
      await trx.update(schema.loyaltyAccounts).set({
        points: sql`points + ${pointsEarned}`,
        lifetimePoints: sql`lifetime_points + ${pointsEarned}`,
        updatedAt: new Date(),
      }).where(eq(schema.loyaltyAccounts.id, id));

      const [newTx] = await trx.insert(schema.loyaltyTransactions).values({
        accountId: id,
        orgId,
        type: 'earn',
        points: pointsEarned,
        orderId: body.data.orderId,
        idempotencyKey: body.data.idempotencyKey,
      }).returning();
      return newTx!;
    });

    return reply.status(200).send({ data: { transaction: tx, pointsEarned } });
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

    const account = await db.query.loyaltyAccounts.findFirst({
      where: and(eq(schema.loyaltyAccounts.id, id), eq(schema.loyaltyAccounts.orgId, orgId)),
      with: { program: true },
    });
    if (!account) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (account.points < body.data.points) return reply.status(422).send({ title: 'Insufficient points', status: 422 });

    const pointsToRedeem = body.data.points;

    // Wrap idempotency guard + transaction insert atomically to prevent duplicate redemptions
    const redeemResult = await db.transaction(async (trx) => {
      const existingTx = await trx.query.loyaltyTransactions.findFirst({
        where: and(
          eq(schema.loyaltyTransactions.orgId, orgId),
          eq(schema.loyaltyTransactions.idempotencyKey, body.data.idempotencyKey),
        ),
      });
      if (existingTx) return { tx: existingTx, insufficient: false };

      // Atomic conditional decrement — only decrements if balance is still sufficient
      const updated = await trx
        .update(schema.loyaltyAccounts)
        .set({
          points: sql`points - ${pointsToRedeem}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.loyaltyAccounts.id, id),
            gte(schema.loyaltyAccounts.points, pointsToRedeem),
          ),
        )
        .returning();

      if (updated.length === 0) {
        return { tx: null, insufficient: true };
      }

      const [newTx] = await trx.insert(schema.loyaltyTransactions).values({
        accountId: id,
        orgId,
        type: 'redeem',
        points: -pointsToRedeem,
        orderId: body.data.orderId,
        idempotencyKey: body.data.idempotencyKey,
      }).returning();
      return { tx: newTx!, insufficient: false };
    });

    if (redeemResult.insufficient) {
      return reply.status(422).send({ title: 'Insufficient loyalty points', status: 422 });
    }

    return reply.status(200).send({ data: { transaction: redeemResult.tx } });
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
