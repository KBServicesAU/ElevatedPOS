import { pgTable, uuid, varchar, timestamp, decimal, boolean, text, pgEnum, jsonb } from 'drizzle-orm/pg-core';

export const paymentMethodEnum = pgEnum('payment_method', ['card', 'cash', 'store_credit', 'gift_card', 'voucher', 'bnpl', 'split']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'approved', 'declined', 'void', 'refunded']);

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
