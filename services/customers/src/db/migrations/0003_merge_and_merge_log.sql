-- Migration: 0003_merge_and_merge_log.sql
-- Adds merged_into_id column to customers table and creates customer_merge_log table.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS customer_merge_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL,
  keep_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  merged_id  TEXT NOT NULL,
  merged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  merged_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_merge_log_org_id  ON customer_merge_log (org_id);
CREATE INDEX IF NOT EXISTS idx_customer_merge_log_keep_id ON customer_merge_log (keep_id);
