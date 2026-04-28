-- v2.7.60 — case-insensitive email uniqueness on auth tables.
--
-- Until today, the /api/v1/auth/login handler lowercased the incoming
-- email before matching, but several insert paths (the public /register,
-- platform-staff signup, the legacy onboarding wizard) wrote the raw
-- mixed-case input straight into the DB. Result: signing up with
-- "Info@KBServices.com.au" stored that exact string, and any subsequent
-- login for the same merchant 401'd because the lookup
-- `WHERE email = 'info@kbservices.com.au'` never matched the stored row.
-- We patched every known write site in v2.7.51 / v2.7.55 / v2.7.60 to
-- normalise at write time, but app-level enforcement is fragile — one
-- new code path that forgets the .toLowerCase() and the bug is back.
--
-- This migration moves the invariant into the database, where it cannot
-- be bypassed:
--
--   1. Lowercase every existing email in `employees` and `platform_staff`
--      that's still mixed-case. Idempotent — running it again is a no-op.
--   2. Add a UNIQUE INDEX on `LOWER(email)` for both tables, which:
--      - guarantees no two rows can share an email regardless of case;
--      - causes any future mixed-case insert that collides with an
--        existing lowercase row to fail at INSERT time rather than
--        becoming silent broken-login data.
--
-- We deliberately use `LOWER(email)` rather than a CHECK constraint that
-- forces the column to lowercase, so callers that haven't been migrated
-- yet still get a clear unique-violation error rather than a confusing
-- "value violates check constraint" message — and the indexes also speed
-- up the existing case-insensitive login lookup.

BEGIN;

-- ─── employees ───────────────────────────────────────────────────────────────
UPDATE employees
   SET email      = LOWER(email),
       updated_at = NOW()
 WHERE email <> LOWER(email);

CREATE UNIQUE INDEX IF NOT EXISTS employees_email_lower_unique_idx
    ON employees ((LOWER(email)));

-- ─── platform_staff (godmode / reseller portal logins) ───────────────────────
UPDATE platform_staff
   SET email = LOWER(email)
 WHERE email <> LOWER(email);

CREATE UNIQUE INDEX IF NOT EXISTS platform_staff_email_lower_unique_idx
    ON platform_staff ((LOWER(email)));

-- ─── organisations.billing_email — non-unique, just normalise ───────────────
-- This isn't a login key, but it's used to address the merchant in
-- transactional emails and we don't want stale mixed-case copies floating
-- around when employees.email is the source of truth.
UPDATE organisations
   SET billing_email = LOWER(billing_email),
       updated_at    = NOW()
 WHERE billing_email IS NOT NULL
   AND billing_email <> LOWER(billing_email);

COMMIT;
