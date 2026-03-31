import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_automations_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('🌱 Seeding automations service…');

  await db.insert(schema.automationRules).values([
    {
      orgId:      ORG_ID,
      name:       'Low Stock → Notify Manager',
      trigger:    'low_stock',
      conditions: [{ field: 'onHand', operator: 'lte', value: 5 }],
      actions:    [{ type: 'send_notification', channel: 'email', templateId: 'low-stock-alert' }],
      enabled:    true,
    },
    {
      orgId:      ORG_ID,
      name:       'Birthday → Send Reward',
      trigger:    'birthday',
      conditions: [],
      actions:    [{ type: 'award_points', points: 200 }, { type: 'send_notification', channel: 'email', templateId: 'birthday-reward' }],
      enabled:    true,
    },
    {
      orgId:      ORG_ID,
      name:       'Order Completed → Award Loyalty Points',
      trigger:    'order_completed',
      conditions: [],
      actions:    [{ type: 'award_loyalty_points', earnRateMultiplier: 1 }],
      enabled:    true,
    },
  ]).onConflictDoNothing();
  console.log('  ✓ Automation rules: Low Stock, Birthday, Order Completed');

  console.log('✅ Automations seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
