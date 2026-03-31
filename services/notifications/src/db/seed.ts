import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://elevatedpos:elevatedpos_dev@localhost:5432/elevatedpos_notifications_dev',
});
const db = drizzle(pool, { schema });

const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('🌱 Seeding notifications service…');

  await db.insert(schema.notificationTemplates).values([
    {
      orgId:   ORG_ID,
      name:    'Order Confirmation',
      channel: 'email',
      subject: 'Your order #{{orderNumber}} is confirmed',
      body:    'Hi {{customerName}}, your order for ${{total}} is confirmed and being prepared.',
      isActive: true,
    },
    {
      orgId:   ORG_ID,
      name:    'Order Ready',
      channel: 'push',
      subject: 'Your order is ready! 🎉',
      body:    'Order #{{orderNumber}} is ready for pickup.',
      isActive: true,
    },
    {
      orgId:   ORG_ID,
      name:    'Low Stock Alert',
      channel: 'email',
      subject: 'Low stock alert: {{productName}}',
      body:    '{{productName}} is running low at {{locationName}} — only {{qty}} units remaining.',
      isActive: true,
    },
  ]).onConflictDoNothing();
  console.log('  ✓ Notification templates: Order Confirmation, Order Ready, Low Stock Alert');

  console.log('✅ Notifications seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
