-- Add Temporal workflow tracking columns to automation_executions
ALTER TABLE "automation_executions"
  ADD COLUMN IF NOT EXISTS "workflow_id" text,
  ADD COLUMN IF NOT EXISTS "run_id" text,
  ADD COLUMN IF NOT EXISTS "output" text,
  ADD COLUMN IF NOT EXISTS "started_at" timestamptz;

CREATE INDEX IF NOT EXISTS automation_executions_automation_id_idx ON "automation_executions"("rule_id");
CREATE INDEX IF NOT EXISTS automation_executions_org_id_idx ON "automation_executions"("org_id");
