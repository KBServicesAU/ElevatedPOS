import {
  pgTable, uuid, text, varchar, boolean, timestamp, jsonb, integer, numeric, pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
  plan: varchar('plan', { length: 50 }).notNull().default('starter'),
  planStatus: varchar('plan_status', { length: 50 }).notNull().default('active'),
  maxLocations: integer('max_locations').notNull().default(1),
  maxDevices: integer('max_devices').notNull().default(2),
  abn: varchar('abn', { length: 11 }),
  billingEmail: varchar('billing_email', { length: 255 }),
  onboardingStep: varchar('onboarding_step', { length: 50 }).notNull().default('completed'),
  whiteLabelThemeId: uuid('white_label_theme_id'),
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
});

export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  type: approvalTypeEnum('type').notNull(),
  status: approvalStatusEnum('status').notNull().default('pending'),
  requestedBy: uuid('requested_by').notNull().references(() => employees.id),
  approvedBy: uuid('approved_by').references(() => employees.id),
  locationId: uuid('location_id').notNull(),
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
  locationId: uuid('location_id').notNull(),
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
  locationId: uuid('location_id').notNull(),
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

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  deviceId: varchar('device_id', { length: 255 }),
  deviceName: varchar('device_name', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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

export const platformRoleEnum = pgEnum('platform_role', ['superadmin', 'support', 'reseller']);

export const platformStaff = pgTable('platform_staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  role: platformRoleEnum('role').notNull().default('support'),
  resellerOrgId: uuid('reseller_org_id'), // null for superadmin/support
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

// ── Device Pairing ────────────────────────────────────────────────────────────

export const deviceRoleEnum = pgEnum('device_role', ['pos', 'kds', 'kiosk']);
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const devicesRelations = relations(devices, ({ one }) => ({
  organisation: one(organisations, { fields: [devices.orgId], references: [organisations.id] }),
  location: one(locations, { fields: [devices.locationId], references: [locations.id] }),
  revokedByEmployee: one(employees, { fields: [devices.revokedBy], references: [employees.id] }),
}));

export const devicePairingCodesRelations = relations(devicePairingCodes, ({ one }) => ({
  organisation: one(organisations, { fields: [devicePairingCodes.orgId], references: [organisations.id] }),
  location: one(locations, { fields: [devicePairingCodes.locationId], references: [locations.id] }),
  createdByEmployee: one(employees, { fields: [devicePairingCodes.createdBy], references: [employees.id] }),
}));
