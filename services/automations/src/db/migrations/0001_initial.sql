CREATE TYPE automation_trigger AS ENUM (
  'order_completed', 'customer_created', 'loyalty_tier_changed', 'low_stock', 'birthday'
);
CREATE TYPE automation_execution_status AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS "automation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "trigger" automation_trigger NOT NULL,
  "conditions" jsonb NOT NULL DEFAULT '[]',
  "actions" jsonb NOT NULL DEFAULT '[]',
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_rules_org ON "automation_rules"("org_id");
CREATE INDEX idx_automation_rules_trigger ON "automation_rules"("trigger") WHERE enabled = true;

CREATE TABLE IF NOT EXISTS "automation_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "rule_id" uuid NOT NULL REFERENCES "automation_rules"("id"),
  "trigger_payload" jsonb NOT NULL DEFAULT '{}',
  "status" automation_execution_status NOT NULL DEFAULT 'pending',
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX idx_automation_executions_org ON "automation_executions"("org_id");
CREATE INDEX idx_automation_executions_rule ON "automation_executions"("rule_id");
