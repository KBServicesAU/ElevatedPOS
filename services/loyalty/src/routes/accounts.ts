import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, lte, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

async function recalculateTier(accountId: string, orgId: string, lifetimePoints: number) {
  // Find matching tier by lifetimePoints within the account's program
  const account = await db.query.loyaltyAccounts.findFirst({
    where: and(eq(schema.loyaltyAccounts.id, accountId), eq(schema.loyaltyAccounts.orgId, orgId)),
  });
  if (!account) return;

  const tiers = await db.query.loyaltyTiers.findMany({
    where: eq(schema.loyaltyTiers.programId, account.programId),
  });

  // Find the highest tier the member qualifies for
  let matchedTierId: string | null = null;
  let bestMin = -1;
  for (const tier of tiers) {
    if (lifetimePoints >= tier.minPoints && tier.minPoints > bestMin) {
      const withinMax = tier.maxPoints === null || lifetimePoints <= tier.maxPoints;
      if (withinMax) {
        bestMin = tier.minPoints;
        matchedTierId = tier.id;
      }
    }
  }

  await db
    .update(schema.loyaltyAccounts)
    .set({ tierId: matchedTierId, updatedAt: new Date() })
    .where(eq(schema.loyaltyAccounts.id, accountId));
}

export async function accountRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /accounts — create account for a customer in a program
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = z
      .object({
        customerId: z.string().uuid(),
        programId: z.string().uuid(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const program = await db.query.loyaltyPrograms.findFirst({
      where: and(
        eq(schema.loyaltyPrograms.id, parsed.data.programId),
        eq(schema.loyaltyPrograms.orgId, orgId),
      ),
    });
    if (!program) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'Loyalty program not found',
      });
    }

    const existing = await db.query.loyaltyAccounts.findFirst({
      where: and(
        eq(schema.loyaltyAccounts.customerId, parsed.data.customerId),
        eq(schema.loyaltyAccounts.programId, parsed.data.programId),
        eq(schema.loyaltyAccounts.orgId, orgId),
      ),
    });
    if (existing) {
      return reply.status(409).send({
        type: 'https://elevatedpos.com/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: 'Customer already has an account in this program',
      });
    }

    const [account] = await db
      .insert(schema.loyaltyAccounts)
      .values({ orgId, customerId: parsed.data.customerId, programId: parsed.data.programId })
      .returning();
    return reply.status(201).send({ data: account });
  });

  // GET /accounts/:accountId — get account with tier info
  app.get('/:accountId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { accountId } = request.params as { accountId: string };

    const account = await db.query.loyaltyAccounts.findFirst({
      where: and(eq(schema.loyaltyAccounts.id, accountId), eq(schema.loyaltyAccounts.orgId, orgId)),
      with: { tier: true, program: true },
    });
    if (!account) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Account ${accountId} not found`,
      });
    }
    return reply.status(200).send({ data: account });
  });

  // GET /accounts/customer/:customerId — find account by customer
  app.get('/customer/:customerId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { customerId } = request.params as { customerId: string };

    const accounts = await db.query.loyaltyAccounts.findMany({
      where: and(
        eq(schema.loyaltyAccounts.customerId, customerId),
        eq(schema.loyaltyAccounts.orgId, orgId),
      ),
      with: { tier: true, program: true },
    });
    return reply.status(200).send({ data: accounts });
  });

  // POST /accounts/:accountId/earn — earn points
  app.post('/:accountId/earn', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { accountId } = request.params as { accountId: string };

    const parsed = z
      .object({
        points: z.number().int().positive(),
        orderId: z.string().uuid().optional(),
        idempotencyKey: z.string().min(1).max(64),
        // Optional context for multiplier matching
        productId: z.string().optional(),
        categoryId: z.string().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    // Idempotency check
    const existingTx = await db.query.loyaltyTransactions.findFirst({
      where: and(
        eq(schema.loyaltyTransactions.orgId, orgId),
        eq(schema.loyaltyTransactions.idempotencyKey, parsed.data.idempotencyKey),
      ),
    });
    if (existingTx) {
      return reply.status(200).send({ data: existingTx, idempotent: true });
    }

    const account = await db.query.loyaltyAccounts.findFirst({
      where: and(eq(schema.loyaltyAccounts.id, accountId), eq(schema.loyaltyAccounts.orgId, orgId)),
    });
    if (!account) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Account ${accountId} not found`,
      });
    }

    // ── Apply active multiplier events ─────────────────────────────────────────
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
    const todayDow = today.getDay(); // 0 = Sunday

    const activeMultiplierEvents = await db.query.pointsMultiplierEvents.findMany({
      where: and(
        eq(schema.pointsMultiplierEvents.orgId, orgId),
        eq(schema.pointsMultiplierEvents.isActive, true),
        lte(schema.pointsMultiplierEvents.startDate, todayStr),
        gte(schema.pointsMultiplierEvents.endDate, todayStr),
      ),
    });

    // Find matching events (day of week + product/category)
    const matchingMultipliers = activeMultiplierEvents
      .filter((evt) => {
        const dows = (evt.daysOfWeek ?? []) as number[];
        if (dows.length > 0 && !dows.includes(todayDow)) return false;

        const productIds = (evt.productIds ?? null) as string[] | null;
        const categoryIds = (evt.categoryIds ?? null) as string[] | null;

        // If event scopes to specific products or categories, check match
        const hasProductScope = productIds !== null && productIds.length > 0;
        const hasCategoryScope = categoryIds !== null && categoryIds.length > 0;

        if (!hasProductScope && !hasCategoryScope) return true; // applies to all
        if (hasProductScope && parsed.data.productId && productIds!.includes(parsed.data.productId)) return true;
        if (hasCategoryScope && parsed.data.categoryId && categoryIds!.includes(parsed.data.categoryId)) return true;
        return false;
      })
      .map((evt) => Number(evt.multiplier));

    // Use the highest matching multiplier, fallback to 1
    const campaignMultiplier = matchingMultipliers.length > 0
      ? Math.max(...matchingMultipliers)
      : 1;

    const basePoints = parsed.data.points;
    const finalPoints = Math.floor(basePoints * campaignMultiplier);
    // ──────────────────────────────────────────────────────────────────────────

    const newPoints = account.points + finalPoints;
    const newLifetimePoints = account.lifetimePoints + finalPoints;

    await db
      .update(schema.loyaltyAccounts)
      .set({ points: newPoints, lifetimePoints: newLifetimePoints, updatedAt: new Date() })
      .where(eq(schema.loyaltyAccounts.id, accountId));

    const [tx] = await db
      .insert(schema.loyaltyTransactions)
      .values({
        orgId,
        accountId,
        orderId: parsed.data.orderId ?? null,
        type: 'earn',
        points: finalPoints,
        idempotencyKey: parsed.data.idempotencyKey,
      })
      .returning();

    // Recalculate tier based on lifetime points
    await recalculateTier(accountId, orgId, newLifetimePoints);

    return reply.status(200).send({
      data: {
        transaction: tx,
        newBalance: newPoints,
        basePoints,
        campaignMultiplier,
        finalPoints,
      },
    });
  });

  // POST /accounts/:accountId/redeem — redeem points
  app.post('/:accountId/redeem', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { accountId } = request.params as { accountId: string };

    const parsed = z
      .object({
        points: z.number().int().positive(),
        orderId: z.string().uuid().optional(),
        idempotencyKey: z.string().min(1).max(64),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    // Idempotency check
    const existingTx = await db.query.loyaltyTransactions.findFirst({
      where: and(
        eq(schema.loyaltyTransactions.orgId, orgId),
        eq(schema.loyaltyTransactions.idempotencyKey, parsed.data.idempotencyKey),
      ),
    });
    if (existingTx) {
      return reply.status(200).send({ data: existingTx, idempotent: true });
    }

    const account = await db.query.loyaltyAccounts.findFirst({
      where: and(eq(schema.loyaltyAccounts.id, accountId), eq(schema.loyaltyAccounts.orgId, orgId)),
    });
    if (!account) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Account ${accountId} not found`,
      });
    }

    if (account.points < parsed.data.points) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/insufficient-points',
        title: 'Insufficient Points',
        status: 422,
        detail: `Account has ${account.points} points, cannot redeem ${parsed.data.points}`,
      });
    }

    const newPoints = account.points - parsed.data.points;

    await db
      .update(schema.loyaltyAccounts)
      .set({ points: newPoints, updatedAt: new Date() })
      .where(eq(schema.loyaltyAccounts.id, accountId));

    const [tx] = await db
      .insert(schema.loyaltyTransactions)
      .values({
        orgId,
        accountId,
        orderId: parsed.data.orderId ?? null,
        type: 'redeem',
        points: -parsed.data.points,
        idempotencyKey: parsed.data.idempotencyKey,
      })
      .returning();

    return reply.status(200).send({ data: { transaction: tx, newBalance: newPoints } });
  });

  // GET /accounts/:accountId/transactions — list transaction history
  app.get('/:accountId/transactions', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { accountId } = request.params as { accountId: string };

    const account = await db.query.loyaltyAccounts.findFirst({
      where: and(eq(schema.loyaltyAccounts.id, accountId), eq(schema.loyaltyAccounts.orgId, orgId)),
    });
    if (!account) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Account ${accountId} not found`,
      });
    }

    const transactions = await db.query.loyaltyTransactions.findMany({
      where: and(
        eq(schema.loyaltyTransactions.accountId, accountId),
        eq(schema.loyaltyTransactions.orgId, orgId),
      ),
      orderBy: [desc(schema.loyaltyTransactions.createdAt)],
      limit: 100,
    });
    return reply.status(200).send({ data: transactions });
  });
}
