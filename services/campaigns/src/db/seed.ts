import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_campaigns_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('🌱 Seeding campaigns service…');

  await db.insert(schema.campaigns).values([
    {
      orgId:          ORG_ID,
      name:           'Welcome New Customers',
      type:           'email',
      status:         'active',
      targetSegment:  { trigger: 'customer.created' } as unknown,
    },
    {
      orgId:          ORG_ID,
      name:           'Gold Tier Congratulations',
      type:           'email',
      status:         'active',
      targetSegment:  { trigger: 'loyalty.tier_changed', tier: 'Gold' } as unknown,
    },
  ]).onConflictDoNothing();
  console.log('  ✓ Campaigns: Welcome + Gold tier emails');

  console.log('✅ Campaigns seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
