/**
 * Demo-org seed (v2.7.87).
 *
 * Idempotently provisions a "Demo Cafe" merchant the public marketing
 * site links to from the "Try the demo" button. The org and its login
 * are created on first run so the platform owner can sign in at
 *   /signin → demo@elevatedpos.com.au / <DEMO_ORG_PASSWORD or 'demo1234'>
 * and edit the storefront via /dashboard/web-store like any normal
 * merchant. Subsequent runs are no-ops — we never overwrite an existing
 * row so a merchant's edits aren't clobbered on every deploy.
 *
 * Three things get seeded:
 *   1. organisations row with slug='demo' + rich webStore JSONB
 *   2. employees row for demo@elevatedpos.com.au (bcrypt 12 rounds)
 *   3. roles row mapped to the employee — owner-level so they can edit
 *
 * Sample products live in the catalog service (services/catalog/src/seed.ts).
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const DEMO_SLUG = 'demo';
const DEMO_BUSINESS_NAME = 'Demo Cafe';
const DEMO_EMAIL = 'demo@elevatedpos.com.au';

// Default password used only on the *first* seed run. Override in prod by
// setting DEMO_ORG_PASSWORD before tagging — the ConfigMap pipes it
// through to the auth pod. After first run the seed never touches the
// employee row again, so rotating the password via the dashboard sticks.
function defaultDemoPassword(): string {
  return process.env['DEMO_ORG_PASSWORD'] ?? 'demo1234';
}

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
    facebook: null,
    twitter: null,
    tiktok: null,
    website: null,
  },
  onlineOrderingEnabled: true,
  reservationsEnabled: true,
  bookingsEnabled: false,
  bookingServices: [],
  inventorySync: true,
  shippingFlatRateCents: null,
};

export async function seedDemoOrg(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });
  const client = await pool.connect();
  try {
    // 1. Bail early if the org already exists. We never overwrite an
    //    existing row because the merchant may have already customised it.
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM organisations WHERE slug = $1 LIMIT 1',
      [DEMO_SLUG],
    );
    let orgId: string;
    let isNewOrg = false;

    if (existing.rowCount && existing.rowCount > 0) {
      orgId = existing.rows[0]!.id;
      console.log(`[auth] demo org already exists (${orgId}) — skipping insert.`);
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO organisations
           (name, slug, country, currency, timezone, plan, plan_status, industry, settings, onboarding_step, onboarding_step_v2, onboarding_completed_at, billing_model, subscription_status)
         VALUES ($1, $2, 'AU', 'AUD', 'Australia/Melbourne', 'starter', 'active', 'cafe',
                 $3::jsonb, 'completed', 'completed', NOW(), 'legacy', 'active')
         RETURNING id`,
        [DEMO_BUSINESS_NAME, DEMO_SLUG, JSON.stringify({ webStore: DEMO_WEB_STORE })],
      );
      orgId = inserted.rows[0]!.id;
      isNewOrg = true;
      console.log(`[auth] seeded demo org: ${orgId}`);
    }

    // 2. Owner role for the demo org. Drizzle's role table allows null
    //    orgId for system roles — we want a regular org-scoped owner so
    //    permissions stay self-contained.
    const roleRes = await client.query<{ id: string }>(
      `SELECT id FROM roles WHERE org_id = $1 AND name = 'Owner' LIMIT 1`,
      [orgId],
    );
    let roleId: string;
    if (roleRes.rowCount && roleRes.rowCount > 0) {
      roleId = roleRes.rows[0]!.id;
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO roles (org_id, name, description, is_system_role, permissions)
         VALUES ($1, 'Owner', 'Full access', false, $2::jsonb)
         RETURNING id`,
        [orgId, JSON.stringify({ all: true })],
      );
      roleId = inserted.rows[0]!.id;
      console.log(`[auth] seeded demo Owner role: ${roleId}`);
    }

    // 3. Employee with a known login so the platform owner can sign in
    //    and edit the demo just like a normal merchant. We never touch
    //    the row on subsequent runs so password rotations stick.
    const empRes = await client.query<{ id: string }>(
      `SELECT id FROM employees WHERE org_id = $1 AND email = $2 LIMIT 1`,
      [orgId, DEMO_EMAIL],
    );
    if (empRes.rowCount === 0) {
      const passwordHash = await bcrypt.hash(defaultDemoPassword(), 12);
      await client.query(
        `INSERT INTO employees (org_id, role_id, first_name, last_name, email, password_hash, is_active)
         VALUES ($1, $2, 'Demo', 'Owner', $3, $4, true)`,
        [orgId, roleId, DEMO_EMAIL, passwordHash],
      );
      console.log(
        `[auth] seeded demo employee: ${DEMO_EMAIL} (default password: '${defaultDemoPassword()}' — ROTATE AFTER FIRST LOGIN)`,
      );
    }

    // 4. A default location is required by the order/POS flows. Add one
    //    only when the org is brand new — we don't want to revive a
    //    location the merchant deleted.
    if (isNewOrg) {
      await client.query(
        `INSERT INTO locations (org_id, name, address, phone, timezone, type, is_active)
         VALUES ($1, 'Main', $2::jsonb, '+61 3 9000 0000', 'Australia/Melbourne', 'cafe', true)
         ON CONFLICT DO NOTHING`,
        [orgId, JSON.stringify({
          line1: '42 Demo Street',
          city: 'Melbourne',
          state: 'VIC',
          postcode: '3000',
          country: 'AU',
        })],
      );
      console.log(`[auth] seeded demo location for org ${orgId}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
