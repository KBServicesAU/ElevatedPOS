import { pgTable, uuid, varchar, boolean, timestamp, jsonb, decimal, integer, text, pgEnum } from 'drizzle-orm/pg-core';

export const orderStatusEnum = pgEnum('order_status', ['open', 'held', 'completed', 'cancelled', 'refunded', 'partially_refunded']);
export const orderTypeEnum = pgEnum('order_type', ['retail', 'dine_in', 'takeaway', 'delivery', 'pickup', 'layby', 'quote']);
export const channelEnum = pgEnum('channel', ['pos', 'online', 'kiosk', 'qr', 'marketplace', 'delivery', 'phone']);
export const lineStatusEnum = pgEnum('line_status', ['pending', 'sent_to_kitchen', 'ready', 'served', 'void', 'comp']);
export const refundMethodEnum = pgEnum('refund_method', ['original', 'store_credit', 'cash', 'exchange']);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  registerId: uuid('register_id').notNull(),
  orderNumber: varchar('order_number', { length: 50 }).notNull(),
  channel: channelEnum('channel').notNull().default('pos'),
  channelReference: varchar('channel_reference', { length: 255 }),
  orderType: orderTypeEnum('order_type').notNull().default('retail'),
  status: orderStatusEnum('status').notNull().default('open'),
  customerId: uuid('customer_id'),
  employeeId: uuid('employee_id').notNull(),
  tableId: uuid('table_id'),
  covers: integer('covers'),
  subtotal: decimal('subtotal', { precision: 12, scale: 4 }).notNull().default('0'),
  discountTotal: decimal('discount_total', { precision: 12, scale: 4 }).notNull().default('0'),
  taxTotal: decimal('tax_total', { precision: 12, scale: 4 }).notNull().default('0'),
  total: decimal('total', { precision: 12, scale: 4 }).notNull().default('0'),
  paidTotal: decimal('paid_total', { precision: 12, scale: 4 }).notNull().default('0'),
  changeGiven: decimal('change_given', { precision: 12, scale: 4 }).notNull().default('0'),
  notes: text('notes'),
  receiptSentAt: timestamp('receipt_sent_at', { withTimezone: true }),
  receiptChannel: varchar('receipt_channel', { length: 50 }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orderLines = pgTable('order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  variantId: uuid('variant_id'),
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }).notNull(),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 12, scale: 4 }).notNull(),
  costPrice: decimal('cost_price', { precision: 12, scale: 4 }).notNull().default('0'),
  taxRate: decimal('tax_rate', { precision: 8, scale: 4 }).notNull().default('0'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 4 }).notNull().default('0'),
  discountAmount: decimal('discount_amount', { precision: 12, scale: 4 }).notNull().default('0'),
  lineTotal: decimal('line_total', { precision: 12, scale: 4 }).notNull(),
  modifiers: jsonb('modifiers').notNull().default([]),
  seatNumber: integer('seat_number'),
  course: varchar('course', { length: 50 }),
  notes: text('notes'),
  status: lineStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  originalOrderId: uuid('original_order_id').notNull().references(() => orders.id),
  refundNumber: varchar('refund_number', { length: 50 }).notNull(),
  reason: text('reason').notNull(),
  lines: jsonb('lines').notNull().default([]),
  refundMethod: refundMethodEnum('refund_method').notNull(),
  totalAmount: decimal('total_amount', { precision: 12, scale: 4 }).notNull(),
  approvedByEmployeeId: uuid('approved_by_employee_id').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
