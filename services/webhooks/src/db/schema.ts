import {
  pgTable, uuid, text, timestamp, jsonb, integer, pgEnum,
} from 'drizzle-orm/pg-core';

export const webhookEndpointStatusEnum = pgEnum('webhook_endpoint_status', ['active', 'inactive', 'suspended']);
export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', ['pending', 'success', 'failed', 'retrying']);

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  url: text('url').notNull(),
  events: text('events').array().notNull().default([]),
  secret: text('secret').notNull(),
  status: webhookEndpointStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable('webhook_endpoint_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpointId: uuid('endpoint_id').notNull().references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
  responseCode: integer('response_code'),
  responseBody: text('response_body'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
