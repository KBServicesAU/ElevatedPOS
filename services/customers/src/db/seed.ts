import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_customers_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('🌱 Seeding customers service…');

  const customers = await db.insert(schema.customers).values([
    { orgId: ORG_ID, firstName: 'Sarah', lastName: 'Chen',    email: 'sarah.chen@example.com',   phone: '+61412345678', tags: ['vip'], marketingOptIn: true },
    { orgId: ORG_ID, firstName: 'Marcus', lastName: 'Rivera', email: 'marcus.r@example.com',     phone: '+61423456789', tags: [], marketingOptIn: false },
    { orgId: ORG_ID, firstName: 'Emma',  lastName: 'Johnson', email: 'emma.j@example.com',       phone: '+61434567890', tags: ['regular'], marketingOptIn: true },
    { orgId: ORG_ID, firstName: 'David', lastName: 'Kim',     email: 'david.kim@example.com',    phone: '+61445678901', tags: ['vip', 'wholesale'], marketingOptIn: true },
    { orgId: ORG_ID, firstName: 'Priya', lastName: 'Sharma',  email: 'priya.s@example.com',      phone: '+61456789012', tags: [], marketingOptIn: false },
  ]).returning().onConflictDoNothing();

  console.log(`  ✓ Created ${customers.length} customers`);

  // Give first customer store credit
  if (customers[0]) {
    const [account] = await db.insert(schema.storeCreditAccounts).values({
      orgId: ORG_ID,
      customerId: customers[0].id,
      balance: '50.00',
    }).returning().onConflictDoNothing();

    if (account) {
      await db.insert(schema.storeCreditTransactions).values({
        orgId: ORG_ID,
        accountId: account.id,
        amount: '50.00',
        type: 'issue',
        notes: 'Initial credit — seed data',
      }).onConflictDoNothing();
      console.log('  ✓ Store credit: $50.00 for Sarah Chen');
    }
  }

  console.log('✅ Customers seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
