-- Migration: 0008_drop_terminal_credentials_unique.sql
--
-- Drops the legacy partial UNIQUE(org_id, provider) WHERE is_active index on
-- terminal_credentials. This index enforced a single-terminal-per-provider
-- model from the pre-multi-terminal era, but the Dashboard → Payments →
-- Terminals UI now lets admins register many physical terminals for the same
-- provider (e.g. one ANZ TIM per register). The INSERT path in the payments
-- API's saveCredentials route always allocates a new row when no `id` is
-- passed, so the unique index causes 500 "duplicate key value violates
-- unique constraint" responses the moment a second ANZ terminal is added.
--
-- Replaces it with a non-unique composite index on the same columns to keep
-- the `getTIMClient` org-default lookup fast.

DROP INDEX IF EXISTS idx_terminal_credentials_org_provider;

CREATE INDEX IF NOT EXISTS idx_terminal_credentials_org_provider
  ON terminal_credentials (org_id, provider)
  WHERE is_active = TRUE;
