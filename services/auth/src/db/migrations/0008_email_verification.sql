ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "email_verification_token" varchar(255),
  ADD COLUMN IF NOT EXISTS "email_verification_expires_at" timestamptz;
