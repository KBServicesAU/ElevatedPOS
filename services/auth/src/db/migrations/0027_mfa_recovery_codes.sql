-- v2.7.62 — TOTP MFA: per-user single-use recovery codes table
-- Plus mfa_enabled / mfa_secret on platform_staff (employees already had them
-- from 0001_initial.sql). Existing rows keep mfa_enabled = false until the
-- /confirm endpoint flips it on first successful TOTP verify.

ALTER TABLE platform_staff
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE platform_staff
  ADD COLUMN IF NOT EXISTS mfa_secret varchar(255);
ALTER TABLE platform_staff
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE platform_staff
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid REFERENCES employees(id) ON DELETE CASCADE,
  platform_staff_id uuid REFERENCES platform_staff(id) ON DELETE CASCADE,
  code_hash         varchar(255) NOT NULL,
  used_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT mfa_recovery_codes_one_owner CHECK (
    (employee_id IS NOT NULL AND platform_staff_id IS NULL) OR
    (employee_id IS NULL AND platform_staff_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_employee
  ON mfa_recovery_codes(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_platform
  ON mfa_recovery_codes(platform_staff_id) WHERE platform_staff_id IS NOT NULL;
