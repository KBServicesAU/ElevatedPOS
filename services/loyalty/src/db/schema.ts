import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  decimal,
  integer,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const loyaltyTxTypeEnum = pgEnum('loyalty_tx_type', [
  'earn',
  'redeem',
  'adjustment',
  'expiry',
]);

export const loyaltyPrograms = pgTable('loyalty_programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  earnRate: integer('earn_rate').notNull().default(10),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyTiers = pgTable('loyalty_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  programId: uuid('program_id')
    .notNull()
    .references(() => loyaltyPrograms.id),
  name: varchar('name', { length: 100 }).notNull(),
  minPoints: integer('min_points').notNull(),
  maxPoints: integer('max_points'),
  multiplier: decimal('multiplier', { precision: 4, scale: 2 }).notNull().default('1.00'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyAccounts = pgTable('loyalty_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  programId: uuid('program_id')
    .notNull()
    .references(() => loyaltyPrograms.id),
  points: integer('points').notNull().default(0),
  lifetimePoints: integer('lifetime_points').notNull().default(0),
  tierId: uuid('tier_id').references(() => loyaltyTiers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyTransactions = pgTable(
  'loyalty_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => loyaltyAccounts.id),
    orderId: uuid('order_id'),
    type: loyaltyTxTypeEnum('type').notNull(),
    points: integer('points').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idempotencyUnique: uniqueIndex('loyalty_tx_org_idempotency_key').on(t.orgId, t.idempotencyKey),
  }),
);
