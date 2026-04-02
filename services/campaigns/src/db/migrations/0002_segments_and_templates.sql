-- Migration: 0002_segments_and_templates.sql
-- Adds audience segments and campaign templates tables.

CREATE TABLE IF NOT EXISTS segments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  filters      JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segments_org_id ON segments (org_id);

DO $$ BEGIN
  CREATE TYPE campaign_template_channel AS ENUM ('email', 'sms', 'push');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS campaign_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  name        VARCHAR(255) NOT NULL,
  channel     campaign_template_channel NOT NULL,
  subject     TEXT,
  body        TEXT NOT NULL,
  variables   JSONB NOT NULL DEFAULT '[]',
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_templates_org_id ON campaign_templates (org_id);
