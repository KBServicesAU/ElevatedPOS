ALTER TABLE "organisations"
  ADD COLUMN IF NOT EXISTS "industry" varchar(50),
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamptz;
