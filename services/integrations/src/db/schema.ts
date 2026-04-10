import {
  pgTable, uuid, text, varchar, boolean, timestamp, jsonb, integer,
} from 'drizzle-orm/pg-core';

// Read-only reference to the shared organisations table (owned by auth service).
// Used for slug-based lookups (e.g. storefront checkout) without a cross-service HTTP call.
export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const installedApps = pgTable('installed_apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  appId: varchar('app_id', { length: 100 }).notNull(),
  appName: varchar('app_name', { length: 255 }).notNull(),
  config: jsonb('config').notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  label: varchar('label', { length: 255 }).notNull().default(''),
  url: text('url').notNull(),
  events: text('events').array().notNull().default([]),
  secret: varchar('secret', { length: 255 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: uuid('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event: varchar('event', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  statusCode: integer('status_code'),
  response: text('response'),
  success: boolean('success').notNull().default(false),
  durationMs: integer('duration_ms'),
  retryCount: integer('retry_count').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
});

// Stripe Connect accounts - one per org
export const stripeConnectAccounts = pgTable('stripe_connect_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().unique(),
  stripeAccountId: varchar('stripe_account_id', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  // pending | onboarding | active | restricted | disabled
  chargesEnabled: boolean('charges_enabled').notNull().default(false),
  payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
  detailsSubmitted: boolean('details_submitted').notNull().default(false),
  businessName: varchar('business_name', { length: 255 }),
  businessType: varchar('business_type', { length: 100 }),
  country: varchar('country', { length: 2 }).notNull().default('AU'),
  currency: varchar('currency', { length: 3 }).notNull().default('aud'),
  platformFeePercent: integer('platform_fee_percent').notNull().default(100), // basis points, 100 = 1%
  onboardingUrl: text('onboarding_url'),
  onboardingExpiresAt: timestamp('onboarding_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Stripe subscriptions created for merchant customers
export const stripeSubscriptions = pgTable('stripe_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  stripeAccountId: varchar('stripe_account_id', { length: 255 }).notNull(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }).notNull().unique(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).notNull(),
  stripePriceId: varchar('stripe_price_id', { length: 255 }).notNull(),
  customerId: uuid('customer_id'), // internal customer
  status: varchar('status', { length: 50 }).notNull(), // active | canceled | past_due | trialing
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Stripe invoices sent by merchants to their customers
export const stripeInvoices = pgTable('stripe_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  stripeAccountId: varchar('stripe_account_id', { length: 255 }).notNull(),
  stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }).notNull().unique(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).notNull(),
  customerId: uuid('customer_id'), // internal customer
  status: varchar('status', { length: 50 }).notNull(), // draft | open | paid | uncollectible | void
  amountDue: integer('amount_due').notNull(), // cents
  amountPaid: integer('amount_paid').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('aud'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  invoiceUrl: text('invoice_url'),
  invoicePdf: text('invoice_pdf'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
