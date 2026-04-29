import {
  pgTable, uuid, text, varchar, boolean, timestamp, jsonb, integer, pgEnum, index,
} from 'drizzle-orm/pg-core';

// Read-only reference to the shared organisations table (owned by auth service).
// Used for slug-based lookups and Stripe Connect pre-fill without a cross-service HTTP call.
export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  // Fields used to pre-fill Stripe Connect accounts (added in migration 0021)
  websiteUrl:      varchar('website_url', { length: 500 }),
  phone:           varchar('phone', { length: 50 }),
  industry:        varchar('industry', { length: 50 }),
  businessAddress: jsonb('business_address').$type<Record<string, string>>(),
  abn:             varchar('abn', { length: 11 }),
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
  currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
  platformFeePercent: integer('platform_fee_percent').notNull().default(100), // basis points, 100 = 1%
  // v2.7.78 — per-org opt-in to the customer-screen QR Pay flow.
  // Default false because most merchants run a card-present flow
  // (Tyro / ANZ TIM / Stripe Terminal) and we don't want QR Pay
  // showing up unsolicited until they explicitly enable it.
  qrPayEnabled: boolean('qr_pay_enabled').notNull().default(false),
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

// Hardware order requests submitted by merchants
// (Stripe Hardware Orders API is in preview; we store these for manual fulfillment)
export const hardwareOrders = pgTable('hardware_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  // pending | confirmed | shipped | delivered | cancelled
  lineItems: jsonb('line_items').notNull().default([]),
  shippingName: varchar('shipping_name', { length: 255 }).notNull(),
  shippingEmail: varchar('shipping_email', { length: 255 }).notNull(),
  shippingPhone: varchar('shipping_phone', { length: 50 }),
  shippingAddressLine1: varchar('shipping_address_line1', { length: 255 }).notNull(),
  shippingAddressLine2: varchar('shipping_address_line2', { length: 255 }),
  shippingCity: varchar('shipping_city', { length: 100 }).notNull(),
  shippingState: varchar('shipping_state', { length: 100 }).notNull(),
  shippingPostalCode: varchar('shipping_postal_code', { length: 20 }).notNull(),
  shippingCountry: varchar('shipping_country', { length: 2 }).notNull().default('AU'),
  totalCents: integer('total_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
  trackingNumber: varchar('tracking_number', { length: 255 }),
  notes: text('notes'),
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
  currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  invoiceUrl: text('invoice_url'),
  invoicePdf: text('invoice_pdf'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Reservations ──────────────────────────────────────────────────────────────
// Shared by restaurant reservations (party + table) and service/appointment
// bookings (salon, gym, barber).

export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending', 'confirmed', 'seated', 'in_progress', 'completed', 'cancelled', 'no_show',
]);
export const depositStatusEnum = pgEnum('deposit_status', [
  'none', 'pending', 'paid', 'refunded', 'failed',
]);

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id'),
  // 'restaurant' | 'service' — determines which fields apply
  bookingType: varchar('booking_type', { length: 20 }).notNull().default('restaurant'),
  // Restaurant fields
  partySize: integer('party_size'),
  tableId: uuid('table_id'),
  // Service / appointment fields
  serviceId: uuid('service_id'),        // links to catalog product
  staffEmployeeId: uuid('staff_employee_id'),
  durationMinutes: integer('duration_minutes'),
  // Shared
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 50 }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  status: reservationStatusEnum('status').notNull().default('pending'),
  notes: text('notes'),
  internalNotes: text('internal_notes'),
  // Deposit via Stripe Connect (ElevatedPOS Pay)
  depositStatus: depositStatusEnum('deposit_status').notNull().default('none'),
  depositAmountCents: integer('deposit_amount_cents').notNull().default(0),
  depositStripeAccountId: varchar('deposit_stripe_account_id', { length: 255 }),
  depositPaymentIntentId: varchar('deposit_payment_intent_id', { length: 255 }),
  depositPaidAt: timestamp('deposit_paid_at', { withTimezone: true }),
  depositRefundedAt: timestamp('deposit_refunded_at', { withTimezone: true }),
  // Source tracking
  source: varchar('source', { length: 30 }).notNull().default('widget'), // 'widget' | 'dashboard' | 'pos'
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgScheduledIdx: index('reservations_org_scheduled_idx').on(t.orgId, t.scheduledAt),
  orgStatusIdx: index('reservations_org_status_idx').on(t.orgId, t.status),
}));

export const reservationSettings = pgTable('reservation_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().unique(),
  // What types are enabled
  restaurantEnabled: boolean('restaurant_enabled').notNull().default(false),
  serviceEnabled: boolean('service_enabled').notNull().default(false),
  // Deposit configuration
  restaurantDepositRequired: boolean('restaurant_deposit_required').notNull().default(false),
  restaurantDepositCents: integer('restaurant_deposit_cents').notNull().default(0),
  serviceDepositRequired: boolean('service_deposit_required').notNull().default(false),
  serviceDepositCents: integer('service_deposit_cents').notNull().default(0),
  // Availability
  advanceBookingDays: integer('advance_booking_days').notNull().default(60),
  slotIntervalMinutes: integer('slot_interval_minutes').notNull().default(30),
  openingHours: jsonb('opening_hours').notNull().default({}),
  // Widget branding
  widgetPrimaryColor: varchar('widget_primary_color', { length: 7 }).notNull().default('#6366f1'),
  widgetLogoUrl: text('widget_logo_url'),
  widgetTitle: varchar('widget_title', { length: 255 }).default('Book a Table'),
  // Notifications
  confirmationEmailEnabled: boolean('confirmation_email_enabled').notNull().default(true),
  reminderEmailEnabled: boolean('reminder_email_enabled').notNull().default(true),
  reminderHoursBefore: integer('reminder_hours_before').notNull().default(24),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
