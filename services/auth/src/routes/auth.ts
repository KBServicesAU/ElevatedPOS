import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, isNotNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, schema } from '../db';
import { logAudit } from '../lib/audit';
import {
  verifyPassword,
  verifyPin,
  hashPassword,
  generateRefreshToken,
  hashToken,
  addToBlacklist,
} from '../lib/tokens';
import { getRedisClient } from '@nexus/config';

const NOTIFICATIONS_API_URL = process.env['NOTIFICATIONS_API_URL'] ?? 'http://notifications:4009';
const APP_URL               = process.env['APP_URL']               ?? 'https://app.elevatedpos.com.au';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
});

const pinLoginSchema = z.union([
  // Employee-ID-based verification (POS card-select flow)
  z.object({
    employeeId: z.string().uuid(),
    pin: z.string().min(4).max(8),
    locationId: z.string().uuid().optional(),
  }),
  // Org-scan verification (quick PIN / kiosk flow)
  z.object({
    orgId: z.string().uuid(),
    pin: z.string().min(4).max(8),
    registerId: z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  }),
]);

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/login
  // v2.7.61 — tight per-route rate limit on top of the existing
  // 500/15min global cap, plus the existing 5-failed-attempts per-employee
  // lockout in the handler. Three layers means a brute-forcer with one IP
  // gets 10 password attempts per minute (rate-limit) AND triggers the
  // 5-attempt lockout long before that ceiling matters; rotating IPs
  // hits the global cap; account-locked feedback prevents pivot to
  // another employee on the same tenant. Per-route limit shares storage
  // with the global plugin (Redis if configured, in-memory otherwise).
  app.post('/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { email, password, deviceId, deviceName } = body.data;
    const normalisedEmail = email.trim().toLowerCase();

    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.email, normalisedEmail),
      with: { role: true },
    });

    if (!employee || !employee.passwordHash) {
      // v2.7.51 — diagnostic log so we can debug the recurring "Email or
      // password is incorrect" reports. Logs only the email + a boolean for
      // whether a row was found, NEVER the password or hash.
      request.log.warn(
        { email: normalisedEmail, found: !!employee, hasPasswordHash: !!employee?.passwordHash },
        '[auth/login] no matching employee or missing password hash',
      );
      // v2.7.48-univlog — record auth_fail with the attempted email so
      // the merchant + Godmode see brute-force attempts in the activity feed.
      request.audit?.({
        action: 'auth_fail',
        entityType: 'employee',
        entityName: email,
        notes: 'No employee with that email or no password set.',
        statusCode: 401,
      });
      return reply.status(401).send({
        type: 'https://elevatedpos.com/errors/invalid-credentials',
        title: 'Invalid Credentials',
        status: 401,
        detail: 'Email or password is incorrect.',
      });
    }

    if (!employee.isActive) {
      request.audit?.({
        orgId: employee.orgId,
        action: 'auth_fail',
        entityType: 'employee',
        entityId: employee.id,
        entityName: `${employee.firstName} ${employee.lastName}`,
        notes: 'Account inactive.',
        statusCode: 401,
      });
      return reply.status(401).send({
        type: 'https://elevatedpos.com/errors/account-inactive',
        title: 'Account Inactive',
        status: 401,
        detail: 'This account has been deactivated.',
      });
    }

    if (employee.lockedUntil && employee.lockedUntil > new Date()) {
      request.audit?.({
        orgId: employee.orgId,
        action: 'auth_fail',
        entityType: 'employee',
        entityId: employee.id,
        entityName: `${employee.firstName} ${employee.lastName}`,
        notes: `Account locked until ${employee.lockedUntil.toISOString()}.`,
        statusCode: 429,
      });
      return reply.status(429).send({
        type: 'https://elevatedpos.com/errors/account-locked',
        title: 'Account Locked',
        status: 429,
        detail: `Account is locked until ${employee.lockedUntil.toISOString()}.`,
      });
    }

    const valid = await verifyPassword(password, employee.passwordHash);
    if (!valid) {
      // v2.7.51 — diagnostic log: bcrypt rejected the password. Includes the
      // hash prefix ($2a$ / $2b$) and round count so we can spot bcrypt
      // round mismatches across signup paths. Never logs the actual password
      // or full hash.
      const hashPrefix = employee.passwordHash.slice(0, 7);
      request.log.warn(
        { employeeId: employee.id, email: normalisedEmail, hashPrefix },
        '[auth/login] bcrypt compare returned false',
      );
      const attempts = employee.failedLoginAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000) : null;

      await db
        .update(schema.employees)
        .set({
          failedLoginAttempts: attempts,
          ...(lockedUntil ? { lockedUntil } : {}),
        })
        .where(eq(schema.employees.id, employee.id));

      request.audit?.({
        orgId: employee.orgId,
        action: 'auth_fail',
        entityType: 'employee',
        entityId: employee.id,
        entityName: `${employee.firstName} ${employee.lastName}`,
        notes: lockedUntil
          ? `Bad password (attempt ${attempts}/5) — account now locked until ${lockedUntil.toISOString()}.`
          : `Bad password (attempt ${attempts}/5).`,
        statusCode: 401,
      });

      return reply.status(401).send({
        type: 'https://elevatedpos.com/errors/invalid-credentials',
        title: 'Invalid Credentials',
        status: 401,
        detail: 'Email or password is incorrect.',
      });
    }

    // Reset failed attempts on success
    await db
      .update(schema.employees)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(schema.employees.id, employee.id));

    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, employee.orgId),
    });

    if (!org || org.planStatus !== 'active') {
      return reply.status(403).send({
        type: 'https://elevatedpos.com/errors/org-suspended',
        title: 'Organisation Suspended',
        status: 403,
        detail: 'This organisation account is not active.',
      });
    }

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
      deviceId: deviceId ?? null,
      deviceName: deviceName ?? null,
      ipAddress: request.ip,
      expiresAt,
    });

    // v2.7.48-univlog — successful login row.
    request.audit?.({
      orgId: employee.orgId,
      actorId: employee.id,
      actorName: `${employee.firstName} ${employee.lastName}`,
      actorType: 'employee',
      action: 'login',
      entityType: 'employee',
      entityId: employee.id,
      entityName: `${employee.firstName} ${employee.lastName}`,
      notes: deviceName ? `via ${deviceName}` : null,
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

  // POST /api/v1/auth/pin-login
  app.post('/pin-login', async (request, reply) => {
    const body = pinLoginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { pin } = body.data;

    type EmployeeWithRole = Awaited<ReturnType<typeof db.query.employees.findFirst<{ with: { role: true } }>>>;
    // Helper to build the success response for a matched employee
    const buildSuccess = (employee: NonNullable<EmployeeWithRole>) => {
      const accessToken = app.jwt.sign({
        sub: employee.id,
        orgId: employee.orgId,
        roleId: employee.roleId,
        permissions: (employee.role?.permissions ?? {}) as Record<string, boolean>,
        locationIds: (employee.locationIds ?? []) as string[],
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
      });
      // v2.7.48-univlog — successful PIN login.
      request.audit?.({
        orgId: employee.orgId,
        actorId: employee.id,
        actorName: `${employee.firstName} ${employee.lastName}`,
        actorType: 'employee',
        action: 'login',
        entityType: 'employee',
        entityId: employee.id,
        entityName: `${employee.firstName} ${employee.lastName}`,
        notes: 'pin-login',
        statusCode: 200,
      });
      return reply.status(200).send({
        accessToken,
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
    };

    // Employee-ID-based flow: verify PIN against a specific employee
    if ('employeeId' in body.data) {
      const employee = await db.query.employees.findFirst({
        where: and(
          eq(schema.employees.id, body.data.employeeId),
          eq(schema.employees.isActive, true),
        ),
        with: { role: true },
      });
      if (!employee?.pin || !(await verifyPin(pin, employee.pin))) {
        return reply.status(401).send({
          type: 'https://elevatedpos.com/errors/invalid-pin',
          title: 'Invalid PIN',
          status: 401,
          detail: 'No employee found with that PIN.',
        });
      }
      return buildSuccess(employee);
    }

    // Org-scan flow: find whichever employee in the org has this PIN.
    // Rate-limit: track failed PIN attempts per org in Redis (5-minute window, max 10).
    const redis = getRedisClient();
    const orgId = body.data.orgId;
    if (redis) {
      const key = `pin_attempts:${orgId}`;
      const attempts = await redis.incr(key);
      if (attempts === 1) {
        await redis.expire(key, 300); // 5-minute window
      }
      if (attempts > 10) {
        return reply.code(429).send({
          type: 'about:blank',
          title: 'Too Many Requests',
          status: 429,
          detail: 'Too many PIN attempts. Please wait 5 minutes before trying again.',
        });
      }
    }

    // Pre-filter to only employees that have a PIN set, then run all bcrypt
    // compares in parallel to avoid the O(n) sequential bcrypt bottleneck.
    const employees = await db.query.employees.findMany({
      where: and(
        eq(schema.employees.orgId, body.data.orgId),
        eq(schema.employees.isActive, true),
        isNotNull(schema.employees.pin),
      ),
      with: { role: true },
      columns: { id: true, orgId: true, firstName: true, lastName: true, email: true, roleId: true, locationIds: true, pin: true, isActive: true },
    });

    const results = await Promise.all(
      employees.map(async (emp) => ({
        emp,
        match: emp.pin ? await bcrypt.compare(pin, emp.pin) : false,
      })),
    );
    const matched = results.find((r) => r.match);

    if (!matched) {
      return reply.status(401).send({
        type: 'https://elevatedpos.com/errors/invalid-pin',
        title: 'Invalid PIN',
        status: 401,
        detail: 'No employee found with that PIN.',
      });
    }

    // Reset the attempt counter on successful match
    if (redis) {
      await redis.del(`pin_attempts:${orgId}`);
    }

    return buildSuccess(matched.emp as NonNullable<EmployeeWithRole>);
  });

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (request, reply) => {
    const body = refreshSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
      });
    }

    const tokenHash = hashToken(body.data.refreshToken);
    const stored = await db.query.refreshTokens.findFirst({
      where: eq(schema.refreshTokens.tokenHash, tokenHash),
      with: { employee: { with: { role: true } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return reply.status(401).send({
        type: 'https://elevatedpos.com/errors/invalid-refresh-token',
        title: 'Invalid or Expired Refresh Token',
        status: 401,
      });
    }

    const { employee } = stored;
    if (!employee.isActive) {
      return reply.status(401).send({
        type: 'https://elevatedpos.com/errors/account-inactive',
        title: 'Account Inactive',
        status: 401,
      });
    }

    // Rotate: revoke old token and issue new — wrapped in a transaction to
    // prevent a race condition where two concurrent refresh calls both pass
    // the token lookup check and issue duplicate tokens.
    let newRawRefreshToken!: string;
    try {
      await db.transaction(async (tx) => {
        // Re-fetch the token inside the transaction to detect concurrent use
        const lockedToken = await tx.query.refreshTokens.findFirst({
          where: and(eq(schema.refreshTokens.id, stored.id), eq(schema.refreshTokens.tokenHash, tokenHash)),
        });

        if (!lockedToken || lockedToken.revokedAt) {
          // Another concurrent request already rotated this token
          throw Object.assign(new Error('token_already_rotated'), { statusCode: 401 });
        }

        // Revoke old token
        await tx
          .update(schema.refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(schema.refreshTokens.id, stored.id));

        newRawRefreshToken = generateRefreshToken();
        const newTokenHash = hashToken(newRawRefreshToken);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await tx.insert(schema.refreshTokens).values({
          employeeId: employee.id,
          tokenHash: newTokenHash,
          deviceId: stored.deviceId,
          deviceName: stored.deviceName,
          ipAddress: request.ip,
          expiresAt,
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'token_already_rotated') {
        return reply.status(401).send({
          type: 'https://elevatedpos.com/errors/invalid-refresh-token',
          title: 'Invalid or Expired Refresh Token',
          status: 401,
        });
      }
      throw err;
    }

    const accessToken = app.jwt.sign({
      sub: employee.id,
      orgId: employee.orgId,
      roleId: employee.roleId,
      permissions: (employee.role?.permissions ?? {}) as Record<string, boolean>,
      locationIds: (employee.locationIds ?? []) as string[],
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
    });

    return reply.status(200).send({
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 900,
    });
  });

  // POST /api/v1/auth/logout
  app.post('/logout', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    // Blacklist the current access token's JTI so it can't be reused
    const jwtPayload = request.user as { jti?: string; exp?: number; sub?: string; orgId?: string; name?: string };
    if (jwtPayload.jti && jwtPayload.exp) {
      await addToBlacklist(jwtPayload.jti, jwtPayload.exp);
    }

    const body = refreshSchema.safeParse(request.body);
    if (body.success) {
      const tokenHash = hashToken(body.data.refreshToken);
      await db
        .update(schema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(schema.refreshTokens.tokenHash, tokenHash));
    }

    // v2.7.48-univlog — explicit logout row. The mutation hook would
    // already log this as 'create' on /logout — overriding to 'logout'
    // makes the activity timeline read naturally.
    request.audit?.({
      orgId: jwtPayload.orgId ?? null,
      actorId: jwtPayload.sub ?? null,
      actorName: jwtPayload.name ?? null,
      actorType: 'employee',
      action: 'logout',
      entityType: 'employee',
      entityId: jwtPayload.sub ?? null,
      entityName: jwtPayload.name ?? null,
      statusCode: 204,
    });

    return reply.status(204).send();
  });

  // GET /api/v1/auth/verify-email?token=xxx&emp=uuid
  app.get('/verify-email', { config: { skipAuth: true } }, async (request, reply) => {
    const { token, emp } = request.query as { token?: string; emp?: string };

    if (!token || !emp) {
      return reply.status(400).send({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'Invalid or expired verification token.' });
    }

    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.id, emp),
    });

    if (!employee) {
      return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404, detail: 'Account not found.' });
    }

    if (employee.emailVerified) {
      return reply.send({ ok: true, alreadyVerified: true });
    }

    if (
      employee.emailVerificationToken !== token ||
      !employee.emailVerificationExpiresAt ||
      employee.emailVerificationExpiresAt < new Date()
    ) {
      return reply.status(400).send({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'Invalid or expired verification token.' });
    }

    await db
      .update(schema.employees)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      })
      .where(eq(schema.employees.id, emp));

    return reply.send({ ok: true, alreadyVerified: false });
  });

  // GET /api/v1/auth/me
  app.get('/me', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { sub: employeeId, orgId } = request.user as { sub: string; orgId: string };

    const employee = await db.query.employees.findFirst({
      where: and(
        eq(schema.employees.id, employeeId),
        eq(schema.employees.orgId, orgId),
      ),
      with: { role: true },
      columns: {
        passwordHash: false,
        pin: false,
        mfaSecret: false,
      },
    });

    if (!employee) return reply.status(404).send({ title: 'Not Found', status: 404 });

    return reply.status(200).send({ data: employee });
  });

  // POST /api/v1/auth/forgot-password
  app.post('/forgot-password', { config: { skipAuth: true } }, async (request, reply) => {
    const body = z.object({ email: z.string().email() }).safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422 });
    }

    const { email } = body.data;

    // Always return 200 to prevent email enumeration
    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.email, email.toLowerCase()),
    });

    if (employee && employee.isActive) {
      const rawToken   = crypto.randomBytes(32).toString('hex');
      const tokenHash  = hashToken(rawToken);
      const expiresAt  = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db
        .update(schema.employees)
        .set({ passwordResetToken: tokenHash, passwordResetExpiresAt: expiresAt })
        .where(eq(schema.employees.id, employee.id));

      const resetUrl  = `${APP_URL}/reset-password?token=${rawToken}`;
      const firstName = employee.firstName;

      // Sign a short-lived internal JWT so the notifications service accepts the call
      const internalToken = app.jwt.sign(
        { sub: employee.id, orgId: employee.orgId, role: 'system' },
        { expiresIn: '5m' },
      );

      // Fire-and-forget email — non-fatal if it fails
      fetch(`${NOTIFICATIONS_API_URL}/api/v1/notifications/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalToken}` },
        body: JSON.stringify({
          to: employee.email,
          subject: 'Reset your ElevatedPOS password',
          template: 'custom',
          orgId: employee.orgId,
          data: {
            body: `<p>Hi ${firstName},</p>
<p>We received a request to reset the password for your ElevatedPOS account.</p>
<p><a href="${resetUrl}" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;">Reset My Password</a></p>
<p>Or copy this link: ${resetUrl}</p>
<p>This link expires in <strong>1 hour</strong>. If you didn&apos;t request a password reset, you can safely ignore this email.</p>`,
          },
        }),
      }).catch((err) => console.error('[auth/forgot-password] notification failed:', err));
    }

    // Audit: password reset requested (only log when employee was found to avoid enumeration concern in logs)
    if (employee && employee.isActive) {
      void logAudit({
        orgId: employee.orgId,
        action: 'password_reset_requested',
        resourceType: 'employee',
        resourceId: employee.id,
        actorName: employee.email,
        ipAddress: request.ip,
      });
    }

    return reply.status(200).send({ ok: true });
  });

  // POST /api/v1/auth/reset-password
  app.post('/reset-password', { config: { skipAuth: true } }, async (request, reply) => {
    const body = z.object({
      token:    z.string().min(1),
      password: z.string().min(8),
      // emp is optional — included in reset links for faster lookup but not required
      emp:      z.string().uuid().optional(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { token, password } = body.data;
    const tokenHash = hashToken(token);

    // Find employee by token hash (token is 32 random bytes, safe for table scan)
    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.passwordResetToken, tokenHash),
    });

    if (
      !employee ||
      !employee.passwordResetExpiresAt ||
      employee.passwordResetExpiresAt < new Date()
    ) {
      return reply.status(400).send({
        type: 'https://elevatedpos.com/errors/invalid-token',
        title: 'Invalid or expired reset link',
        status: 400,
      });
    }

    const newHash = await hashPassword(password);

    await db
      .update(schema.employees)
      .set({
        passwordHash:           newHash,
        passwordResetToken:     null,
        passwordResetExpiresAt: null,
        failedLoginAttempts:    0,
        lockedUntil:            null,
      })
      .where(eq(schema.employees.id, employee.id));

    void logAudit({
      orgId: employee.orgId,
      action: 'password_reset_completed',
      resourceType: 'employee',
      resourceId: employee.id,
      actorName: employee.email,
      ipAddress: request.ip,
    });

    return reply.status(200).send({ ok: true });
  });
}
