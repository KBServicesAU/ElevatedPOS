import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://nexus:nexus_dev@localhost:5432/nexus_orders_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID     = '00000000-0000-0000-0000-000000000001';
const LOC_ID     = '00000000-0000-0000-0000-000000000002';
const CUSTOMER_1 = '00000000-0000-0000-0000-000000000101';
const PRODUCT_1  = '00000000-0000-0000-0000-000000000301';
const PRODUCT_2  = '00000000-0000-0000-0000-000000000303';

async function seed() {
  console.log('🌱 Seeding orders service…');

  // Completed order
  const [order] = await db.insert(schema.orders).values({
    orgId:       ORG_ID,
    locationId:  LOC_ID,
    customerId:  CUSTOMER_1,
    orderNumber: 'ORD-0001',
    orderType:   'dine_in',
    channel:     'pos',
    status:      'completed',
    subtotal:    '10.50',
    taxTotal:    '0.95',
    total:       '11.45',
    paidTotal:   '11.45',
    completedAt: new Date(),
  }).returning().onConflictDoNothing();

  if (order) {
    await db.insert(schema.orderLines).values([
      { orderId: order.id, productId: PRODUCT_1, productName: 'Flat White',  qty: 1, unitPrice: '5.50', lineTotal: '5.50',  status: 'fulfilled' },
      { orderId: order.id, productId: PRODUCT_2, productName: 'Croissant',   qty: 1, unitPrice: '5.00', lineTotal: '5.00',  status: 'fulfilled' },
    ]).onConflictDoNothing();
    console.log('  ✓ Demo order: ORD-0001 (completed)');
  }

  console.log('✅ Orders seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
