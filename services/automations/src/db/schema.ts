import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  text,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const automationTriggerEnum = pgEnum('automation_trigger', [
  'order_completed',
  'customer_created',
  'loyalty_tier_changed',
  'low_stock',
  'birthday',
]);

export const automationExecutionStatusEnum = pgEnum('automation_execution_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const automationRules = pgTable('automation_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  trigger: automationTriggerEnum('trigger').notNull(),
  conditions: jsonb('conditions').notNull().default([]),
  actions: jsonb('actions').notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// v2.7.41 — alert_rules replaces the in-memory shadow that used to live
// at apps/web-backoffice/app/api/proxy/alerts/rules. `condition` holds
// trigger-specific config (threshold, channels array, recipients list, etc.)
// so we can evolve the shape without another migration.
export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  channel: text('channel').notNull(),
  condition: jsonb('condition').notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationExecutions = pgTable('automation_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  ruleId: uuid('rule_id')
    .notNull()
    .references(() => automationRules.id),
  triggerPayload: jsonb('trigger_payload').notNull().default({}),
  status: automationExecutionStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  // Temporal workflow tracking
  workflowId: text('workflow_id'),
  runId: text('run_id'),
  output: text('output'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
