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
  // v2.7.88 — slug is now 'demo' so the org is reachable at
  //   site.elevatedpos.com.au/demo
  // and owner@elevatedpos.dev manages it via the standard /dashboard
  // flow they already use. The webStore JSONB is populated up-front so
  // /demo renders a fully customised storefront immediately, but every
  // field is editable through /dashboard/web-store like a normal merchant.
  const DEMO_WEB_STORE = {
    enabled: true,
    theme: 'warm',
    description: 'Fresh coffee and food, made to order. Pre-order online for pickup or reserve a table.',
    primaryColor: '#b45309',
    logoUrl: null,
    heroImageUrl: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=1600&q=80',
    heroCtaText: null,
    aboutText:
      "A neighbourhood café serving specialty coffee since 2018. Single-origin beans roasted weekly, breakfast and lunch made fresh daily. Pop in or pre-order online — we'll have it ready for you when you arrive.",
    contact: {
      phone: '+61 3 9000 0000',
      email: 'hello@democafe.example',
      address: '42 Demo Street, Melbourne VIC 3000',
    },
    hours: {
      mon: { open: '07:00', close: '15:00' },
      tue: { open: '07:00', close: '15:00' },
      wed: { open: '07:00', close: '15:00' },
      thu: { open: '07:00', close: '15:00' },
      fri: { open: '07:00', close: '15:00' },
      sat: { open: '08:00', close: '14:00' },
      sun: null,
    },
    socials: {
      instagram: 'https://instagram.com/elevatedpos',
      facebook: null, twitter: null, tiktok: null, website: null,
    },
    onlineOrderingEnabled: true,
    reservationsEnabled: true,
    bookingsEnabled: false,
    bookingServices: [],
    inventorySync: true,
    shippingFlatRateCents: null,
  };

  // v2.7.88 — upsert (not just onConflictDoNothing) so re-running this
  // seed against a DB that previously had slug='elevatedpos-demo' /
  // empty webStore migrates it to the new shape. The seed file is the
  // canonical source of truth for the demo's "fresh state" — any local
  // edits should happen via /dashboard/web-store, not by hand-editing
  // the DB.
  await db.insert(schema.organisations).values({
    id: ORG_ID,
    name: 'Demo Cafe',
    slug: 'demo',
    country: 'AU',
    currency: 'AUD',
    timezone: 'Australia/Melbourne',
    plan: 'starter',
    planStatus: 'active',
    industry: 'cafe',
    settings: { webStore: DEMO_WEB_STORE },
  }).onConflictDoUpdate({
    target: schema.organisations.id,
    set: {
      name: 'Demo Cafe',
      slug: 'demo',
      industry: 'cafe',
      settings: { webStore: DEMO_WEB_STORE },
    },
  });
  console.log('  ✓ Organisation: Demo Cafe (slug=demo, owner=owner@elevatedpos.dev)');

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
