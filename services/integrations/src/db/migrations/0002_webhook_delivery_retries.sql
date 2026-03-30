-- Migration: add retry tracking columns to webhook_deliveries
-- and add duration tracking

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- Index for the retry poller — quickly find deliveries due for retry
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries (next_retry_at)
  WHERE success = false AND next_retry_at IS NOT NULL;
