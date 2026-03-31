import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_catalog_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('🌱 Seeding catalog service…');

  // Tax classes
  const [gst] = await db.insert(schema.taxClasses).values({
    orgId: ORG_ID,
    name: 'GST (10%)',
    rate: '0.1000',
    isInclusive: true,
    isDefault: true,
    description: 'Australian GST — included in price',
  }).returning().onConflictDoNothing();
  console.log('  ✓ Tax class: GST');

  // Categories
  const [coffee, food, drinks, desserts] = await db.insert(schema.categories).values([
    { orgId: ORG_ID, name: 'Coffee',   slug: 'coffee',   sortOrder: 1 },
    { orgId: ORG_ID, name: 'Food',     slug: 'food',     sortOrder: 2 },
    { orgId: ORG_ID, name: 'Drinks',   slug: 'drinks',   sortOrder: 3 },
    { orgId: ORG_ID, name: 'Desserts', slug: 'desserts', sortOrder: 4 },
  ]).returning().onConflictDoNothing();
  console.log('  ✓ Categories: Coffee, Food, Drinks, Desserts');

  // Products
  await db.insert(schema.products).values([
    { orgId: ORG_ID, name: 'Flat White',    sku: 'COF-FW',   categoryId: coffee?.id, taxClassId: gst?.id, basePrice: '5.50',  costPrice: '1.20', productType: 'standard' },
    { orgId: ORG_ID, name: 'Long Black',    sku: 'COF-LB',   categoryId: coffee?.id, taxClassId: gst?.id, basePrice: '4.50',  costPrice: '0.90', productType: 'standard' },
    { orgId: ORG_ID, name: 'Cappuccino',    sku: 'COF-CAP',  categoryId: coffee?.id, taxClassId: gst?.id, basePrice: '5.50',  costPrice: '1.20', productType: 'standard' },
    { orgId: ORG_ID, name: 'Cold Brew',     sku: 'COF-CB',   categoryId: coffee?.id, taxClassId: gst?.id, basePrice: '6.50',  costPrice: '1.50', productType: 'standard' },
    { orgId: ORG_ID, name: 'Croissant',     sku: 'FOOD-CRO', categoryId: food?.id,   taxClassId: gst?.id, basePrice: '5.00',  costPrice: '2.00', productType: 'standard', trackStock: true, reorderPoint: 5 },
    { orgId: ORG_ID, name: 'Avocado Toast', sku: 'FOOD-AVO', categoryId: food?.id,   taxClassId: gst?.id, basePrice: '18.00', costPrice: '6.00', productType: 'standard' },
    { orgId: ORG_ID, name: 'Orange Juice',  sku: 'DRK-OJ',   categoryId: drinks?.id, taxClassId: gst?.id, basePrice: '7.00',  costPrice: '2.00', productType: 'standard' },
    { orgId: ORG_ID, name: 'Banana Bread',  sku: 'DSS-BB',   categoryId: desserts?.id, taxClassId: gst?.id, basePrice: '6.00', costPrice: '2.50', productType: 'standard', trackStock: true },
  ]).onConflictDoNothing();
  console.log('  ✓ Products: 8 items');

  // Modifier group — Milk options
  const [milkGroup] = await db.insert(schema.modifierGroups).values({
    orgId: ORG_ID,
    name: 'Milk Type',
    selectionType: 'single',
    required: false,
    minSelections: 0,
    maxSelections: 1,
  }).returning().onConflictDoNothing();

  if (milkGroup) {
    await db.insert(schema.modifierOptions).values([
      { groupId: milkGroup.id, name: 'Full Cream',  priceAdjustment: '0.00', isDefault: true },
      { groupId: milkGroup.id, name: 'Oat Milk',    priceAdjustment: '0.80' },
      { groupId: milkGroup.id, name: 'Almond Milk', priceAdjustment: '0.80' },
      { groupId: milkGroup.id, name: 'Soy Milk',    priceAdjustment: '0.50' },
    ]).onConflictDoNothing();
    console.log('  ✓ Modifier group: Milk Type with 4 options');
  }

  console.log('✅ Catalog seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
