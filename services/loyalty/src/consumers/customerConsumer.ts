import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createConsumer } from '../lib/kafka.js';

const GROUP_ID = 'loyalty-service';

async function handleCustomerCreated(payload: Record<string, unknown>): Promise<void> {
  // Support BaseEvent envelope (payload field) or flat shape
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload;

  const customerId =
    (inner['customerId'] as string | undefined) ?? (payload['customerId'] as string | undefined);
  const orgId = (payload['orgId'] as string | undefined) ?? '';

  if (!customerId || !orgId) {
    console.warn('[loyalty/customerConsumer] customer.created missing customerId or orgId');
    return;
  }

  // Find all active loyalty programs for this org and auto-enroll
  const programs = await db.query.loyaltyPrograms.findMany({
    where: and(
      eq(schema.loyaltyPrograms.orgId, orgId),
      eq(schema.loyaltyPrograms.active, true),
    ),
  });

  if (!programs.length) {
    console.log('[loyalty/customerConsumer] No active loyalty programs for orgId=%s', orgId);
    return;
  }

  for (const program of programs) {
    try {
      // Check if account already exists (idempotency)
      const existing = await db.query.loyaltyAccounts.findFirst({
        where: and(
          eq(schema.loyaltyAccounts.customerId, customerId),
          eq(schema.loyaltyAccounts.programId, program.id),
          eq(schema.loyaltyAccounts.orgId, orgId),
        ),
      });

      if (existing) {
        console.log(
          '[loyalty/customerConsumer] Account already exists for customerId=%s programId=%s — skipped',
          customerId,
          program.id,
        );
        continue;
      }

      await db.insert(schema.loyaltyAccounts).values({
        orgId,
        customerId,
        programId: program.id,
      });

      console.log(
        '[loyalty/customerConsumer] Auto-enrolled customerId=%s in programId=%s',
        customerId,
        program.id,
      );
    } catch (err) {
      console.error(
        '[loyalty/customerConsumer] Error enrolling customerId=%s in programId=%s',
        customerId,
        program.id,
        err,
      );
    }
  }
}

export async function startCustomerConsumer(): Promise<void> {
  await createConsumer(GROUP_ID, ['customer.created'], async (topic, payload) => {
    try {
      if (topic === 'customer.created') {
        await handleCustomerCreated(payload);
      }
    } catch (err) {
      console.error('[loyalty/customerConsumer] Unhandled error for topic=%s', topic, err);
    }
  });
  console.log('[loyalty/customerConsumer] Subscribed to customer.created');
}
