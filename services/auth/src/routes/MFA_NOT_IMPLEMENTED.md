# Multi-Factor Authentication — schema only, NOT WIRED UP

## What exists today (v2.7.61)

The `employees` table has two MFA-related columns from the original schema:

```sql
mfa_enabled  boolean NOT NULL DEFAULT false,
mfa_secret   varchar(255)
```

That's it. There is **no MFA enrollment flow, no verification flow, and the
`/api/v1/auth/login` handler does not check `mfa_enabled`**. The columns are
unused placeholders.

## Why this matters before go-live

Godmode and platform-staff accounts can do a lot — promote employees to
admin, switch organisation industry, force-disable services, etc. A
single-factor breach of one of those accounts is a tenant-wide incident.

Per-employee accounts are less catastrophic (they're scoped to one org,
and have a 5-attempt lockout + 10/min rate limit + WAF in front), but
sole-trader merchants whose owner-admin password leaks still lose
everything for that org.

## What a real implementation needs

1. **Pick a TOTP library** — `otplib` (smaller surface, RFC 6238) or
   `speakeasy` (older, more deps). otplib preferred.

2. **Storage** — extend `mfa_secret` to also hold:
   - the TOTP secret (encrypted with `ENCRYPTION_KEY` at rest)
   - 8-10 single-use recovery codes (also encrypted)
   - a `mfa_enrolled_at` timestamp for audit

3. **Enrollment flow** (employee or platform-staff):
   - `POST /api/v1/auth/mfa/enroll` — generates a secret, returns the
     `otpauth://` URI for the merchant's authenticator app to scan
     and the recovery codes (shown once).
   - `POST /api/v1/auth/mfa/confirm` — accepts a TOTP code from the
     newly-set authenticator; on first valid code, flips
     `mfa_enabled = true` and persists the secret.

4. **Login flow change** in `services/auth/src/routes/auth.ts:49`:
   - After bcrypt success, if `employee.mfaEnabled`:
     - Issue a short-lived (`5m`) "mfa_pending" JWT instead of the
       normal access+refresh pair.
     - Frontend redirects to a TOTP entry screen.
   - `POST /api/v1/auth/mfa/verify` — exchanges the mfa_pending JWT +
     a 6-digit TOTP code for the real access+refresh pair.
   - Recovery codes get the same treatment via a separate endpoint
     (`POST /mfa/recovery`).

5. **Disable / reset flow** — admin-initiated MFA reset for the
   "operator lost their phone" case. Requires platform-staff role
   to wipe `mfa_secret` + set `mfa_enabled = false`.

6. **Frontend** — both web-backoffice (settings page) and mobile
   (employee-login second-step screen).

## Estimated effort

~1.5 days end-to-end including tests, audit-log entries, and the
admin-reset flow. Can be split into two PRs:
- PR 1: backend (enrollment, verify, recovery code endpoints).
- PR 2: frontend (web + mobile) + login-flow integration.

## Until then

The `mfa_enabled` column should NOT be flipped to `true` for any user —
flipping it without the verify path being implemented would lock out
that user (login flow doesn't know how to handle it yet, but if/when
the verify path is added it'll start refusing logins for any account
flagged enabled). The migration in 0026 doesn't touch this column.

Stripe Connect's own MFA enforcement covers the merchant's Stripe
dashboard access independently of this; the gap above is for the
ElevatedPOS dashboard + godmode logins specifically.
