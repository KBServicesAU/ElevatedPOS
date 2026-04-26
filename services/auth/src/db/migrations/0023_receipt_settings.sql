-- ============================================================
-- Migration 0023: Organisation receipt_settings
-- ============================================================
-- Adds a JSONB column to organisations for merchant-controlled
-- receipt rendering preferences. Initial shape:
--   { showOrderNumber: boolean }
-- The column is JSONB so future toggles (logo position, footer
-- variants, paper width hints, etc.) can be added without a new
-- migration. See services/auth/src/routes/organisations.ts for the
-- GET / PATCH endpoints that read and merge into this column.
-- ============================================================

ALTER TABLE "organisations"
  ADD COLUMN IF NOT EXISTS "receipt_settings" jsonb NOT NULL DEFAULT '{}'::jsonb;
