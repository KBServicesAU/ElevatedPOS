import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_auth_dev',
  ssl: process.env['NODE_TLS_REJECT_UNAUTHORIZED'] === '0' ? { rejectUnauthorized: false } : undefined,
});
const db = drizzle(pool, { schema });

const ORG_ID  = '00000000-0000-0000-0000-000000000001';
const ROLE_ID = '00000000-0000-0000-0000-000000000002';

async function seed() {
  console.log('🌱 Seeding auth service…');

  // ── Organisation ──────────────────────────────────────────────────────────
  await db.insert(schema.organisations).values({
    id: ORG_ID,
    name: 'ElevatedPOS Demo Store',
    slug: 'elevatedpos-demo',
    country: 'AU',
    currency: 'AUD',
    timezone: 'Australia/Sydney',
    plan: 'starter',
    planStatus: 'active',
  }).onConflictDoNothing();
  console.log('  ✓ Organisation: ElevatedPOS Demo Store');

  // ── Owner role ────────────────────────────────────────────────────────────
  await db.insert(schema.roles).values({
    id: ROLE_ID,
    orgId: ORG_ID,
    name: 'Owner',
    description: 'Full access to all features',
    isSystemRole: true,
    permissions: { '*': true },
  }).onConflictDoNothing();
  console.log('  ✓ Role: Owner');

  // ── Employees ─────────────────────────────────────────────────────────────
  const ownerPassHash = await bcrypt.hash('nexus2024!', 12);
  const ownerPin      = await bcrypt.hash('1234', 10);

  await db.insert(schema.employees).values({
    orgId: ORG_ID,
    firstName: 'Store',
    lastName: 'Owner',
    email: 'owner@elevatedpos.dev',
    passwordHash: ownerPassHash,
    pin: ownerPin,
    roleId: ROLE_ID,
    locationIds: [],
    employmentType: 'full_time',
    isActive: true,
  }).onConflictDoNothing();
  console.log('  ✓ Employee: owner@elevatedpos.dev  |  password: nexus2024!  |  PIN: 1234');

  const managerPassHash = await bcrypt.hash('manager123!', 12);
  const managerPin      = await bcrypt.hash('5678', 10);

  await db.insert(schema.employees).values({
    orgId: ORG_ID,
    firstName: 'Jane',
    lastName: 'Manager',
    email: 'manager@elevatedpos.dev',
    passwordHash: managerPassHash,
    pin: managerPin,
    roleId: ROLE_ID,
    locationIds: [],
    employmentType: 'full_time',
    isActive: true,
  }).onConflictDoNothing();
  console.log('  ✓ Employee: manager@elevatedpos.dev  |  password: manager123!  |  PIN: 5678');

  // ── Platform Staff ────────────────────────────────────────────────────────
  const adminHash    = await bcrypt.hash('Admin2024!', 12);
  const supportHash  = await bcrypt.hash('Support2024!', 12);
  const resellerHash = await bcrypt.hash('Reseller2024!', 12);

  await db.insert(schema.platformStaff).values({
    email: 'admin@elevatedpos.com.au',
    passwordHash: adminHash,
    firstName: 'Platform',
    lastName: 'Admin',
    role: 'superadmin',
  }).onConflictDoUpdate({
    target: schema.platformStaff.email,
    set: { passwordHash: adminHash, firstName: 'Platform', lastName: 'Admin', role: 'superadmin', isActive: true },
  });
  console.log('  ✓ Platform superadmin: admin@elevatedpos.com.au  |  password: Admin2024!');

  await db.insert(schema.platformStaff).values({
    email: 'support@elevatedpos.com.au',
    passwordHash: supportHash,
    firstName: 'Support',
    lastName: 'Team',
    role: 'support',
  }).onConflictDoUpdate({
    target: schema.platformStaff.email,
    set: { passwordHash: supportHash, firstName: 'Support', lastName: 'Team', role: 'support', isActive: true },
  });
  console.log('  ✓ Platform support: support@elevatedpos.com.au  |  password: Support2024!');

  await db.insert(schema.platformStaff).values({
    email: 'reseller@elevatedpos.com.au',
    passwordHash: resellerHash,
    firstName: 'Demo',
    lastName: 'Reseller',
    role: 'reseller',
  }).onConflictDoUpdate({
    target: schema.platformStaff.email,
    set: { passwordHash: resellerHash, firstName: 'Demo', lastName: 'Reseller', role: 'reseller', isActive: true },
  });
  console.log('  ✓ Platform reseller: reseller@elevatedpos.com.au  |  password: Reseller2024!');

  console.log('\n✅ Auth seed complete');
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
