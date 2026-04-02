-- Migration: 0001_webhooks.sql
-- Creates webhook_endpoints and webhook_endpoint_deliveries tables
-- NOTE: we use webhook_endpoint_deliveries (not webhook_deliveries) because the
-- integrations service owns a separate webhook_deliveries table with a different schema.

DO $$ BEGIN
  CREATE TYPE webhook_endpoint_status AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'success', 'failed', 'retrying');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL,
  url            TEXT NOT NULL,
  events         TEXT[] NOT NULL DEFAULT '{}',
  secret         TEXT NOT NULL,
  status         webhook_endpoint_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org_id ON webhook_endpoints (org_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_status  ON webhook_endpoints (status);

CREATE TABLE IF NOT EXISTS webhook_endpoint_deliveries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id    UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event          TEXT NOT NULL,
  payload        JSONB NOT NULL,
  status         webhook_delivery_status NOT NULL DEFAULT 'pending',
  response_code  INTEGER,
  response_body  TEXT,
  attempt_count  INTEGER NOT NULL DEFAULT 0,
  next_retry_at  TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_ep_deliveries_endpoint_id  ON webhook_endpoint_deliveries (endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_ep_deliveries_status        ON webhook_endpoint_deliveries (status);
CREATE INDEX IF NOT EXISTS idx_webhook_ep_deliveries_next_retry_at ON webhook_endpoint_deliveries (next_retry_at)
  WHERE next_retry_at IS NOT NULL;
