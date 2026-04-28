/**
 * TOTP-based 2FA routes (v2.7.62).
 *
 * Mounted at `/api/v1/auth/mfa`. Implements RFC 6238 TOTP enrolment +
 * verification on top of the existing employee / platform_staff JWT auth.
 *
 *   POST /enroll                  — generate secret + recovery codes
 *   POST /confirm                 — accept first TOTP code, flip mfa_enabled
 *   POST /verify                  — exchange mfa_pending JWT + TOTP for full token
 *   POST /reset                   — platform-staff-initiated MFA reset
 *   POST /recovery-codes/regenerate — new set of codes, invalidates old
 *
 * Storage: TOTP secret is encrypted at rest with AES-256-GCM keyed by the
 * 32-byte ENCRYPTION_KEY env var. Recovery codes are bcrypt-hashed (cost 12)
 * and stored in `mfa_recovery_codes`. The plaintext secret + codes are
 * returned to the client exactly ONCE during /enroll and /regenerate.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import { db, schema } from '../db';
import { generateRefreshToken, hashToken } from '../lib/tokens';

// ── Crypto helpers ────────────────────────────────────────────────────────────

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;       // 96-bit IV is the GCM standard
const TAG_LEN = 16;      // 128-bit auth tag

function getKey(): Buffer {
  const hex = process.env['ENCRYPTION_KEY'];
  if (!hex) throw new Error('ENCRYPTION_KEY env var is required for MFA');
  // Accept 64-hex-char (32-byte) keys per the secrets.yaml.template convention.
  if (hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/** Encrypt with AES-256-GCM. Returns base64(iv || tag || ciphertext). */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/** Reverse of encryptSecret. Throws if the GCM tag fails — never returns garbage. */
export function decryptSecret(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('encrypted blob too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// ── Recovery code helpers ─────────────────────────────────────────────────────

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LEN = 12;
// Crockford-ish base32 (no I/O/0/1 to avoid OCR/handwritten ambiguity).
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generate one human-readable code formatted as `XXXX-XXXX-XXXX`. */
function generateRecoveryCode(): string {
  // crypto.randomInt is bias-free for the 0..32 range.
  const chars: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_LEN; i++) {
    chars.push(RECOVERY_ALPHABET[crypto.randomInt(0, RECOVERY_ALPHABET.length)]!);
  }
  // Group in 4s for readability — the dashes are stripped at verify time.
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

/** Strip dashes + uppercase so the user can paste codes back any-which-way. */
function normaliseRecoveryCode(input: string): string {
  return input.replace(/[\s-]+/g, '').toUpperCase();
}

async function hashRecoveryCode(code: string): Promise<string> {
  // cost 12 matches the password-hash cost in lib/tokens.ts.
  return bcrypt.hash(normaliseRecoveryCode(code), 12);
}

// ── Generate + persist a fresh set of recovery codes for an owner ─────────────

interface RecoveryOwner {
  employeeId?: string | undefined;
  platformStaffId?: string | undefined;
}

async function regenerateCodesFor(owner: RecoveryOwner): Promise<string[]> {
  // Wipe the old set (any unused codes are now invalid).
  if (owner.employeeId) {
    await db.delete(schema.mfaRecoveryCodes).where(eq(schema.mfaRecoveryCodes.employeeId, owner.employeeId));
  } else if (owner.platformStaffId) {
    await db.delete(schema.mfaRecoveryCodes).where(eq(schema.mfaRecoveryCodes.platformStaffId, owner.platformStaffId));
  }

  const plaintext: string[] = [];
  const rows: { codeHash: string; employeeId: string | null; platformStaffId: string | null }[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = generateRecoveryCode();
    plaintext.push(code);
    rows.push({
      codeHash: await hashRecoveryCode(code),
      employeeId: owner.employeeId ?? null,
      platformStaffId: owner.platformStaffId ?? null,
    });
  }
  await db.insert(schema.mfaRecoveryCodes).values(rows);
  return plaintext;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const codeOnlySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

const verifySchema = z.union([
  z.object({ code: z.string().regex(/^\d{6}$/) }),
  z.object({ recoveryCode: z.string().min(8) }),
]);

const resetSchema = z.object({
  employeeId:       z.string().uuid().optional(),
  platformStaffId:  z.string().uuid().optional(),
}).refine(
  (v) => Boolean(v.employeeId) !== Boolean(v.platformStaffId),
  { message: 'Provide exactly one of employeeId or platformStaffId.' },
);

// ── Plugin ────────────────────────────────────────────────────────────────────

interface EmployeeJwtPayload {
  sub: string;
  orgId: string;
  email?: string;
  name?: string;
  type?: string;
}

interface PlatformJwtPayload {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'superadmin' | 'support' | 'reseller' | 'sales_agent';
  type: 'platform';
}

interface MfaPendingPayload {
  sub: string;
  type: 'mfa_pending';
  /** 'employee' | 'platform' — which table to flip on success. */
  subjectType: 'employee' | 'platform';
}

const ISSUER = 'ElevatedPOS';

/**
 * Bump the failed-MFA counter and lock after 5 failures, mirroring the
 * pattern in routes/auth.ts for bad passwords.
 */
async function recordMfaFailure(subjectType: 'employee' | 'platform', subjectId: string): Promise<void> {
  if (subjectType === 'employee') {
    const row = await db.query.employees.findFirst({
      where: eq(schema.employees.id, subjectId),
      columns: { failedLoginAttempts: true },
    });
    if (!row) return;
    const attempts = row.failedLoginAttempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000) : null;
    await db
      .update(schema.employees)
      .set({ failedLoginAttempts: attempts, ...(lockedUntil ? { lockedUntil } : {}) })
      .where(eq(schema.employees.id, subjectId));
  } else {
    const row = await db.query.platformStaff.findFirst({
      where: eq(schema.platformStaff.id, subjectId),
      columns: { failedLoginAttempts: true },
    });
    if (!row) return;
    const attempts = row.failedLoginAttempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000) : null;
    await db
      .update(schema.platformStaff)
      .set({ failedLoginAttempts: attempts, ...(lockedUntil ? { lockedUntil } : {}) })
      .where(eq(schema.platformStaff.id, subjectId));
  }
}

async function clearMfaFailures(subjectType: 'employee' | 'platform', subjectId: string): Promise<void> {
  if (subjectType === 'employee') {
    await db
      .update(schema.employees)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(schema.employees.id, subjectId));
  } else {
    await db
      .update(schema.platformStaff)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(schema.platformStaff.id, subjectId));
  }
}

export async function mfaRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/mfa/enroll  — employee Bearer required
  app.post('/enroll', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as EmployeeJwtPayload;
    if (user.type === 'platform') {
      // Platform staff enrolment uses the same secret machinery, just the
      // other table.
      const staffId = user.sub;
      const staff = await db.query.platformStaff.findFirst({
        where: eq(schema.platformStaff.id, staffId),
      });
      if (!staff) return reply.status(404).send({ title: 'Staff not found', status: 404 });

      const secret = authenticator.generateSecret();
      await db
        .update(schema.platformStaff)
        .set({ mfaSecret: encryptSecret(secret) })
        .where(eq(schema.platformStaff.id, staffId));
      const recoveryCodes = await regenerateCodesFor({ platformStaffId: staffId });

      const otpauthUrl = `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(staff.email)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}`;
      return reply.status(200).send({ otpauthUrl, secret, recoveryCodes });
    }

    const employeeId = user.sub;
    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.id, employeeId),
    });
    if (!employee) return reply.status(404).send({ title: 'Employee not found', status: 404 });

    const secret = authenticator.generateSecret();
    await db
      .update(schema.employees)
      .set({ mfaSecret: encryptSecret(secret), updatedAt: new Date() })
      .where(eq(schema.employees.id, employeeId));
    const recoveryCodes = await regenerateCodesFor({ employeeId });

    const otpauthUrl = `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(employee.email)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}`;
    return reply.status(200).send({ otpauthUrl, secret, recoveryCodes });
  });

  // POST /api/v1/auth/mfa/confirm — first valid TOTP flips mfa_enabled
  app.post('/confirm', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = codeOnlySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }
    const user = request.user as EmployeeJwtPayload;
    const isPlatform = user.type === 'platform';

    if (isPlatform) {
      const staff = await db.query.platformStaff.findFirst({
        where: eq(schema.platformStaff.id, user.sub),
      });
      if (!staff?.mfaSecret) return reply.status(400).send({ title: 'No pending enrolment', status: 400 });
      const secret = decryptSecret(staff.mfaSecret);
      if (!authenticator.check(body.data.code, secret)) {
        return reply.status(401).send({ title: 'Invalid code', status: 401 });
      }
      await db
        .update(schema.platformStaff)
        .set({ mfaEnabled: true })
        .where(eq(schema.platformStaff.id, staff.id));
      request.audit?.({
        actorType: 'godmode_staff',
        actorId: staff.id,
        actorName: `${staff.firstName} ${staff.lastName}`,
        action: 'update',
        entityType: 'platform_staff',
        entityId: staff.id,
        notes: 'mfa_enrolled',
        statusCode: 200,
      });
      return reply.status(200).send({ ok: true });
    }

    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.id, user.sub),
    });
    if (!employee?.mfaSecret) return reply.status(400).send({ title: 'No pending enrolment', status: 400 });
    const secret = decryptSecret(employee.mfaSecret);
    if (!authenticator.check(body.data.code, secret)) {
      return reply.status(401).send({ title: 'Invalid code', status: 401 });
    }
    await db
      .update(schema.employees)
      .set({ mfaEnabled: true, updatedAt: new Date() })
      .where(eq(schema.employees.id, employee.id));

    request.audit?.({
      orgId: employee.orgId,
      actorId: employee.id,
      actorName: `${employee.firstName} ${employee.lastName}`,
      actorType: 'employee',
      action: 'update',
      entityType: 'employee',
      entityId: employee.id,
      notes: 'mfa_enrolled',
      statusCode: 200,
    });

    return reply.status(200).send({ ok: true });
  });

  // POST /api/v1/auth/mfa/verify — public endpoint, takes mfa_pending JWT in
  // header. Exchanges (pending JWT + 6-digit TOTP OR recovery code) for the
  // full access+refresh pair.
  app.post('/verify', { config: { skipAuth: true } }, async (request, reply) => {
    let pending: MfaPendingPayload;
    try {
      // Decode without going through app.authenticate — that one enforces
      // the blacklist, but mfa_pending tokens are short-lived (5m) and
      // don't carry a jti the rest of the system tracks.
      const auth = request.headers.authorization;
      if (!auth?.startsWith('Bearer ')) {
        return reply.status(401).send({ title: 'Missing mfa_pending token', status: 401 });
      }
      const decoded = app.jwt.verify(auth.slice('Bearer '.length)) as Partial<MfaPendingPayload>;
      if (decoded.type !== 'mfa_pending' || !decoded.sub || !decoded.subjectType) {
        return reply.status(401).send({ title: 'Invalid mfa_pending token', status: 401 });
      }
      pending = decoded as MfaPendingPayload;
    } catch {
      return reply.status(401).send({ title: 'Invalid mfa_pending token', status: 401 });
    }

    const body = verifySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    if (pending.subjectType === 'platform') {
      const staff = await db.query.platformStaff.findFirst({
        where: eq(schema.platformStaff.id, pending.sub),
      });
      if (!staff?.mfaSecret || !staff.mfaEnabled) {
        return reply.status(401).send({ title: 'MFA not enrolled', status: 401 });
      }
      if (staff.lockedUntil && staff.lockedUntil > new Date()) {
        return reply.status(429).send({ title: 'Account locked', status: 429 });
      }

      let ok = false;
      if ('code' in body.data) {
        ok = authenticator.check(body.data.code, decryptSecret(staff.mfaSecret));
      } else {
        ok = await tryRecoveryCode({ platformStaffId: staff.id }, body.data.recoveryCode);
      }
      if (!ok) {
        await recordMfaFailure('platform', staff.id);
        request.audit?.({
          actorType: 'godmode_staff',
          actorId: staff.id,
          actorName: `${staff.firstName} ${staff.lastName}`,
          action: 'auth_fail',
          entityType: 'platform_staff',
          entityId: staff.id,
          notes: 'mfa_verify_failed',
          statusCode: 401,
        });
        return reply.status(401).send({ title: 'Invalid code', status: 401 });
      }
      await clearMfaFailures('platform', staff.id);

      const token = app.jwt.sign(
        {
          sub: staff.id,
          email: staff.email,
          firstName: staff.firstName,
          lastName: staff.lastName,
          role: staff.role,
          resellerOrgId: staff.resellerOrgId ?? null,
          type: 'platform',
        } satisfies PlatformJwtPayload & { resellerOrgId: string | null },
        { expiresIn: '8h' },
      );
      const userPayload = { id: staff.id, email: staff.email, name: `${staff.firstName} ${staff.lastName}`, firstName: staff.firstName, lastName: staff.lastName, role: staff.role };
      request.audit?.({
        actorType: 'godmode_staff',
        actorId: staff.id,
        actorName: `${staff.firstName} ${staff.lastName}`,
        action: 'login',
        entityType: 'platform_staff',
        entityId: staff.id,
        notes: 'mfa_verified',
        statusCode: 200,
      });
      return reply.status(200).send({ token, accessToken: token, staff: userPayload, user: userPayload });
    }

    // Employee subject
    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.id, pending.sub),
      with: { role: true },
    });
    if (!employee?.mfaSecret || !employee.mfaEnabled) {
      return reply.status(401).send({ title: 'MFA not enrolled', status: 401 });
    }
    if (employee.lockedUntil && employee.lockedUntil > new Date()) {
      return reply.status(429).send({ title: 'Account locked', status: 429 });
    }

    let ok = false;
    if ('code' in body.data) {
      ok = authenticator.check(body.data.code, decryptSecret(employee.mfaSecret));
    } else {
      ok = await tryRecoveryCode({ employeeId: employee.id }, body.data.recoveryCode);
    }
    if (!ok) {
      await recordMfaFailure('employee', employee.id);
      request.audit?.({
        orgId: employee.orgId,
        actorId: employee.id,
        actorName: `${employee.firstName} ${employee.lastName}`,
        actorType: 'employee',
        action: 'auth_fail',
        entityType: 'employee',
        entityId: employee.id,
        notes: 'mfa_verify_failed',
        statusCode: 401,
      });
      return reply.status(401).send({ title: 'Invalid code', status: 401 });
    }
    await clearMfaFailures('employee', employee.id);

    // Mint the same access+refresh pair the regular /login endpoint emits.
    const accessToken = app.jwt.sign({
      sub: employee.id,
      orgId: employee.orgId,
      roleId: employee.roleId,
      permissions: (employee.role?.permissions ?? {}) as Record<string, boolean>,
      locationIds: (employee.locationIds ?? []) as string[],
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
    });

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(schema.refreshTokens).values({
      employeeId: employee.id,
      tokenHash,
      ipAddress: request.ip,
      expiresAt,
    });

    request.audit?.({
      orgId: employee.orgId,
      actorId: employee.id,
      actorName: `${employee.firstName} ${employee.lastName}`,
      actorType: 'employee',
      action: 'login',
      entityType: 'employee',
      entityId: employee.id,
      notes: 'mfa_verified',
      statusCode: 200,
    });

    return reply.status(200).send({
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900,
      employee: {
        id: employee.id,
        orgId: employee.orgId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        roleId: employee.roleId,
        locationIds: employee.locationIds,
      },
    });
  });

  // POST /api/v1/auth/mfa/reset — platform-staff initiated. Wipes secret +
  // all recovery codes; the operator can then re-enrol.
  app.post('/reset', { onRequest: [app.authenticate] }, async (request, reply) => {
    const actor = request.user as PlatformJwtPayload;
    if (actor.type !== 'platform') {
      return reply.status(403).send({ title: 'Platform staff required', status: 403 });
    }

    const body = resetSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    if (body.data.employeeId) {
      const employee = await db.query.employees.findFirst({
        where: eq(schema.employees.id, body.data.employeeId),
      });
      if (!employee) return reply.status(404).send({ title: 'Employee not found', status: 404 });
      await db
        .update(schema.employees)
        .set({ mfaEnabled: false, mfaSecret: null, updatedAt: new Date() })
        .where(eq(schema.employees.id, employee.id));
      await db.delete(schema.mfaRecoveryCodes).where(eq(schema.mfaRecoveryCodes.employeeId, employee.id));

      request.audit?.({
        orgId: employee.orgId,
        actorType: 'godmode_staff',
        actorId: actor.sub,
        actorName: `${actor.firstName} ${actor.lastName}`,
        action: 'update',
        entityType: 'employee',
        entityId: employee.id,
        notes: 'mfa_reset',
        statusCode: 200,
      });
      return reply.status(200).send({ ok: true });
    }

    // Platform staff target.
    const target = await db.query.platformStaff.findFirst({
      where: eq(schema.platformStaff.id, body.data.platformStaffId!),
    });
    if (!target) return reply.status(404).send({ title: 'Staff not found', status: 404 });
    await db
      .update(schema.platformStaff)
      .set({ mfaEnabled: false, mfaSecret: null })
      .where(eq(schema.platformStaff.id, target.id));
    await db.delete(schema.mfaRecoveryCodes).where(eq(schema.mfaRecoveryCodes.platformStaffId, target.id));

    request.audit?.({
      actorType: 'godmode_staff',
      actorId: actor.sub,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action: 'update',
      entityType: 'platform_staff',
      entityId: target.id,
      notes: 'mfa_reset',
      statusCode: 200,
    });
    return reply.status(200).send({ ok: true });
  });

  // POST /api/v1/auth/mfa/recovery-codes/regenerate — burn old codes, issue new
  app.post('/recovery-codes/regenerate', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as EmployeeJwtPayload;
    if (user.type === 'platform') {
      const codes = await regenerateCodesFor({ platformStaffId: user.sub });
      return reply.status(200).send({ recoveryCodes: codes });
    }
    const codes = await regenerateCodesFor({ employeeId: user.sub });
    return reply.status(200).send({ recoveryCodes: codes });
  });
}

// ── Recovery-code matcher ─────────────────────────────────────────────────────

async function tryRecoveryCode(owner: RecoveryOwner, raw: string): Promise<boolean> {
  const normalised = normaliseRecoveryCode(raw);
  const where = owner.employeeId
    ? and(eq(schema.mfaRecoveryCodes.employeeId, owner.employeeId), isNull(schema.mfaRecoveryCodes.usedAt))
    : and(eq(schema.mfaRecoveryCodes.platformStaffId, owner.platformStaffId!), isNull(schema.mfaRecoveryCodes.usedAt));
  const candidates = await db.query.mfaRecoveryCodes.findMany({ where });
  for (const row of candidates) {
    // bcrypt.compare on each — we don't index by hash because bcrypt is salted.
    if (await bcrypt.compare(normalised, row.codeHash)) {
      await db
        .update(schema.mfaRecoveryCodes)
        .set({ usedAt: new Date() })
        .where(eq(schema.mfaRecoveryCodes.id, row.id));
      return true;
    }
  }
  return false;
}
