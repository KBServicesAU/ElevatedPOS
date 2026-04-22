-- v2.7.41 — alert_rules table.
-- Replaces the in-memory shadow at apps/web-backoffice/app/api/proxy/alerts/rules
-- which was added in v2.7.40 as a stop-gap. Rules now persist to Postgres so
-- they survive Next.js process restarts (merchant-visible: rules stopped
-- disappearing every time the pod rolled).

CREATE TABLE IF NOT EXISTS "alert_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "channel" text NOT NULL,
  "condition" jsonb NOT NULL DEFAULT '{}',
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_org ON "alert_rules"("org_id");
CREATE INDEX IF NOT EXISTS idx_alert_rules_org_enabled ON "alert_rules"("org_id") WHERE enabled = true;
