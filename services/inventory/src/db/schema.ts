import { pgTable, uuid, varchar, boolean, timestamp, jsonb, decimal, integer, text, pgEnum } from 'drizzle-orm/pg-core';

export const poStatusEnum = pgEnum('po_status', ['draft', 'sent', 'partial', 'complete', 'cancelled']);
export const transferStatusEnum = pgEnum('transfer_status', ['requested', 'approved', 'dispatched', 'received', 'cancelled']);

export const stockItems = pgTable('stock_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').notNull(),
  productId: uuid('product_id').notNull(),
  variantId: uuid('variant_id'),
  onHand: decimal('on_hand', { precision: 12, scale: 3 }).notNull().default('0'),
  reserved: decimal('reserved', { precision: 12, scale: 3 }).notNull().default('0'),
  onOrder: decimal('on_order', { precision: 12, scale: 3 }).notNull().default('0'),
  inTransit: decimal('in_transit', { precision: 12, scale: 3 }).notNull().default('0'),
  binLocation: varchar('bin_location', { length: 100 }),
  lastCountAt: timestamp('last_count_at', { withTimezone: true }),
  lastCountQty: decimal('last_count_qty', { precision: 12, scale: 3 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  contactName: varchar('contact_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  address: jsonb('address').default({}),
  abn: varchar('abn', { length: 20 }),
  paymentTerms: integer('payment_terms').notNull().default(30),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  preferredCurrency: varchar('preferred_currency', { length: 3 }).notNull().default('AUD'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  poNumber: varchar('po_number', { length: 100 }).notNull(),
  status: poStatusEnum('status').notNull().default('draft'),
  currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
  exchangeRate: decimal('exchange_rate', { precision: 10, scale: 6 }).notNull().default('1'),
  paymentTerms: integer('payment_terms').notNull().default(30),
  expectedDeliveryAt: timestamp('expected_delivery_at', { withTimezone: true }),
  notes: text('notes'),
  subtotal: decimal('subtotal', { precision: 12, scale: 4 }).notNull().default('0'),
  taxTotal: decimal('tax_total', { precision: 12, scale: 4 }).notNull().default('0'),
  total: decimal('total', { precision: 12, scale: 4 }).notNull().default('0'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdByEmployeeId: uuid('created_by_employee_id').notNull(),
  approvedByEmployeeId: uuid('approved_by_employee_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  variantId: uuid('variant_id'),
  productName: varchar('product_name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }).notNull(),
  orderedQty: decimal('ordered_qty', { precision: 12, scale: 3 }).notNull(),
  receivedQty: decimal('received_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  unitCost: decimal('unit_cost', { precision: 12, scale: 4 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 8, scale: 4 }).notNull().default('0'),
  lineTotal: decimal('line_total', { precision: 12, scale: 4 }).notNull(),
});

export const stockTransfers = pgTable('stock_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  transferNumber: varchar('transfer_number', { length: 100 }).notNull(),
  fromLocationId: uuid('from_location_id').notNull(),
  toLocationId: uuid('to_location_id').notNull(),
  status: transferStatusEnum('status').notNull().default('requested'),
  requestedByEmployeeId: uuid('requested_by_employee_id').notNull(),
  approvedByEmployeeId: uuid('approved_by_employee_id'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stockTransferLines = pgTable('stock_transfer_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  transferId: uuid('transfer_id').notNull().references(() => stockTransfers.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  variantId: uuid('variant_id'),
  productName: varchar('product_name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }).notNull(),
  requestedQty: decimal('requested_qty', { precision: 12, scale: 3 }).notNull(),
  dispatchedQty: decimal('dispatched_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  receivedQty: decimal('received_qty', { precision: 12, scale: 3 }).notNull().default('0'),
});

export const stockAdjustments = pgTable('stock_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  productId: uuid('product_id').notNull(),
  variantId: uuid('variant_id'),
  beforeQty: decimal('before_qty', { precision: 12, scale: 3 }).notNull(),
  afterQty: decimal('after_qty', { precision: 12, scale: 3 }).notNull(),
  adjustment: decimal('adjustment', { precision: 12, scale: 3 }).notNull(),
  reason: varchar('reason', { length: 255 }).notNull(),
  referenceId: uuid('reference_id'),
  referenceType: varchar('reference_type', { length: 50 }),
  employeeId: uuid('employee_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
