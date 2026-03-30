import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

export const notificationChannelEnum = pgEnum('notification_channel', ['email', 'sms', 'push']);

export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sent',
  'failed',
]);

export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  channel: notificationChannelEnum('channel').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  variables: jsonb('variables').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  templateId: uuid('template_id').references(() => notificationTemplates.id),
  channel: notificationChannelEnum('channel').notNull(),
  recipient: varchar('recipient', { length: 255 }).notNull(),
  subject: text('subject'),
  status: notificationStatusEnum('status').notNull().default('queued'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

export const devicePlatformEnum = pgEnum('device_platform', ['ios', 'android', 'web']);

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    deviceToken: varchar('device_token', { length: 512 }).notNull(),
    platform: devicePlatformEnum('platform').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgTokenIdx: index('device_tokens_org_token_idx').on(t.orgId, t.deviceToken),
    customerIdx: index('device_tokens_customer_idx').on(t.customerId),
  }),
);
