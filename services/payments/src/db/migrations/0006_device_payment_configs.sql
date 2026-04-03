-- Migration: 0006_device_payment_configs.sql
-- Per-device payment method configuration.
-- Each paired device (POS, Kiosk) can override which payment methods are available
-- and optionally link to a specific ANZ Worldline terminal credential.

CREATE TABLE IF NOT EXISTS device_payment_configs (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID         NOT NULL,
  -- Device ID as issued by the auth/devices service
  device_id              UUID         NOT NULL,
  -- Array of enabled payment method IDs, e.g. ARRAY['cash','card','giftcard']
  enabled_methods        TEXT[]       NOT NULL DEFAULT '{}',
  -- Optional: which ANZ Worldline terminal credential this device uses for card
  terminal_credential_id UUID         REFERENCES terminal_credentials(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- One config row per device per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_payment_configs_device
  ON device_payment_configs (org_id, device_id);

CREATE INDEX IF NOT EXISTS idx_device_payment_configs_org_id
  ON device_payment_configs (org_id);
