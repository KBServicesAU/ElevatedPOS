import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_orders_dev',
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
  const registerId = '00000000-0000-0000-0000-000000000401';
  const employeeId = '00000000-0000-0000-0000-000000000501';

  const rows = await db.insert(schema.orders).values({
    orgId:       ORG_ID,
    locationId:  LOC_ID,
    registerId,
    customerId:  CUSTOMER_1,
    employeeId,
    orderNumber: 'ORD-0001',
    orderType:   'dine_in',
    channel:     'pos',
    status:      'completed',
    subtotal:    '10.5000',
    taxTotal:    '0.9500',
    total:       '11.4500',
    paidTotal:   '11.4500',
    completedAt: new Date(),
  }).returning().onConflictDoNothing();

  const order = rows[0];

  if (order) {
    await db.insert(schema.orderLines).values([
      { orderId: order.id, productId: PRODUCT_1, name: 'Flat White', sku: 'FW-001', quantity: '1', unitPrice: '5.5000', costPrice: '0', taxRate: '0', taxAmount: '0', discountAmount: '0', lineTotal: '5.5000', modifiers: [], status: 'served' },
      { orderId: order.id, productId: PRODUCT_2, name: 'Croissant',  sku: 'CR-001', quantity: '1', unitPrice: '5.0000', costPrice: '0', taxRate: '0', taxAmount: '0', discountAmount: '0', lineTotal: '5.0000', modifiers: [], status: 'served' },
    ]).onConflictDoNothing();
    console.log('  ✓ Demo order: ORD-0001 (completed)');
  }

  console.log('✅ Orders seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
