-- ============================================================
-- Migration 0021: Per-device billing model + 7-step onboarding
-- ============================================================
-- Adds new enums, columns on organisations, and the
-- org_subscription_items table for per-device Stripe billing.
-- ============================================================

-- ── New enums ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "subscription_status" AS ENUM (
    'incomplete', 'trialing', 'active', 'past_due', 'cancelled', 'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "device_type" AS ENUM (
    'pos', 'kds', 'kiosk', 'display', 'dashboard'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "onboarding_step_v2" AS ENUM (
    'business_info',
    'owner_account',
    'location_setup',
    'staff_setup',
    'device_selection',
    'stripe_connect',
    'subscription',
    'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── New columns on organisations ──────────────────────────────────────────────

ALTER TABLE "organisations"
  ADD COLUMN IF NOT EXISTS "phone"                           varchar(50),
  ADD COLUMN IF NOT EXISTS "business_address"                jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "website_url"                     varchar(500),
  ADD COLUMN IF NOT EXISTS "billing_model"                   varchar(20) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS "subscription_status"             "subscription_status" NOT NULL DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS "stripe_subscription_id"          varchar(255),
  ADD COLUMN IF NOT EXISTS "subscription_current_period_end" timestamptz,
  ADD COLUMN IF NOT EXISTS "website_addon_enabled"           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "custom_domain_addon_enabled"     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_flags"                   jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "onboarding_step_v2"              "onboarding_step_v2" DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS "onboarding_token"                varchar(255),
  ADD COLUMN IF NOT EXISTS "onboarding_token_expires_at"     timestamptz,
  ADD COLUMN IF NOT EXISTS "pending_device_selection"        jsonb DEFAULT '{}';

-- Existing orgs keep their legacy model and are considered active
UPDATE "organisations"
SET "billing_model" = 'legacy', "subscription_status" = 'active'
WHERE "billing_model" = 'legacy' AND "onboarding_step" = 'completed';

-- ── org_subscription_items ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "org_subscription_items" (
  "id"                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                      uuid        NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "device_type"                 "device_type" NOT NULL,
  "quantity"                    integer     NOT NULL DEFAULT 0,
  "stripe_subscription_item_id" varchar(255),
  "stripe_price_id"             varchar(255),
  "unit_amount_cents"           integer     NOT NULL DEFAULT 0,
  "created_at"                  timestamptz NOT NULL DEFAULT now(),
  "updated_at"                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_sub_items_org_device_unique"
  ON "org_subscription_items" ("org_id", "device_type");
