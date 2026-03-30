import { eq, and, lte, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createConsumer, publishEvent } from '../lib/kafka.js';

const GROUP_ID = 'loyalty-service';
const BASE_POINTS_PER_DOLLAR = 1;

async function handleOrderCompleted(payload: Record<string, unknown>): Promise<void> {
  // Support BaseEvent envelope (payload field) or flat shape
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload;

  const customerId = (inner['customerId'] as string | undefined) ?? (payload['customerId'] as string | undefined);
  const orgId = (payload['orgId'] as string | undefined) ?? '';
  const orderId = (inner['orderId'] as string | undefined) ?? (payload['orderId'] as string | undefined);
  const total = Number((inner['total'] as number | undefined) ?? (payload['total'] as number | undefined) ?? 0);

  if (!customerId) {
    // No customer attached to this order — nothing to earn
    return;
  }

  // Find all loyalty accounts for this customer in this org
  const accounts = await db.query.loyaltyAccounts.findMany({
    where: and(
      eq(schema.loyaltyAccounts.customerId, customerId),
      eq(schema.loyaltyAccounts.orgId, orgId),
    ),
  });

  if (!accounts.length) {
    console.log('[loyalty/orderConsumer] No loyalty accounts for customerId=%s', customerId);
    return;
  }

  // Calculate base points from total (total is in dollars)
  const totalCents = Math.round(total * 100);
  const basePoints = Math.floor(totalCents / 100) * BASE_POINTS_PER_DOLLAR;

  if (basePoints <= 0) return;

  // Apply multiplier events
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayDow = today.getDay();

  const activeMultiplierEvents = await db.query.pointsMultiplierEvents.findMany({
    where: and(
      eq(schema.pointsMultiplierEvents.orgId, orgId),
      eq(schema.pointsMultiplierEvents.isActive, true),
      lte(schema.pointsMultiplierEvents.startDate, todayStr),
      gte(schema.pointsMultiplierEvents.endDate, todayStr),
    ),
  });

  const matchingMultipliers = activeMultiplierEvents
    .filter((evt) => {
      const dows = (evt.daysOfWeek ?? []) as number[];
      return dows.length === 0 || dows.includes(todayDow);
    })
    .filter((evt) => {
      const productIds = (evt.productIds ?? null) as string[] | null;
      const categoryIds = (evt.categoryIds ?? null) as string[] | null;
      // If no product/category scope, applies to all orders
      return !productIds?.length && !categoryIds?.length;
    })
    .map((evt) => Number(evt.multiplier));

  const campaignMultiplier = matchingMultipliers.length > 0 ? Math.max(...matchingMultipliers) : 1;
  const finalPoints = Math.floor(basePoints * campaignMultiplier);

  for (const account of accounts) {
    try {
      const previousTierId = account.tierId;
      const newPoints = account.points + finalPoints;
      const newLifetimePoints = account.lifetimePoints + finalPoints;

      await db
        .update(schema.loyaltyAccounts)
        .set({ points: newPoints, lifetimePoints: newLifetimePoints, updatedAt: new Date() })
        .where(eq(schema.loyaltyAccounts.id, account.id));

      const idempotencyKey = `order-complete-${orderId}-${account.id}`;

      // Check idempotency
      const existingTx = await db.query.loyaltyTransactions.findFirst({
        where: and(
          eq(schema.loyaltyTransactions.orgId, orgId),
          eq(schema.loyaltyTransactions.idempotencyKey, idempotencyKey),
        ),
      });
      if (existingTx) {
        console.log('[loyalty/orderConsumer] Duplicate event for orderId=%s accountId=%s — skipped', orderId, account.id);
        continue;
      }

      await db.insert(schema.loyaltyTransactions).values({
        orgId,
        accountId: account.id,
        orderId: orderId ?? null,
        type: 'earn',
        points: finalPoints,
        idempotencyKey,
      });

      // Recalculate tier
      const tiers = await db.query.loyaltyTiers.findMany({
        where: eq(schema.loyaltyTiers.programId, account.programId),
      });

      let newTierId: string | null = null;
      let bestMin = -1;
      for (const tier of tiers) {
        if (newLifetimePoints >= tier.minPoints && tier.minPoints > bestMin) {
          const withinMax = tier.maxPoints === null || newLifetimePoints <= tier.maxPoints;
          if (withinMax) {
            bestMin = tier.minPoints;
            newTierId = tier.id;
          }
        }
      }

      await db
        .update(schema.loyaltyAccounts)
        .set({ tierId: newTierId, updatedAt: new Date() })
        .where(eq(schema.loyaltyAccounts.id, account.id));

      // Publish tier_changed event if tier has changed
      if (newTierId !== previousTierId) {
        const previousTier = tiers.find((t) => t.id === previousTierId);
        const newTier = tiers.find((t) => t.id === newTierId);
        await publishEvent('loyalty.tier_changed', {
          orgId,
          customerId,
          accountId: account.id,
          previousTier: previousTier?.name ?? 'none',
          newTier: newTier?.name ?? 'none',
          timestamp: new Date().toISOString(),
        });
        console.log(
          '[loyalty/orderConsumer] Tier changed for customerId=%s: %s -> %s',
          customerId,
          previousTier?.name ?? 'none',
          newTier?.name ?? 'none',
        );
      }

      console.log(
        '[loyalty/orderConsumer] Awarded %d points to accountId=%s (orderId=%s, multiplier=%.2f)',
        finalPoints,
        account.id,
        orderId,
        campaignMultiplier,
      );
    } catch (err) {
      console.error('[loyalty/orderConsumer] Error processing account accountId=%s', account.id, err);
    }
  }
}

export async function startOrderConsumer(): Promise<void> {
  await createConsumer(GROUP_ID, ['order.completed'], async (topic, payload) => {
    try {
      if (topic === 'order.completed') {
        await handleOrderCompleted(payload);
      }
    } catch (err) {
      console.error('[loyalty/orderConsumer] Unhandled error for topic=%s', topic, err);
    }
  });
  console.log('[loyalty/orderConsumer] Subscribed to order.completed');
}
