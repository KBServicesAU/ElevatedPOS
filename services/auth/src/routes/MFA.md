# Multi-Factor Authentication — TOTP backend (v2.7.62)

## Status

Backend implemented. Frontend integration (web-backoffice settings page,
mobile second-step screen) is a separate PR.

## Storage

Both `employees` and `platform_staff` carry the same MFA columns:

```sql
mfa_enabled            boolean NOT NULL DEFAULT false
mfa_secret             varchar(255)        -- AES-256-GCM blob, base64
failed_login_attempts  integer NOT NULL DEFAULT 0
locked_until           timestamptz
```

Plus a shared `mfa_recovery_codes` table (migration `0027_mfa_recovery_codes.sql`)
holding bcrypt-hashed single-use codes scoped to either an employee or a
platform staff row via a `CHECK` constraint.

The TOTP secret blob format is `base64(iv(12 bytes) || tag(16 bytes) || ciphertext)`,
keyed by the existing 32-byte `ENCRYPTION_KEY` env var.

## Routes — `/api/v1/auth/mfa/*`

### `POST /enroll` (auth required)

Generates a fresh TOTP secret + 10 single-use recovery codes. Returns:

```json
{
  "otpauthUrl": "otpauth://totp/ElevatedPOS:user@example.com?secret=...&issuer=ElevatedPOS",
  "secret":      "JBSWY3DPEHPK3PXP",
  "recoveryCodes": ["ABCD-EFGH-JKLM", "..."]
}
```

The plaintext secret + recovery codes are returned **once**. The frontend
should display them (preferably with a printable / downloadable list of
recovery codes) and never request them again. Re-enrolling overwrites the
secret and all recovery codes — old codes become invalid.

`mfa_enabled` is **not** flipped at this point — the column flips on the
first successful `/confirm` call. This way an aborted enrolment leaves
the column false, so login isn't broken.

### `POST /confirm` (auth required)

Body: `{ "code": "123456" }`

Accepts the first valid TOTP code from the user's authenticator app. On
match:
- `mfa_enabled = true`
- `system_audit_logs` row written with `notes: 'mfa_enrolled'`

Subsequent logins from this account get the MFA challenge below.

### `POST /verify` (no auth, takes `mfa_pending` JWT in `Authorization`)

Body: `{ "code": "123456" }` **or** `{ "recoveryCode": "ABCD-EFGH-JKLM" }`

Header: `Authorization: Bearer <mfa_pending JWT>`

The `mfa_pending` JWT is short-lived (5 min) and is issued by the modified
`/api/v1/auth/login` (and `/api/v1/platform/login`) when `mfa_enabled=true`
on the matched account. On success, mints the same access + refresh pair
the regular login flow returns.

Failures bump `failed_login_attempts`; 5 failures → 5-minute lock, same as
the existing bad-password handler.

Recovery codes are normalised (whitespace + dashes stripped, uppercased)
before bcrypt-comparing — users can paste them with or without dashes.
A successful recovery-code redemption marks `used_at` so the same code
can never be reused.

### `POST /reset` (platform-staff role required)

Body: `{ "employeeId": "<uuid>" }` **or** `{ "platformStaffId": "<uuid>" }`

Wipes `mfa_secret`, sets `mfa_enabled=false`, deletes all recovery codes
for the target. Used when the operator loses their phone — they then
re-enrol on next login. Audit-logged with the platform-staff actor.

### `POST /recovery-codes/regenerate` (auth required)

Returns a fresh batch of 10 recovery codes, deletes the old set. Used
when the operator suspects their printed code list was lost or copied.

## Login flow change

`POST /api/v1/auth/login` (employees) and `POST /api/v1/platform/login`
(platform staff) both check `mfaEnabled` after a successful password
verify. If true, they short-circuit and return:

```json
{ "mfaRequired": true, "mfaPendingToken": "<jwt>" }
```

instead of the regular access+refresh pair. The frontend redirects to a
TOTP entry screen which posts to `/api/v1/auth/mfa/verify` with the
pending token + the user's 6-digit code.

If `mfaEnabled=false` (the default for every existing row), the login
flow is unchanged.

## Operational notes

- `ENCRYPTION_KEY` must be a 64-character hex string (32 bytes). The
  startup `getKey()` helper throws if it's missing or malformed — the
  service won't accept enrolment requests in that case.
- The `0027_mfa_recovery_codes.sql` migration is idempotent and is also
  applied on every service start by `applyMigrations()` in `index.ts`,
  so no manual intervention is needed when rolling out.
- Recovery codes use a Crockford-ish 32-letter alphabet (no I/O/0/1) so
  hand-written codes don't get OCR'd into ambiguity. Format is
  `XXXX-XXXX-XXXX` for readability — dashes are stripped before bcrypt.

## Until the frontend ships

`mfa_enabled` defaults to `false` for every row in production today. The
backend is wired up and the routes are live, but no login surface will
ever return `mfaRequired: true` until an operator actively walks through
`/enroll` + `/confirm`. So shipping this PR is safe — nothing in the
running system changes for existing users.

Once the frontend ships:
- web-backoffice settings page → calls `/enroll` and `/confirm`.
- mobile employee-login second-step screen → handles the
  `mfaRequired: true` response from `/login` and POSTs to `/verify`.

Both surfaces should also expose `/recovery-codes/regenerate` from the
account-settings flow.
