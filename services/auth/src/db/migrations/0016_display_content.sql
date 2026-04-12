-- Migration: 0016_display_content
-- Creates display_content table for digital signage screens.

CREATE TABLE display_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE UNIQUE,
  content JSONB,
  published_at TIMESTAMPTZ,
  published_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_display_content_org ON display_content(org_id);
