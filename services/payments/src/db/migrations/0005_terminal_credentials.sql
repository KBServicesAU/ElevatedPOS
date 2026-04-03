-- Migration: 0005_terminal_credentials.sql
-- Adds terminal_credentials table for storing per-org payment terminal
-- API credentials (ANZ Worldline, Tyro, Windcave, etc.).

CREATE TABLE IF NOT EXISTS terminal_credentials (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID         NOT NULL,
  provider     VARCHAR(50)  NOT NULL,
  label        VARCHAR(255),
  merchant_id  VARCHAR(255),
  api_key      VARCHAR(500),
  api_secret   VARCHAR(500),
  environment  VARCHAR(20)  NOT NULL DEFAULT 'preprod',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata     JSONB                 DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_credentials_org_provider
  ON terminal_credentials (org_id, provider)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_terminal_credentials_org_id
  ON terminal_credentials (org_id);
