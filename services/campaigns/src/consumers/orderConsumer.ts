import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createConsumer } from '../lib/kafka.js';

const GROUP_ID = 'campaigns-service';

async function handleOrderCompleted(payload: Record<string, unknown>): Promise<void> {
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload;

  const orgId = (payload['orgId'] as string | undefined) ?? '';
  const orderId =
    (inner['orderId'] as string | undefined) ?? (payload['orderId'] as string | undefined) ?? '';
  const customerId =
    (inner['customerId'] as string | undefined) ?? (payload['customerId'] as string | undefined);

  if (!orgId) {
    console.warn('[campaigns/orderConsumer] order.completed missing orgId');
    return;
  }

  // Find active campaigns for this org that are triggered by order completion
  const activeCampaigns = await db.query.campaigns.findMany({
    where: and(
      eq(schema.campaigns.orgId, orgId),
      eq(schema.campaigns.status, 'active'),
    ),
  });

  if (!activeCampaigns.length) {
    return;
  }

  console.log(
    '[campaigns/orderConsumer] order.completed — checking %d active campaigns for orgId=%s orderId=%s',
    activeCampaigns.length,
    orgId,
    orderId,
  );

  // Evaluate each campaign — placeholder for rule-based evaluation
  for (const campaign of activeCampaigns) {
    try {
      // In a full implementation this would evaluate the campaign's targetSegment
      // rules against the order/customer data and enqueue sends for matching recipients.
      console.log(
        '[campaigns/orderConsumer] Evaluating campaign campaignId=%s type=%s for orderId=%s customerId=%s',
        campaign.id,
        campaign.type,
        orderId,
        customerId ?? 'anonymous',
      );
    } catch (err) {
      console.error(
        '[campaigns/orderConsumer] Error evaluating campaignId=%s for orderId=%s',
        campaign.id,
        orderId,
        err,
      );
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
      console.error('[campaigns/orderConsumer] Unhandled error for topic=%s', topic, err);
    }
  });
  console.log('[campaigns/orderConsumer] Subscribed to order.completed');
}
