import {
  pgTable, uuid, text, varchar, boolean, timestamp, jsonb, integer, numeric, pgEnum, date, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const organisationPlanEnum = pgEnum('organisation_plan', ['starter', 'growth', 'pro', 'enterprise', 'custom']);
export const organisationPlanStatusEnum = pgEnum('organisation_plan_status', ['trialing', 'active', 'past_due', 'cancelled', 'paused']);

// ── Per-device billing ────────────────────────────────────────────────────────
// Subscription status mirrors Stripe's subscription.status values
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'incomplete', 'trialing', 'active', 'past_due', 'cancelled', 'paused',
]);

export const deviceTypeEnum = pgEnum('device_type', ['pos', 'kds', 'kiosk', 'display', 'dashboard']);

// ── Onboarding step enum ──────────────────────────────────────────────────────
export const onboardingStepEnum = pgEnum('onboarding_step_v2', [
  'business_info',     // org created, awaiting owner account creation
  'owner_account',     // owner account created
  'location_setup',    // first location added
  'staff_setup',       // at least one staff member added
  'device_selection',  // device quantities + add-ons chosen
  'stripe_connect',    // Stripe Connect onboarding started / completed
  'subscription',      // subscription payment step
  'completed',         // fully onboarded
]);

export const approvalTypeEnum = pgEnum('approval_type', ['discount', 'refund', 'void', 'cash_disbursement', 'stock_adjustment', 'other']);
export const locationTypeEnum = pgEnum('location_type', ['retail', 'warehouse', 'kitchen']);
export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'denied']);
export const clockEventTypeEnum = pgEnum('clock_event_type', ['clock_in', 'clock_out', 'break_start', 'break_end']);
export const shiftStatusEnum = pgEnum('shift_status', ['open', 'closed', 'approved']);

export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  country: varchar('country', { length: 2 }).notNull().default('AU'),
  currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
  timezone: varchar('timezone', { length: 100 }).notNull().default('Australia/Sydney'),
  plan: organisationPlanEnum('plan').notNull().default('starter'),
  planStatus: organisationPlanStatusEnum('plan_status').notNull().default('active'),
  maxLocations: integer('max_locations').notNull().default(1),
  maxDevices: integer('max_devices').notNull().default(2),
  maxPosDevices:       integer('max_pos_devices').notNull().default(2),
  maxKdsDevices:       integer('max_kds_devices').notNull().default(2),
  maxKioskDevices:     integer('max_kiosk_devices').notNull().default(1),
  maxDashboardDevices: integer('max_dashboard_devices').notNull().default(1),
  maxDisplayDevices:   integer('max_display_devices').notNull().default(5),
  abn: varchar('abn', { length: 11 }),
  phone: varchar('phone', { length: 50 }),
  businessAddress: jsonb('business_address').default({}),
  websiteUrl: varchar('website_url', { length: 500 }),
  billingEmail: varchar('billing_email', { length: 255 }),
  // 9-digit zero-padded sequential account number (e.g. "000000001")
  accountNumber: varchar('account_number', { length: 9 })
    .notNull()
    .unique()
    .default(sql`LPAD(nextval('org_account_number_seq')::text, 9, '0')`),
  // Per-device billing (new model)
  billingModel: varchar('billing_model', { length: 20 }).notNull().default('legacy'), // 'legacy' | 'per_device'
  subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('incomplete'),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  subscriptionCurrentPeriodEnd: timestamp('subscription_current_period_end', { withTimezone: true }),
  websiteAddonEnabled: boolean('website_addon_enabled').notNull().default(false),
  customDomainAddonEnabled: boolean('custom_domain_addon_enabled').notNull().default(false),
  // Industry feature flags (set automatically from industry on creation/update)
  featureFlags: jsonb('feature_flags').notNull().default({}),
  // Onboarding
  onboardingStep: varchar('onboarding_step', { length: 50 }).notNull().default('completed'),
  onboardingStepV2: onboardingStepEnum('onboarding_step_v2').default('completed'),
  // Industry classification — drives feature gating (e.g. hospitality order-type picker).
  // Allowed values: 'retail' | 'hospitality' | 'pharmacy' | 'services'.
  industry: varchar('industry', { length: 50 }).notNull().default('retail'),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  // Onboarding session: short-lived token to allow multi-step pre-login onboarding
  onboardingToken: varchar('onboarding_token', { length: 255 }),
  onboardingTokenExpiresAt: timestamp('onboarding_token_expires_at', { withTimezone: true }),
  // Device selection (stored during onboarding, used to create subscription)
  pendingDeviceSelection: jsonb('pending_device_selection').default({}),
  whiteLabelThemeId: uuid('white_label_theme_id'),
  // Stripe SaaS billing
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  settings: jsonb('settings').default({}),
  // Receipt rendering preferences. Initial shape: { showOrderNumber: boolean }.
  // Kept as JSONB so future toggles can be added without a migration.
  receiptSettings: jsonb('receipt_settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  address: jsonb('address').default({}),
  phone: varchar('phone', { length: 50 }),
  timezone: varchar('timezone', { length: 100 }).notNull().default('Australia/Sydney'),
  type: locationTypeEnum('type').notNull().default('retail'),
  settings: jsonb('settings').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isSystemRole: boolean('is_system_role').notNull().default(false),
  permissions: jsonb('permissions').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  pin: varchar('pin', { length: 255 }),
  roleId: uuid('role_id').references(() => roles.id),
  locationIds: jsonb('location_ids').notNull().default([]),
  employmentType: varchar('employment_type', { length: 50 }).notNull().default('full_time'),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaSecret: varchar('mfa_secret', { length: 255 }),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerificationToken: varchar('email_verification_token', { length: 255 }),
  emailVerificationExpiresAt: timestamp('email_verification_expires_at', { withTimezone: true }),
  passwordResetToken: varchar('password_reset_token', { length: 255 }),
  passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgEmailUnique: uniqueIndex('employees_org_email_unique').on(table.orgId, table.email),
}));

export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  type: approvalTypeEnum('type').notNull(),
  status: approvalStatusEnum('status').notNull().default('pending'),
  requestedBy: uuid('requested_by').notNull().references(() => employees.id),
  approvedBy: uuid('approved_by').references(() => employees.id),
  locationId: uuid('location_id').notNull(), // cross-service UUID — no FK by design
  amount: numeric('amount', { precision: 12, scale: 2 }),
  metadata: jsonb('metadata').notNull().default({}),
  reason: text('reason').notNull(),
  approverNote: text('approver_note'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clockEvents = pgTable('clock_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  locationId: uuid('location_id').notNull(), // cross-service UUID — no FK by design
  registerId: uuid('register_id'),
  type: clockEventTypeEnum('type').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  notes: text('notes'),
  editedBy: uuid('edited_by').references(() => employees.id),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  editReason: text('edit_reason'),
  isManual: boolean('is_manual').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const shifts = pgTable('shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  locationId: uuid('location_id').notNull(), // cross-service UUID — no FK by design
  clockInAt: timestamp('clock_in_at', { withTimezone: true }).notNull(),
  clockOutAt: timestamp('clock_out_at', { withTimezone: true }),
  breakMinutes: integer('break_minutes').notNull().default(0),
  totalMinutes: integer('total_minutes'),
  status: shiftStatusEnum('status').notNull().default('open'),
  approvedBy: uuid('approved_by').references(() => employees.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Roster Shifts (planned/scheduled shifts) ─────────────────────────────────

export const rosterShifts = pgTable('roster_shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  date: date('date').notNull(),
  startTime: varchar('start_time', { length: 5 }).notNull(),
  endTime: varchar('end_time', { length: 5 }).notNull(),
  role: varchar('role', { length: 100 }),
  station: varchar('station', { length: 100 }),
  published: boolean('published').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgDateIdx: index('roster_shifts_org_date_idx').on(table.orgId, table.date),
  orgEmployeeIdx: index('roster_shifts_org_employee_idx').on(table.orgId, table.employeeId),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  deviceId: varchar('device_id', { length: 255 }),
  deviceName: varchar('device_name', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  // v2.7.77 — Refresh-token rotation family. Every token issued in
  // the same login chain shares a family_id. If an already-revoked
  // token is presented, every unrevoked token in the family gets
  // revoked too — this is the standard Auth0 / Stripe-style
  // reuse-detection pattern. familyId === id for the original
  // /login-issued token; rotated tokens inherit the parent's familyId.
  familyId: uuid('family_id'),
  // 'rotated' = legitimate refresh, 'reused' = theft suspected,
  // 'manual' = explicit logout, 'family_revoked' = collateral damage
  // from a sibling token being reused.
  revokedReason: varchar('revoked_reason', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  employeeIdIdx: index('refresh_tokens_employee_id_idx').on(table.employeeId),
  familyIdIdx: index('refresh_tokens_family_id_idx').on(table.familyId),
}));

// ── OAuth 2.0 ─────────────────────────────────────────────────────────────────

export const oauthClients = pgTable('oauth_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'cascade' }), // null = global marketplace app
  clientId: text('client_id').notNull().unique(),
  clientSecret: text('client_secret').notNull(), // stored hashed
  name: text('name').notNull(),
  redirectUris: jsonb('redirect_uris').notNull().default([]), // string[]
  scopes: jsonb('scopes').notNull().default([]), // string[]
  isConfidential: boolean('is_confidential').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAuthCodes = pgTable('oauth_auth_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  orgId: uuid('org_id').notNull(),
  scopes: jsonb('scopes').notNull().default([]), // string[]
  code: text('code').notNull().unique(),
  redirectUri: text('redirect_uri').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthTokens = pgTable('oauth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: uuid('user_id'), // nullable for client_credentials
  orgId: uuid('org_id').notNull(),
  accessToken: text('access_token').notNull().unique(),
  refreshToken: text('refresh_token').unique(),
  scopes: jsonb('scopes').notNull().default([]), // string[]
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Relations ─────────────────────────────────────────────────────────────────

export const organisationsRelations = relations(organisations, ({ many }) => ({
  locations: many(locations),
  roles: many(roles),
  employees: many(employees),
  printers: many(printers),
}));

export const locationsRelations = relations(locations, ({ one }) => ({
  organisation: one(organisations, {
    fields: [locations.orgId],
    references: [organisations.id],
  }),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [roles.orgId],
    references: [organisations.id],
  }),
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [employees.orgId],
    references: [organisations.id],
  }),
  role: one(roles, {
    fields: [employees.roleId],
    references: [roles.id],
  }),
  clockEvents: many(clockEvents),
  shifts: many(shifts),
  refreshTokens: many(refreshTokens),
}));

export const clockEventsRelations = relations(clockEvents, ({ one }) => ({
  organisation: one(organisations, {
    fields: [clockEvents.orgId],
    references: [organisations.id],
  }),
  employee: one(employees, {
    fields: [clockEvents.employeeId],
    references: [employees.id],
  }),
}));

export const shiftsRelations = relations(shifts, ({ one }) => ({
  organisation: one(organisations, {
    fields: [shifts.orgId],
    references: [organisations.id],
  }),
  employee: one(employees, {
    fields: [shifts.employeeId],
    references: [employees.id],
  }),
}));

export const rosterShiftsRelations = relations(rosterShifts, ({ one }) => ({
  organisation: one(organisations, {
    fields: [rosterShifts.orgId],
    references: [organisations.id],
  }),
  employee: one(employees, {
    fields: [rosterShifts.employeeId],
    references: [employees.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  employee: one(employees, {
    fields: [refreshTokens.employeeId],
    references: [employees.id],
  }),
}));

export const approvalRequestsRelations = relations(approvalRequests, ({ one }) => ({
  organisation: one(organisations, {
    fields: [approvalRequests.orgId],
    references: [organisations.id],
  }),
  requestedByEmployee: one(employees, {
    fields: [approvalRequests.requestedBy],
    references: [employees.id],
  }),
}));

export const oauthClientsRelations = relations(oauthClients, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [oauthClients.orgId],
    references: [organisations.id],
  }),
  authCodes: many(oauthAuthCodes),
  tokens: many(oauthTokens),
}));

export const oauthAuthCodesRelations = relations(oauthAuthCodes, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthAuthCodes.clientId],
    references: [oauthClients.id],
  }),
}));

export const oauthTokensRelations = relations(oauthTokens, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthTokens.clientId],
    references: [oauthClients.id],
  }),
}));

// ── Printers ──────────────────────────────────────────────────────────────────

export const printerConnectionTypeEnum = pgEnum('printer_connection_type', ['ip', 'usb']);
export const printerTypeEnum = pgEnum('printer_type', ['receipt', 'kitchen_order']);
export const printerDestinationEnum = pgEnum('printer_destination_type', ['none', 'kitchen', 'bar', 'front', 'back', 'custom']);

export const printers = pgTable('printers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  brand: varchar('brand', { length: 50 }).notNull().default('generic'),
  connectionType: printerConnectionTypeEnum('connection_type').notNull().default('ip'),
  host: varchar('host', { length: 255 }),          // IP address or hostname (for IP printers)
  port: integer('port').default(9100),              // Default ESC/POS TCP port
  printerType: printerTypeEnum('printer_type').notNull().default('receipt'),
  destination: printerDestinationEnum('destination').notNull().default('none'),
  customDestination: varchar('custom_destination', { length: 100 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const printersRelations = relations(printers, ({ one }) => ({
  organisation: one(organisations, { fields: [printers.orgId], references: [organisations.id] }),
  location: one(locations, { fields: [printers.locationId], references: [locations.id] }),
}));

// ── Platform Staff ────────────────────────────────────────────────────────────

export const platformRoleEnum = pgEnum('platform_role', ['superadmin', 'support', 'reseller', 'sales_agent']);

export const platformStaff = pgTable('platform_staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  role: platformRoleEnum('role').notNull().default('support'),
  resellerOrgId: uuid('reseller_org_id'), // null for superadmin/support
  isActive: boolean('is_active').notNull().default(true),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaSecret: varchar('mfa_secret', { length: 255 }),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

// ── Device Pairing ────────────────────────────────────────────────────────────

export const deviceRoleEnum = pgEnum('device_role', ['pos', 'kds', 'kiosk', 'dashboard', 'display']);
export const deviceStatusEnum = pgEnum('device_status', ['active', 'revoked']);

export const devicePairingCodes = pgTable('device_pairing_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 8 }).notNull().unique(),
  role: deviceRoleEnum('role').notNull(),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  registerId: uuid('register_id'),
  label: varchar('label', { length: 100 }),
  createdBy: uuid('created_by').notNull().references(() => employees.id),
  usedAt: timestamp('used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  role: deviceRoleEnum('role').notNull(),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  registerId: uuid('register_id'),
  label: varchar('label', { length: 100 }),
  platform: varchar('platform', { length: 20 }),
  appVersion: varchar('app_version', { length: 20 }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  status: deviceStatusEnum('status').notNull().default('active'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by').references(() => employees.id),
  /** Per-device config managed from the dashboard (customer display, etc.) */
  settings: jsonb('settings'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const devicesRelations = relations(devices, ({ one }) => ({
  organisation: one(organisations, { fields: [devices.orgId], references: [organisations.id] }),
  location: one(locations, { fields: [devices.locationId], references: [locations.id] }),
  revokedByEmployee: one(employees, { fields: [devices.revokedBy], references: [employees.id] }),
  displayContent: one(displayContent, { fields: [devices.id], references: [displayContent.deviceId] }),
}));

export const devicePairingCodesRelations = relations(devicePairingCodes, ({ one }) => ({
  organisation: one(organisations, { fields: [devicePairingCodes.orgId], references: [organisations.id] }),
  location: one(locations, { fields: [devicePairingCodes.locationId], references: [locations.id] }),
  createdByEmployee: one(employees, { fields: [devicePairingCodes.createdBy], references: [employees.id] }),
}));

// ── Display Content ───────────────────────────────────────────────────────────

export const displayContent = pgTable('display_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  // v2.7.80 — deviceId is now nullable. A row with `deviceId IS NULL`
  // is the org-level default content that any newly-paired display
  // picks up until per-device content is published. The previous
  // schema required a deviceId, which meant /dashboard/display
  // showed "No display screens" if the merchant hadn't paired
  // anything yet — they couldn't design templates ahead of time.
  // The migration drops the NOT NULL + the column-level unique on
  // deviceId, and adds a partial unique index for the
  // (orgId, deviceId NULL) default row + (orgId, deviceId NOT NULL)
  // for per-device rows.
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
  content: jsonb('content'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: uuid('published_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const displayContentRelations = relations(displayContent, ({ one }) => ({
  device: one(devices, { fields: [displayContent.deviceId], references: [devices.id] }),
}));

// ── Plans ─────────────────────────────────────────────────────────────────────

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  monthlyPrice: numeric('monthly_price', { precision: 10, scale: 2 }).notNull(),
  annualPrice: numeric('annual_price', { precision: 10, scale: 2 }),
  features: jsonb('features').notNull().default([]),
  isPublic: boolean('is_public').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  maxLocations: integer('max_locations').notNull().default(1),
  maxEmployees: integer('max_employees').notNull().default(50),
  maxProducts: integer('max_products').notNull().default(1000),
  trialDays: integer('trial_days').notNull().default(14),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Per-Device Subscription Items ─────────────────────────────────────────────
// One row per device type per org — tracks quantities and Stripe item IDs.

export const orgSubscriptionItems = pgTable('org_subscription_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  deviceType: deviceTypeEnum('device_type').notNull(),
  quantity: integer('quantity').notNull().default(0),
  stripeSubscriptionItemId: varchar('stripe_subscription_item_id', { length: 255 }),
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  unitAmountCents: integer('unit_amount_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgDeviceUnique: uniqueIndex('org_sub_items_org_device_unique').on(table.orgId, table.deviceType),
}));

// ── Signup Links ──────────────────────────────────────────────────────────────

export const signupLinks = pgTable('signup_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  createdByPlatformUserId: uuid('created_by_platform_user_id').references(() => platformStaff.id),
  salesAgentId: uuid('sales_agent_id').references(() => platformStaff.id),
  planId: uuid('plan_id').references(() => plans.id),
  orgName: varchar('org_name', { length: 200 }),
  customMonthlyPrice: numeric('custom_monthly_price', { precision: 10, scale: 2 }),
  customAnnualPrice: numeric('custom_annual_price', { precision: 10, scale: 2 }),
  customTrialDays: integer('custom_trial_days'),
  note: text('note'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedByOrgId: uuid('used_by_org_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Support Notes ─────────────────────────────────────────────────────────────

export const supportNotes = pgTable('support_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  authorId: uuid('author_id'),
  authorEmail: varchar('author_email', { length: 255 }),
  authorName: varchar('author_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Audit Logs (legacy — godmode hand-rolled) ─────────────────────────────────

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id'),
  platformUserId: uuid('platform_user_id'),
  actorName: varchar('actor_name', { length: 200 }),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 200 }),
  detail: jsonb('detail'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgCreatedAtIdx: index('audit_logs_org_created_at_idx').on(table.orgId, table.createdAt),
}));

// ── System Audit Logs (v2.7.48-univlog — universal mutation log) ──────────────
//
// One row per server mutation (POST / PATCH / PUT / DELETE) captured by
// the @nexus/fastify-audit plugin registered in every backend service.
// Wider than the legacy `audit_logs` table — carries before/after diffs,
// HTTP context, and a service-name tag so the Godmode Logs page can
// filter by service.

// ── MFA Recovery Codes (v2.7.62 — TOTP 2FA) ──────────────────────────────────
//
// Single-use bcrypt-hashed recovery codes generated at MFA enrollment time.
// Each row belongs to either an `employees` row OR a `platform_staff` row;
// the CHECK constraint enforces exactly-one-owner so we don't have to
// model a polymorphic FK. Successful redemption flips `used_at`; the row
// stays so an audit trail of which codes were burned remains.

export const mfaRecoveryCodes = pgTable('mfa_recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
  platformStaffId: uuid('platform_staff_id').references(() => platformStaff.id, { onDelete: 'cascade' }),
  codeHash: varchar('code_hash', { length: 255 }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  employeeIdx: index('idx_mfa_recovery_codes_employee').on(table.employeeId),
  platformIdx: index('idx_mfa_recovery_codes_platform').on(table.platformStaffId),
}));

export const systemAuditLogs = pgTable('system_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id'),
  locationId: uuid('location_id'),
  // Actor
  actorType: varchar('actor_type', { length: 20 }).notNull(),  // 'employee' | 'device' | 'godmode_staff' | 'system' | 'customer'
  actorId: uuid('actor_id'),
  actorName: text('actor_name'),
  // Action
  action: varchar('action', { length: 20 }).notNull(),         // 'create' | 'update' | 'delete' | 'login' | 'logout' | 'auth_fail'
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: text('entity_id'),
  entityName: text('entity_name'),
  // Diff
  beforeJson: jsonb('before_json'),
  afterJson:  jsonb('after_json'),
  // HTTP
  endpoint:   text('endpoint'),
  method:     varchar('method', { length: 10 }),
  statusCode: integer('status_code'),
  ipAddress:  text('ip_address'),
  userAgent:  text('user_agent'),
  // Optional context
  service:    varchar('service', { length: 50 }),
  notes:      text('notes'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx:    index('system_audit_org_idx').on(table.orgId, table.createdAt),
  actorIdx:  index('system_audit_actor_idx').on(table.actorId, table.createdAt),
  entityIdx: index('system_audit_entity_idx').on(table.entityType, table.entityId),
}));
