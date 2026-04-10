import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  decimal,
  text,
  date,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const royaltyCalculationEnum = pgEnum('royalty_calculation', [
  'gross_sales',
  'net_sales',
  'revenue',
]);

export const franchiseBillingCycleEnum = pgEnum('franchise_billing_cycle', ['weekly', 'monthly']);

export const franchiseLocationStatusEnum = pgEnum('franchise_location_status', [
  'active',
  'suspended',
  'terminated',
]);

export const fieldLockTypeEnum = pgEnum('field_lock_type', [
  'locked',
  'store_managed',
  'hq_default',
]);

export const royaltyStatementStatusEnum = pgEnum('royalty_statement_status', [
  'draft',
  'issued',
  'paid',
  'disputed',
]);

export const complianceCheckStatusEnum = pgEnum('compliance_check_status', [
  'compliant',
  'non_compliant',
  'pending',
]);

export const franchiseGroups = pgTable('franchise_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  logoUrl: varchar('logo_url', { length: 500 }),
  royaltyRate: decimal('royalty_rate', { precision: 5, scale: 4 }).notNull().default('0.05'),
  royaltyCalculation: royaltyCalculationEnum('royalty_calculation').notNull().default('gross_sales'),
  billingCycle: franchiseBillingCycleEnum('billing_cycle').notNull().default('monthly'),
  royaltyStartDate: date('royalty_start_date'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const franchiseLocations = pgTable('franchise_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => franchiseGroups.id),
  locationId: uuid('location_id').notNull(),
  franchiseeOrgId: uuid('franchisee_org_id').notNull(),
  franchiseeContactName: varchar('franchisee_contact_name', { length: 255 }),
  franchiseeEmail: varchar('franchisee_email', { length: 255 }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  status: franchiseLocationStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fieldLockPolicies = pgTable('field_lock_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => franchiseGroups.id),
  fieldPath: text('field_path').notNull(),
  lockType: fieldLockTypeEnum('lock_type').notNull(),
  lockedValue: jsonb('locked_value'),
  description: text('description'),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const royaltyStatements = pgTable('royalty_statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => franchiseGroups.id),
  locationId: uuid('location_id').notNull(),
  period: varchar('period', { length: 7 }).notNull(),
  grossSales: decimal('gross_sales', { precision: 14, scale: 4 }).notNull().default('0'),
  netSales: decimal('net_sales', { precision: 14, scale: 4 }).notNull().default('0'),
  royaltyRate: decimal('royalty_rate', { precision: 5, scale: 4 }).notNull(),
  royaltyAmount: decimal('royalty_amount', { precision: 14, scale: 4 }).notNull().default('0'),
  status: royaltyStatementStatusEnum('status').notNull().default('draft'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const networkComplianceChecks = pgTable('network_compliance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => franchiseGroups.id),
  locationId: uuid('location_id').notNull(),
  checkType: text('check_type').notNull(),
  status: complianceCheckStatusEnum('status').notNull().default('pending'),
  details: jsonb('details'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
