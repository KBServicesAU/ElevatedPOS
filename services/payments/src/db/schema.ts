import { pgTable, uuid, varchar, timestamp, decimal, boolean, text, pgEnum, jsonb, integer } from 'drizzle-orm/pg-core';

export const paymentMethodEnum = pgEnum('payment_method', ['card', 'cash', 'store_credit', 'gift_card', 'voucher', 'bnpl', 'split']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'approved', 'declined', 'void', 'refunded']);
export const paymentLinkStatusEnum = pgEnum('payment_link_status', ['pending', 'paid', 'expired', 'cancelled']);
export const bnplProviderEnum = pgEnum('bnpl_provider', ['afterpay', 'zip', 'humm', 'latitude']);
export const bnplStatusEnum = pgEnum('bnpl_status', ['pending', 'approved', 'declined', 'settled', 'refunded']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'overdue', 'cancelled']);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  method: paymentMethodEnum('method').notNull(),
  amount: decimal('amount', { precision: 12, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
  exchangeRate: decimal('exchange_rate', { precision: 10, scale: 6 }).notNull().default('1'),
  tipAmount: decimal('tip_amount', { precision: 12, scale: 4 }).notNull().default('0'),
  surchargeAmount: decimal('surcharge_amount', { precision: 12, scale: 4 }).notNull().default('0'),
  roundingAmount: decimal('rounding_amount', { precision: 12, scale: 4 }).notNull().default('0'),
  terminalId: uuid('terminal_id'),
  acquirer: varchar('acquirer', { length: 100 }),
  acquirerTransactionId: varchar('acquirer_transaction_id', { length: 255 }),
  cardScheme: varchar('card_scheme', { length: 50 }),
  cardLast4: varchar('card_last4', { length: 4 }),
  authCode: varchar('auth_code', { length: 50 }),
  status: paymentStatusEnum('status').notNull().default('pending'),
  isOffline: boolean('is_offline').notNull().default(false),
  metadata: jsonb('metadata').default({}),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentLinks = pgTable('payment_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  amount: decimal('amount', { precision: 12, scale: 4 }).notNull(),
  currency: text('currency').notNull().default('AUD'),
  description: text('description').notNull(),
  reference: text('reference'),
  customerId: uuid('customer_id'),
  status: paymentLinkStatusEnum('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentId: uuid('payment_id'),
  shortCode: varchar('short_code', { length: 8 }).notNull().unique(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bnplTransactions = pgTable('bnpl_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  orderId: uuid('order_id').notNull(),
  provider: bnplProviderEnum('provider').notNull(),
  status: bnplStatusEnum('status').notNull().default('pending'),
  amount: decimal('amount', { precision: 12, scale: 4 }).notNull(),
  token: text('token'),
  redirectUrl: text('redirect_url'),
  providerTransactionId: text('provider_transaction_id'),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  acquirer: varchar('acquirer', { length: 100 }).notNull(),
  settlementDate: timestamp('settlement_date', { withTimezone: true }).notNull(),
  totalSales: decimal('total_sales', { precision: 12, scale: 4 }).notNull(),
  totalRefunds: decimal('total_refunds', { precision: 12, scale: 4 }).notNull(),
  totalSurcharges: decimal('total_surcharges', { precision: 12, scale: 4 }).notNull(),
  netAmount: decimal('net_amount', { precision: 12, scale: 4 }).notNull(),
  transactionCount: decimal('transaction_count', { precision: 10, scale: 0 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  bankDepositedAt: timestamp('bank_deposited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Surcharge rules
// ---------------------------------------------------------------------------

export const surchargeRules = pgTable('surcharge_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
  cardType: varchar('card_type', { length: 50 }),          // e.g. 'visa', 'mastercard', 'amex'
  surchargePercent: decimal('surcharge_percent', { precision: 6, scale: 4 }).notNull(),
  minAmount: decimal('min_amount', { precision: 12, scale: 4 }),
  maxAmount: decimal('max_amount', { precision: 12, scale: 4 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  invoiceNumber: varchar('invoice_number', { length: 30 }).notNull().unique(),
  customerId: uuid('customer_id'),
  orderId: uuid('order_id'),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  subtotal: decimal('subtotal', { precision: 12, scale: 4 }).notNull(),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 4 }).notNull().default('0'),
  total: decimal('total', { precision: 12, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  paymentTerms: varchar('payment_terms', { length: 100 }),
  notes: text('notes'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentId: uuid('payment_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  qty: decimal('qty', { precision: 10, scale: 4 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 12, scale: 4 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 6, scale: 4 }).notNull().default('0'),
  lineTotal: decimal('line_total', { precision: 12, scale: 4 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ---------------------------------------------------------------------------
// Terminal credentials  (per-org, per-provider)
// ---------------------------------------------------------------------------

export const terminalCredentials = pgTable('terminal_credentials', {
  id:           uuid('id').primaryKey().defaultRandom(),
  orgId:        uuid('org_id').notNull(),
  /** e.g. 'anz', 'tyro', 'windcave' */
  provider:     varchar('provider', { length: 50 }).notNull(),
  /** Friendly label, e.g. "Main Store Terminal" */
  label:        varchar('label', { length: 255 }),
  /** IPv4 address of the terminal on the local network, e.g. "192.168.1.100" */
  terminalIp:   varchar('terminal_ip', { length: 45 }),
  /** HTTP port the terminal listens on — default 8080 */
  terminalPort: integer('terminal_port').notNull().default(8080),
  isActive:     boolean('is_active').notNull().default(true),
  metadata:     jsonb('metadata').default({}),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
