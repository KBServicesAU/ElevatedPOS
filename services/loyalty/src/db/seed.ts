import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://nexus:nexus_dev@localhost:5432/nexus_loyalty_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID = '00000000-0000-0000-0000-000000000001';
// Must match customer IDs from customers seed
const CUSTOMER_ID_1 = '00000000-0000-0000-0000-000000000101';

async function seed() {
  console.log('🌱 Seeding loyalty service…');

  const [program] = await db.insert(schema.loyaltyPrograms).values({
    orgId: ORG_ID,
    name: 'NEXUS Rewards',
    earnRate: 10, // 10 points per $1
    active: true,
  }).returning().onConflictDoNothing();
  console.log('  ✓ Loyalty program: NEXUS Rewards (10 pts/$1)');

  if (!program) { await pool.end(); return; }

  // Tiers
  await db.insert(schema.loyaltyTiers).values([
    { orgId: ORG_ID, programId: program.id, name: 'Bronze',   minPoints: 0,    maxPoints: 499,  multiplier: '1.00' },
    { orgId: ORG_ID, programId: program.id, name: 'Silver',   minPoints: 500,  maxPoints: 1999, multiplier: '1.25' },
    { orgId: ORG_ID, programId: program.id, name: 'Gold',     minPoints: 2000, maxPoints: 4999, multiplier: '1.50' },
    { orgId: ORG_ID, programId: program.id, name: 'Platinum', minPoints: 5000, maxPoints: null, multiplier: '2.00' },
  ]).onConflictDoNothing();
  console.log('  ✓ Tiers: Bronze / Silver / Gold / Platinum');

  console.log('✅ Loyalty seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
