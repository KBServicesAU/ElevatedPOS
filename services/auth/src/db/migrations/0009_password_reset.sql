ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "password_reset_token" varchar(255),
  ADD COLUMN IF NOT EXISTS "password_reset_expires_at" timestamptz;
