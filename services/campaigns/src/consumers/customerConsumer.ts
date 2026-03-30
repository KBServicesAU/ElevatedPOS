import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createConsumer } from '../lib/kafka.js';

const GROUP_ID = 'campaigns-service';

async function handleCustomerCreated(payload: Record<string, unknown>): Promise<void> {
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload;

  const orgId = (payload['orgId'] as string | undefined) ?? '';
  const customerId =
    (inner['customerId'] as string | undefined) ?? (payload['customerId'] as string | undefined);

  if (!orgId || !customerId) {
    console.warn('[campaigns/customerConsumer] customer.created missing orgId or customerId');
    return;
  }

  // Find scheduled or active "welcome" campaigns for this org
  // Welcome campaigns are identified by name convention or a specific tag (type = 'email' and status active/scheduled)
  const welcomeCampaigns = await db.query.campaigns.findMany({
    where: and(
      eq(schema.campaigns.orgId, orgId),
      eq(schema.campaigns.status, 'active'),
    ),
  });

  const welcomeFlows = welcomeCampaigns.filter(
    (c) => c.name.toLowerCase().includes('welcome'),
  );

  if (!welcomeFlows.length) {
    console.log(
      '[campaigns/customerConsumer] No welcome campaigns found for orgId=%s — skipping',
      orgId,
    );
    return;
  }

  console.log(
    '[campaigns/customerConsumer] customer.created — triggering %d welcome campaign(s) for customerId=%s orgId=%s',
    welcomeFlows.length,
    customerId,
    orgId,
  );

  for (const campaign of welcomeFlows) {
    try {
      // In a full implementation this would enqueue a send to the new customer
      // using the campaign's template/message and channel.
      console.log(
        '[campaigns/customerConsumer] Triggering welcome campaignId=%s type=%s for customerId=%s',
        campaign.id,
        campaign.type,
        customerId,
      );
    } catch (err) {
      console.error(
        '[campaigns/customerConsumer] Error triggering campaignId=%s for customerId=%s',
        campaign.id,
        customerId,
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
      console.error('[campaigns/customerConsumer] Unhandled error for topic=%s', topic, err);
    }
  });
  console.log('[campaigns/customerConsumer] Subscribed to customer.created');
}
