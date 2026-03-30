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
