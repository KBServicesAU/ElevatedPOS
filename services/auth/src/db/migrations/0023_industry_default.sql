-- ============================================================
-- Migration 0023: Industry default + NOT NULL
-- ============================================================
-- The `industry` column was originally added as nullable (0011).
-- The hospitality order-type picker (v2.7.44) reads it from
-- /api/v1/devices/config and must always have a defined value
-- so the mobile app can branch on it without null-checking.
--
-- Allowed values: 'retail' | 'hospitality' | 'pharmacy' | 'services'
-- Default: 'retail' so existing pre-onboarding orgs behave the same
-- as a freshly-created retail merchant.
-- ============================================================

-- Back-fill any rows missing an industry (orgs created before
-- the onboarding flow asked the question).
UPDATE "organisations"
   SET "industry" = 'retail'
 WHERE "industry" IS NULL;

-- Apply NOT NULL + default for new rows.
ALTER TABLE "organisations"
  ALTER COLUMN "industry" SET DEFAULT 'retail',
  ALTER COLUMN "industry" SET NOT NULL;
