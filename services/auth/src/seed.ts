/**
 * Demo-org webStore refresh (v2.7.88).
 *
 * Counterpart to the dev seed at services/auth/src/db/seed.ts. The dev
 * seed creates the "Demo Cafe" organisation (slug='demo') with
 * owner@elevatedpos.dev as its employee — that's the org the platform
 * owner manages from the standard /dashboard flow they already use.
 *
 * This startup seed is the *production* counterpart: it does NOT create
 * a parallel org or employee. Instead it looks up whichever org currently
 * has slug='demo' and refreshes the webStore JSONB ONLY if it's empty
 * (i.e. a brand-new org that hasn't been customised yet). Once the
 * merchant edits any webStore field via /dashboard/web-store the seed
 * leaves it alone forever.
 *
 * If no org has slug='demo' the seed is a no-op — never auto-creates an
 * org. Spawning an org from a service-startup hook is too dangerous
 * (auto-onboarding past the billing flow, polluting the merchant list).
 */

import { Pool } from 'pg';

const DEMO_SLUG = 'demo';

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

// v2.7.91 — feature flags the demo org needs so the dashboard sidebar
// surfaces the Web Store + Click & Collect + Reservations editors. The
// hasFeature helper in sidebar-nav.tsx hides any nav item whose flag
// key isn't truthy, so without these the merchant has no path to the
// storefront editor.
const DEMO_FEATURE_FLAGS = {
  onlineOrdering: true,
  ecommerceWebsite: true,
  restaurantReservations: true,
  tableManagement: true,
};

export async function seedDemoOrg(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });
  const client = await pool.connect();
  try {
    const res = await client.query<{
      id: string;
      settings: Record<string, unknown> | null;
      feature_flags: Record<string, unknown> | null;
    }>(
      `SELECT id, settings, feature_flags FROM organisations WHERE slug = $1 LIMIT 1`,
      [DEMO_SLUG],
    );
    if (!res.rowCount) {
      console.log(`[auth] no org with slug='${DEMO_SLUG}' — demo seed skipped.`);
      return;
    }
    const row = res.rows[0]!;

    // ── webStore: only populate if currently empty so we don't stomp on edits.
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    const existingWebStore = settings['webStore'];
    const webStoreEmpty = !existingWebStore
      || typeof existingWebStore !== 'object'
      || Object.keys(existingWebStore as Record<string, unknown>).length === 0;
    if (webStoreEmpty) {
      const newSettings = { ...settings, webStore: DEMO_WEB_STORE };
      await client.query(
        `UPDATE organisations SET settings = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(newSettings), row.id],
      );
      console.log(`[auth] populated webStore on demo org ${row.id}.`);
    } else {
      console.log(`[auth] demo org ${row.id} already has webStore settings — leaving alone.`);
    }

    // ── featureFlags: merge in (don't replace) any missing flags. We
    // never turn flags OFF here — only flip on the ones the demo needs
    // so the dashboard editors show. Pre-existing merchant decisions
    // stick.
    const flags = (row.feature_flags ?? {}) as Record<string, unknown>;
    const missing = Object.entries(DEMO_FEATURE_FLAGS).filter(([k]) => flags[k] !== true);
    if (missing.length > 0) {
      const merged = { ...flags };
      for (const [k, v] of missing) merged[k] = v;
      await client.query(
        `UPDATE organisations SET feature_flags = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(merged), row.id],
      );
      console.log(`[auth] enabled ${missing.length} feature flag(s) on demo org ${row.id}: ${missing.map(([k]) => k).join(', ')}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
