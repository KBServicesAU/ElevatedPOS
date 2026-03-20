import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://nexus:nexus_dev@localhost:5432/nexus_campaigns_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('🌱 Seeding campaigns service…');

  await db.insert(schema.campaigns).values([
    {
      orgId:   ORG_ID,
      name:    'Welcome New Customers',
      type:    'email',
      status:  'active',
      subject: 'Welcome to NEXUS — your first visit reward inside!',
      body:    'Hi {{firstName}}, thanks for joining us! Use code WELCOME10 for 10% off your next visit.',
      audienceFilter: { trigger: 'customer.created' },
    },
    {
      orgId:   ORG_ID,
      name:    'Gold Tier Congratulations',
      type:    'email',
      status:  'active',
      subject: "Congratulations — you've reached Gold tier!",
      body:    "Hi {{firstName}}, you've earned Gold status! Enjoy 1.5x points on every purchase from now on.",
      audienceFilter: { trigger: 'loyalty.tier_changed', tier: 'Gold' },
    },
  ]).onConflictDoNothing();
  console.log('  ✓ Campaigns: Welcome + Gold tier emails');

  console.log('✅ Campaigns seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
