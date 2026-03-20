import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://nexus:nexus_dev@localhost:5432/nexus_auth_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('🌱 Seeding auth service…');

  const passwordHash = await bcrypt.hash('nexus2024!', 12);
  const pinHash = await bcrypt.hash('1234', 10);

  // Owner account
  await db.insert(schema.employees).values({
    orgId: ORG_ID,
    name: 'Store Owner',
    email: 'owner@nexuspos.dev',
    passwordHash,
    pinHash,
    role: 'owner',
    isActive: true,
  }).onConflictDoNothing();
  console.log('  ✓ Employee: owner@nexuspos.dev / password: nexus2024! / PIN: 1234');

  // Manager
  await db.insert(schema.employees).values({
    orgId: ORG_ID,
    name: 'Jane Manager',
    email: 'manager@nexuspos.dev',
    passwordHash: await bcrypt.hash('manager123!', 12),
    pinHash: await bcrypt.hash('5678', 10),
    role: 'manager',
    isActive: true,
  }).onConflictDoNothing();
  console.log('  ✓ Employee: manager@nexuspos.dev / PIN: 5678');

  // Cashier
  await db.insert(schema.employees).values({
    orgId: ORG_ID,
    name: 'Alex Cashier',
    email: 'cashier@nexuspos.dev',
    passwordHash: await bcrypt.hash('cashier123!', 12),
    pinHash: await bcrypt.hash('9999', 10),
    role: 'cashier',
    isActive: true,
  }).onConflictDoNothing();
  console.log('  ✓ Employee: cashier@nexuspos.dev / PIN: 9999');

  console.log('✅ Auth seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
