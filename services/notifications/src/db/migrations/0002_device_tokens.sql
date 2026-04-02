-- Migration: 0002_device_tokens.sql
-- Adds device_tokens table for push notification device registration.

DO $$ BEGIN
  CREATE TYPE device_platform AS ENUM ('ios', 'android', 'web');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS device_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,
  customer_id   UUID NOT NULL,
  device_token  VARCHAR(512) NOT NULL,
  platform      device_platform NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_org_token   ON device_tokens (org_id, device_token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_customer_id ON device_tokens (customer_id);
