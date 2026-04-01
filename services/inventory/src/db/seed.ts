import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_inventory_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID  = '00000000-0000-0000-0000-000000000001';
const LOC_ID  = '00000000-0000-0000-0000-000000000002'; // Main store location
// Product IDs must match catalog seed
const PRODUCTS = [
  '00000000-0000-0000-0000-000000000301', // Flat White
  '00000000-0000-0000-0000-000000000302', // Long Black
  '00000000-0000-0000-0000-000000000303', // Croissant
  '00000000-0000-0000-0000-000000000304', // Avocado Toast
];

async function seed() {
  console.log('🌱 Seeding inventory service…');

  // Default supplier
  await db.insert(schema.suppliers).values({
    orgId: ORG_ID,
    name: 'Metro Wholesale Foods',
    contactName: 'James White',
    email: 'orders@metrowholesale.com.au',
    phone: '+61298765432',
    isActive: true,
  }).returning().onConflictDoNothing();
  console.log('  ✓ Supplier: Metro Wholesale Foods');

  // Opening stock for dev location
  const stockEntries = [
    { locationId: LOC_ID, productId: PRODUCTS[0]!, onHand: '200' },
    { locationId: LOC_ID, productId: PRODUCTS[1]!, onHand: '200' },
    { locationId: LOC_ID, productId: PRODUCTS[2]!, onHand: '24'  },
    { locationId: LOC_ID, productId: PRODUCTS[3]!, onHand: '12'  },
  ];

  for (const entry of stockEntries) {
    await db.insert(schema.stockItems).values({ orgId: ORG_ID, locationId: entry.locationId, productId: entry.productId, onHand: entry.onHand }).onConflictDoNothing();
  }
  console.log(`  ✓ Opening stock: ${stockEntries.length} product-location entries`);

  console.log('✅ Inventory seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
