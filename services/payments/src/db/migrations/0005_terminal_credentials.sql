-- Migration: 0005_terminal_credentials.sql
-- Adds terminal_credentials table for ANZ Worldline TIM (Terminal Integration
-- Module) and other local payment terminal providers.
-- Uses IP address + port — no cloud API keys needed.

CREATE TABLE IF NOT EXISTS terminal_credentials (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID         NOT NULL,
  provider      VARCHAR(50)  NOT NULL,
  label         VARCHAR(255),
  -- Local network IP address of the EFTPOS terminal (e.g. 192.168.1.100)
  terminal_ip   VARCHAR(45),
  -- HTTP port the terminal listens on (default 8080)
  terminal_port INTEGER      NOT NULL DEFAULT 8080,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata      JSONB                 DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_credentials_org_provider
  ON terminal_credentials (org_id, provider)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_terminal_credentials_org_id
  ON terminal_credentials (org_id);
