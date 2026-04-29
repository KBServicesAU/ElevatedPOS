/**
 * Demo-org product seed (v2.7.87).
 *
 * Counterpart to services/auth/src/seed.ts — once the auth service has
 * provisioned the Demo Cafe org, the catalog service drops a small set
 * of menu items into it on startup so the public storefront at /demo
 * always renders a populated menu.
 *
 * Runs idempotently:
 *   • Looks up the demo org by slug='demo' in the shared Postgres
 *     (auth + catalog use the same database).
 *   • Bails if any product already exists for that org — we never want
 *     to recreate items the merchant deleted, or duplicate on every
 *     pod restart.
 *   • Otherwise inserts a Coffee + Food category and seven sample
 *     products with web-store metadata (slugs, descriptions, channel
 *     flags) so they show up on /demo immediately.
 */

import { Pool } from 'pg';

interface ProductSeed {
  name: string;
  sku: string;
  basePrice: string; // decimal as string, dollars (e.g. '5.50')
  category: 'Coffee' | 'Food';
  webDescription?: string;
  webFeatured?: boolean;
}

const PRODUCTS: ProductSeed[] = [
  { name: 'Flat White',      sku: 'COF-001', basePrice: '5.50', category: 'Coffee', webDescription: 'Double shot espresso, velvety steamed milk, fine micro-foam.', webFeatured: true },
  { name: 'Latte',           sku: 'COF-002', basePrice: '5.50', category: 'Coffee', webDescription: 'Smooth espresso topped with silky steamed milk.' },
  { name: 'Long Black',      sku: 'COF-003', basePrice: '5.00', category: 'Coffee', webDescription: 'Two shots of espresso over hot water — bold, clean, full-bodied.' },
  { name: 'Cappuccino',      sku: 'COF-004', basePrice: '5.50', category: 'Coffee', webDescription: 'Espresso with foamed milk and a dusting of cocoa.' },
  { name: 'Avocado Toast',   sku: 'FOOD-001', basePrice: '14.50', category: 'Food', webDescription: 'Smashed avo on sourdough with feta, lemon, chilli flakes, and pepitas.', webFeatured: true },
  { name: 'Bacon & Egg Roll',sku: 'FOOD-002', basePrice: '12.00', category: 'Food', webDescription: 'Smoky bacon, free-range egg, tomato relish, milk bun.' },
  { name: 'Banana Bread',    sku: 'FOOD-003', basePrice: '6.00',  category: 'Food', webDescription: 'House-made, served warm with butter.' },
];

export async function seedDemoProducts(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });
  const client = await pool.connect();
  try {
    // 1. Look up the demo org. If it doesn't exist yet, the auth seed
    //    hasn't run — bail and let the next pod restart try again.
    const orgRes = await client.query<{ id: string }>(
      `SELECT id FROM organisations WHERE slug = 'demo' LIMIT 1`,
    );
    if (!orgRes.rowCount) {
      console.log('[catalog] demo org not found — skipping product seed.');
      return;
    }
    const orgId = orgRes.rows[0]!.id;

    // 2. If the org already has any products, leave them alone. Even one
    //    product means a merchant has been editing the catalog and we
    //    must not stomp on their work.
    const existing = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM products WHERE org_id = $1`,
      [orgId],
    );
    if (Number(existing.rows[0]?.count ?? '0') > 0) {
      console.log(`[catalog] demo org already has products — skipping seed.`);
      return;
    }

    // 3. Insert categories. We don't use ON CONFLICT here because the
    //    earlier zero-product check already established the org is empty.
    const categoryIds: Record<string, string> = {};
    for (const name of ['Coffee', 'Food'] as const) {
      const slug = name.toLowerCase();
      const r = await client.query<{ id: string }>(
        `INSERT INTO categories (org_id, name, slug, is_active, sort_order)
         VALUES ($1, $2, $3, true, 0)
         RETURNING id`,
        [orgId, name, slug],
      );
      categoryIds[name] = r.rows[0]!.id;
    }

    // 4. Insert products with web-store metadata so they show up on the
    //    public /demo page immediately.
    for (const p of PRODUCTS) {
      const webSlug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await client.query(
        `INSERT INTO products
           (org_id, category_id, name, sku, base_price, is_active, is_sold_online, is_sold_instore,
            channels, web_slug, web_description, web_featured)
         VALUES ($1, $2, $3, $4, $5, true, true, true,
                 ARRAY['pos','web']::text[], $6, $7, $8)`,
        [
          orgId,
          categoryIds[p.category],
          p.name,
          p.sku,
          p.basePrice,
          webSlug,
          p.webDescription ?? null,
          p.webFeatured ?? false,
        ],
      );
    }

    console.log(`[catalog] seeded ${PRODUCTS.length} demo products for org ${orgId}`);
  } finally {
    client.release();
    await pool.end();
  }
}
