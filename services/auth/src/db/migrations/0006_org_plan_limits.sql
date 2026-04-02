-- Add plan limits, ABN, billing email, and owner to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS max_locations  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_devices    INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS abn            VARCHAR(11),
  ADD COLUMN IF NOT EXISTS billing_email  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS onboarding_step VARCHAR(50) NOT NULL DEFAULT 'completed';

-- Backfill limits based on existing plan values
UPDATE organisations SET max_locations = 1,   max_devices = 2   WHERE plan = 'starter' OR plan IS NULL;
UPDATE organisations SET max_locations = 3,   max_devices = 10  WHERE plan = 'growth';
UPDATE organisations SET max_locations = 9999, max_devices = 9999 WHERE plan = 'enterprise';

-- Mark existing orgs as already completed onboarding
UPDATE organisations SET onboarding_step = 'completed';
