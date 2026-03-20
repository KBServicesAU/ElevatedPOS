CREATE TABLE IF NOT EXISTS "installed_apps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "app_id" varchar(100) NOT NULL,
  "app_name" varchar(255) NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}',
  "enabled" boolean NOT NULL DEFAULT true,
  "installed_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_installed_apps_org_app ON "installed_apps"("org_id", "app_id");

CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "label" varchar(255) NOT NULL DEFAULT '',
  "url" text NOT NULL,
  "events" text[] NOT NULL DEFAULT '{}',
  "secret" varchar(255) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhooks_org ON "webhooks"("org_id");

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "webhook_id" uuid NOT NULL REFERENCES "webhooks"("id") ON DELETE CASCADE,
  "event" varchar(100) NOT NULL,
  "payload" jsonb NOT NULL,
  "status_code" integer,
  "response" text,
  "success" boolean NOT NULL DEFAULT false,
  "attempted_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_webhook ON "webhook_deliveries"("webhook_id");
CREATE INDEX idx_webhook_deliveries_attempted ON "webhook_deliveries"("attempted_at" DESC);
