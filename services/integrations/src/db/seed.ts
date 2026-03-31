import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import crypto from 'crypto';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_integrations_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function seed() {
  console.log('🌱 Seeding integrations service…');

  await db.insert(schema.webhooks).values({
    orgId:   ORG_ID,
    label:   'Dev Webhook (httpbin)',
    url:     'https://httpbin.org/post',
    events:  ['order.created', 'order.completed', 'payment.captured'],
    secret:  generateSecret(),
    enabled: true,
  }).onConflictDoNothing();
  console.log('  ✓ Dev webhook → httpbin.org/post');

  console.log('✅ Integrations seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
