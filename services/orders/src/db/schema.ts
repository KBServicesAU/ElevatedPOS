import { pgTable, uuid, varchar, timestamp, jsonb, decimal, integer, text, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const orderStatusEnum = pgEnum('order_status', ['open', 'held', 'completed', 'cancelled', 'refunded', 'partially_refunded']);
export const orderTypeEnum = pgEnum('order_type', ['retail', 'dine_in', 'takeaway', 'delivery', 'pickup', 'layby', 'quote']);
export const channelEnum = pgEnum('channel', ['pos', 'online', 'kiosk', 'qr', 'marketplace', 'delivery', 'phone']);
export const lineStatusEnum = pgEnum('line_status', ['pending', 'sent_to_kitchen', 'ready', 'served', 'void', 'comp']);
export const refundMethodEnum = pgEnum('refund_method', ['original', 'store_credit', 'cash', 'exchange']);
export const laybyStatusEnum = pgEnum('layby_status', ['active', 'paid', 'cancelled']);
export const laybyPaymentMethodEnum = pgEnum('layby_payment_method', ['cash', 'card', 'eftpos', 'bank_transfer', 'store_credit']);
export const giftCardStatusEnum = pgEnum('gift_card_status', ['active', 'depleted', 'expired', 'cancelled']);
export const giftCardTransactionTypeEnum = pgEnum('gift_card_transaction_type', ['issue', 'topup', 'redeem', 'void', 'expiry']);
export const quoteStatusEnum = pgEnum('quote_status', ['draft', 'sent', 'accepted', 'expired', 'cancelled']);

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
  kdsDestination: varchar('kds_destination', { length: 50 }),
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

// ── Lay-by agreements ─────────────────────────────────────────────────────────

export const laybyAgreements = pgTable('layby_agreements', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  orderId: uuid('order_id'),
  agreementNumber: text('agreement_number').notNull().unique(),
  status: laybyStatusEnum('status').notNull().default('active'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 4 }).notNull(),
  depositAmount: decimal('deposit_amount', { precision: 12, scale: 4 }).notNull(),
  balanceOwing: decimal('balance_owing', { precision: 12, scale: 4 }).notNull(),
  cancellationFee: decimal('cancellation_fee', { precision: 12, scale: 4 }).notNull().default('0'),
  paymentSchedule: jsonb('payment_schedule').notNull().default([]),
  items: jsonb('items').notNull().default([]),
  customerName: text('customer_name').notNull(),
  customerAddress: text('customer_address').notNull(),
  cancellationPolicy: text('cancellation_policy'),
  notes: text('notes'),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const laybyPayments = pgTable('layby_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  laybyId: uuid('layby_id').notNull().references(() => laybyAgreements.id, { onDelete: 'cascade' }),
  amount: decimal('amount', { precision: 12, scale: 4 }).notNull(),
  method: laybyPaymentMethodEnum('method').notNull(),
  reference: text('reference'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Gift cards ─────────────────────────────────────────────────────────────────

export const giftCards = pgTable('gift_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: text('code').notNull().unique(),
  originalAmount: decimal('original_amount', { precision: 12, scale: 4 }).notNull(),
  currentBalance: decimal('current_balance', { precision: 12, scale: 4 }).notNull(),
  currency: text('currency').notNull().default('AUD'),
  status: giftCardStatusEnum('status').notNull().default('active'),
  customerId: uuid('customer_id'),
  issuedByEmployeeId: uuid('issued_by_employee_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const giftCardTransactions = pgTable('gift_card_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  giftCardId: uuid('gift_card_id').notNull().references(() => giftCards.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id'),
  amount: decimal('amount', { precision: 12, scale: 4 }).notNull(),
  type: giftCardTransactionTypeEnum('type').notNull(),
  reference: text('reference'),
  performedBy: uuid('performed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Quotes ────────────────────────────────────────────────────────────────────

export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  customerId: uuid('customer_id'),
  quoteNumber: text('quote_number').notNull().unique(),
  status: quoteStatusEnum('status').notNull().default('draft'),
  items: jsonb('items').notNull().default([]),
  subtotal: decimal('subtotal', { precision: 12, scale: 4 }).notNull().default('0'),
  discountTotal: decimal('discount_total', { precision: 12, scale: 4 }).notNull().default('0'),
  taxTotal: decimal('tax_total', { precision: 12, scale: 4 }).notNull().default('0'),
  total: decimal('total', { precision: 12, scale: 4 }).notNull().default('0'),
  discountPercent: decimal('discount_percent', { precision: 8, scale: 4 }),
  notes: text('notes'),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  convertedToOrderId: uuid('converted_to_order_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Omnichannel Fulfillment ────────────────────────────────────────────────────

export const fulfillmentTypeEnum = pgEnum('fulfillment_type', ['click_and_collect', 'ship_from_store', 'endless_aisle']);
export const fulfillmentStatusEnum = pgEnum('fulfillment_status', ['pending', 'picked', 'packed', 'ready', 'dispatched', 'collected', 'cancelled']);

export const fulfillmentRequests = pgTable('fulfillment_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  type: fulfillmentTypeEnum('type').notNull(),
  status: fulfillmentStatusEnum('status').notNull().default('pending'),
  assignedToEmployeeId: uuid('assigned_to_employee_id'),
  sourceLocationId: uuid('source_location_id').notNull(),
  destinationLocationId: uuid('destination_location_id'),
  shippingLabel: text('shipping_label'),
  trackingNumber: text('tracking_number'),
  shippingCarrier: text('shipping_carrier'),
  pickRequestedAt: timestamp('pick_requested_at', { withTimezone: true }).notNull().defaultNow(),
  pickedAt: timestamp('picked_at', { withTimezone: true }),
  packedAt: timestamp('packed_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  collectedAt: timestamp('collected_at', { withTimezone: true }),
  customerNotifiedAt: timestamp('customer_notified_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Relations ─────────────────────────────────────────────────────────────────

export const ordersRelations = relations(orders, ({ many }) => ({
  lines: many(orderLines),
  refunds: many(refunds),
}));

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, { fields: [refunds.originalOrderId], references: [orders.id] }),
}));
