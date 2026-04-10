import { pgTable, uuid, varchar, boolean, timestamp, jsonb, decimal, integer, text, date, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const storeCreditTxTypeEnum = pgEnum('store_credit_tx_type', ['issue', 'redeem', 'adjust', 'expire']);
export const gdprRequestTypeEnum = pgEnum('gdpr_request_type', ['export', 'erasure']);

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  dob: date('dob'),
  gender: varchar('gender', { length: 20 }),
  addressLine1: varchar('address_line1', { length: 255 }),
  suburb: varchar('suburb', { length: 100 }),
  state: varchar('state', { length: 50 }),
  postcode: varchar('postcode', { length: 20 }),
  country: varchar('country', { length: 2 }).default('AU'),
  company: varchar('company', { length: 255 }),
  abn: varchar('abn', { length: 20 }),
  tags: jsonb('tags').notNull().default([]),
  marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
  marketingOptInAt: timestamp('marketing_opt_in_at', { withTimezone: true }),
  householdId: uuid('household_id'),
  rfmScore: varchar('rfm_score', { length: 10 }),
  lifetimeValue: decimal('lifetime_value', { precision: 12, scale: 4 }).notNull().default('0'),
  visitCount: integer('visit_count').notNull().default(0),
  lastPurchaseAt: timestamp('last_purchase_at', { withTimezone: true }),
  churnRiskScore: decimal('churn_risk_score', { precision: 5, scale: 4 }),
  preferredLanguage: varchar('preferred_language', { length: 10 }).default('en'),
  dietaryPreferences: jsonb('dietary_preferences').notNull().default([]),
  allergenAlerts: jsonb('allergen_alerts').notNull().default([]),
  notes: text('notes'),
  source: varchar('source', { length: 50 }).default('pos'),
  gdprDeleted: boolean('gdpr_deleted').notNull().default(false),
  gdprDeletedAt: timestamp('gdpr_deleted_at', { withTimezone: true }),
  // Set when this customer was merged into another (the canonical) customer
  mergedIntoId: uuid('merged_into_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storeCreditAccounts = pgTable('store_credit_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  balance: decimal('balance', { precision: 12, scale: 4 }).notNull().default('0'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storeCreditTransactions = pgTable('store_credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => storeCreditAccounts.id),
  orgId: uuid('org_id').notNull(),
  type: storeCreditTxTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 12, scale: 4 }).notNull(),
  reason: text('reason'),
  orderId: uuid('order_id'),
  notes: text('notes'),
  employeeId: uuid('employee_id'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedBy: uuid('voided_by'),
  voidReason: text('void_reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  issuedBy: uuid('issued_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Customer Groups ───────────────────────────────────────────────────────────

export const customerGroups = pgTable('customer_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description'),
  isAutomatic: boolean('is_automatic').notNull().default(false),
  rules: jsonb('rules').notNull().default([]),
  memberCount: integer('member_count').notNull().default(0),
  lastComputedAt: timestamp('last_computed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerGroupMembers = pgTable('customer_group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => customerGroups.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  groupCustomerUnique: uniqueIndex('cgm_group_customer_unique').on(table.groupId, table.customerId),
}));

// ─── Customer Notes ────────────────────────────────────────────────────────────

export const customerNotes = pgTable('customer_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull(),
  content: text('content').notNull(),
  type: varchar('type', { length: 50 }).notNull().default('general'),
  // isInternal = true means only managers can see this note
  isInternal: boolean('is_internal').notNull().default(true),
  employeeId: uuid('employee_id').notNull(), // employee who wrote this note (cross-service UUID)
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── GDPR Requests Log ────────────────────────────────────────────────────────

export const gdprRequests = pgTable('gdpr_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  requestType: gdprRequestTypeEnum('request_type').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gdprRequestsRelations = relations(gdprRequests, ({ one }: { one: any; many: any }) => ({
  customer: one(customers, { fields: [gdprRequests.customerId], references: [customers.id] }),
}));

// ─── Customer Merge Log ───────────────────────────────────────────────────────

export const customerMergeLog = pgTable('customer_merge_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  // keepId = the canonical customer that survives
  keepId: uuid('keep_id').notNull().references(() => customers.id),
  // mergedId stored as text because the merged customer may be soft-deleted / anonymised
  mergedId: text('merged_id').notNull(),
  mergedAt: timestamp('merged_at', { withTimezone: true }).notNull().defaultNow(),
  // mergedBy = employee UUID who performed the merge
  mergedBy: text('merged_by'),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const customersRelations = relations(customers, ({ one, many }: { one: any; many: any }) => ({
  storeCreditAccount: one(storeCreditAccounts, {
    fields: [customers.id],
    references: [storeCreditAccounts.customerId],
  }),
  notes: many(customerNotes),
  groupMemberships: many(customerGroupMembers),
}));

export const customerGroupsRelations = relations(customerGroups, ({ many }: { one: any; many: any }) => ({
  members: many(customerGroupMembers),
}));

export const customerGroupMembersRelations = relations(customerGroupMembers, ({ one }: { one: any; many: any }) => ({
  group: one(customerGroups, { fields: [customerGroupMembers.groupId], references: [customerGroups.id] }),
  customer: one(customers, { fields: [customerGroupMembers.customerId], references: [customers.id] }),
}));

export const customerNotesRelations = relations(customerNotes, ({ one }: { one: any; many: any }) => ({
  customer: one(customers, { fields: [customerNotes.customerId], references: [customers.id] }),
}));

export const storeCreditAccountsRelations = relations(storeCreditAccounts, ({ one, many }: { one: any; many: any }) => ({
  customer: one(customers, { fields: [storeCreditAccounts.customerId], references: [customers.id] }),
  transactions: many(storeCreditTransactions),
}));

export const storeCreditTransactionsRelations = relations(storeCreditTransactions, ({ one }: { one: any; many: any }) => ({
  account: one(storeCreditAccounts, { fields: [storeCreditTransactions.accountId], references: [storeCreditAccounts.id] }),
}));

export const customerMergeLogRelations = relations(customerMergeLog, ({ one }: { one: any; many: any }) => ({
  keepCustomer: one(customers, { fields: [customerMergeLog.keepId], references: [customers.id] }),
}));
