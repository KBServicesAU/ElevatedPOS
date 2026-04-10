import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  decimal,
  integer,
  pgEnum,
  index,
  uniqueIndex,
  jsonb,
  text,
  date,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const loyaltyBillingCycleEnum = pgEnum('loyalty_billing_cycle', ['monthly', 'annual', 'one_time']);

export const membershipStatusEnum = pgEnum('membership_status', [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
]);

export const membershipPlans = pgTable('membership_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  billingCycle: loyaltyBillingCycleEnum('billing_cycle').notNull(),
  benefits: jsonb('benefits').notNull().default([]),
  pointsMultiplier: decimal('points_multiplier', { precision: 5, scale: 2 }).notNull().default('1.00'),
  tierOverride: varchar('tier_override', { length: 100 }),
  isActive: boolean('is_active').notNull().default(true),
  trialDays: integer('trial_days').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const membershipSubscriptions = pgTable('membership_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => membershipPlans.id),
  status: membershipStatusEnum('status').notNull().default('active'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  paymentMethodRef: text('payment_method_ref'),
  dunningAttempts: integer('dunning_attempts').notNull().default(0),
  lastDunningAt: timestamp('last_dunning_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
}, (table) => ({
  customerOrgUnique: uniqueIndex('loyalty_accounts_customer_org_unique').on(table.customerId, table.orgId),
}));

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
    accountIdIdx: index('loyalty_tx_account_id_idx').on(t.accountId),
  }),
);

// ─── Points Multiplier Events ─────────────────────────────────────────────────

export const pointsMultiplierEvents = pgTable('points_multiplier_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  multiplier: decimal('multiplier', { precision: 5, scale: 2 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday. Empty array = all days
  daysOfWeek: jsonb('days_of_week').notNull().default([]),
  // null = applies to all products/categories
  productIds: jsonb('product_ids').default(null),
  categoryIds: jsonb('category_ids').default(null),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Stamp / Punch-Card Programs ──────────────────────────────────────────────

export const stampCardStatusEnum = pgEnum('stamp_card_status', [
  'active',
  'completed',
  'expired',
  'archived',
]);

export const stampPrograms = pgTable('stamp_programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  stampsRequired: integer('stamps_required').notNull(),
  reward: varchar('reward', { length: 255 }).notNull(),
  rewardValue: decimal('reward_value', { precision: 10, scale: 2 }).notNull().default('0.00'),
  isActive: boolean('is_active').notNull().default(true),
  expiryDays: integer('expiry_days'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerStampCards = pgTable('customer_stamp_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  programId: uuid('program_id')
    .notNull()
    .references(() => stampPrograms.id),
  currentStamps: integer('current_stamps').notNull().default(0),
  status: stampCardStatusEnum('status').notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stampEvents = pgTable('stamp_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => customerStampCards.id),
  orderId: uuid('order_id'),
  type: varchar('type', { length: 20 }).notNull().default('earn'), // 'earn' | 'redeem'
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Loyalty Relations ────────────────────────────────────────────────────────

export const loyaltyProgramsRelations = relations(loyaltyPrograms, ({ many }) => ({
  tiers: many(loyaltyTiers),
  accounts: many(loyaltyAccounts),
}));

export const loyaltyTiersRelations = relations(loyaltyTiers, ({ one }) => ({
  program: one(loyaltyPrograms, {
    fields: [loyaltyTiers.programId],
    references: [loyaltyPrograms.id],
  }),
}));

export const loyaltyAccountsRelations = relations(loyaltyAccounts, ({ one }) => ({
  program: one(loyaltyPrograms, {
    fields: [loyaltyAccounts.programId],
    references: [loyaltyPrograms.id],
  }),
  tier: one(loyaltyTiers, {
    fields: [loyaltyAccounts.tierId],
    references: [loyaltyTiers.id],
  }),
}));

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }) => ({
  account: one(loyaltyAccounts, {
    fields: [loyaltyTransactions.accountId],
    references: [loyaltyAccounts.id],
  }),
}));

export const stampProgramsRelations = relations(stampPrograms, ({ many }) => ({
  cards: many(customerStampCards),
}));

export const customerStampCardsRelations = relations(customerStampCards, ({ one, many }) => ({
  program: one(stampPrograms, {
    fields: [customerStampCards.programId],
    references: [stampPrograms.id],
  }),
  events: many(stampEvents),
}));

export const stampEventsRelations = relations(stampEvents, ({ one }) => ({
  card: one(customerStampCards, {
    fields: [stampEvents.cardId],
    references: [customerStampCards.id],
  }),
}));

// pointsMultiplierEvents has no FK relations — standalone table scoped by orgId
