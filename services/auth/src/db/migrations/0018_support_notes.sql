-- Migration: 0017_support_notes
-- Creates the support_notes table for platform staff notes on merchant orgs.

CREATE TABLE IF NOT EXISTS "support_notes" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       uuid NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "body"         text NOT NULL,
  "author_id"    uuid,
  "author_email" varchar(255),
  "author_name"  varchar(255),
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "support_notes_org_id_idx" ON "support_notes" ("org_id");
