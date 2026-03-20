CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push');
CREATE TYPE notification_status AS ENUM ('queued', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS "notification_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "channel" notification_channel NOT NULL,
  "subject" text,
  "body" text NOT NULL,
  "variables" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_templates_org ON "notification_templates"("org_id");

CREATE TABLE IF NOT EXISTS "notification_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "template_id" uuid REFERENCES "notification_templates"("id"),
  "channel" notification_channel NOT NULL,
  "recipient" varchar(255) NOT NULL,
  "subject" text,
  "status" notification_status NOT NULL DEFAULT 'queued',
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "sent_at" timestamptz
);
CREATE INDEX idx_notification_logs_org ON "notification_logs"("org_id");
CREATE INDEX idx_notification_logs_status ON "notification_logs"("status");
