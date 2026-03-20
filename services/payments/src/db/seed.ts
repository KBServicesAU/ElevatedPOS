import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://nexus:nexus_dev@localhost:5432/nexus_payments_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID  = '00000000-0000-0000-0000-000000000001';
const LOC_ID  = '00000000-0000-0000-0000-000000000002';
const ORDER_1 = '00000000-0000-0000-0000-000000000401';

async function seed() {
  console.log('🌱 Seeding payments service…');

  await db.insert(schema.payments).values({
    orgId:     ORG_ID,
    locationId: LOC_ID,
    orderId:   ORDER_1,
    method:    'card',
    status:    'captured',
    amount:    '11.45',
    currency:  'AUD',
    capturedAt: new Date(),
  }).onConflictDoNothing();
  console.log('  ✓ Demo payment: $11.45 card — captured');

  console.log('✅ Payments seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
