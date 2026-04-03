import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  verifyPassword,
  verifyPin,
  generateRefreshToken,
  hashToken,
  addToBlacklist,
} from '../lib/tokens';

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
  // Org-scan verification (legacy / kiosk flow)
  z.object({
    orgId: z.string().uuid(),
    pin: z.string().min(4).max(8),
    registerId: z.string().uuid(),
  }),
]);

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { email, password, deviceId, deviceName } = body.data;

    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.email, email.toLowerCase()),
      with: { role: true },
    });

    if (!employee || !employee.passwordHash) {
      return reply.status(401).send({
        type: 'https://nexus.app/errors/invalid-credentials',
        title: 'Invalid Credentials',
        status: 401,
        detail: 'Email or password is incorrect.',
      });
    }

    if (!employee.isActive) {
      return reply.status(401).send({
        type: 'https://nexus.app/errors/account-inactive',
        title: 'Account Inactive',
        status: 401,
        detail: 'This account has been deactivated.',
      });
    }

    if (employee.lockedUntil && employee.lockedUntil > new Date()) {
      return reply.status(429).send({
        type: 'https://nexus.app/errors/account-locked',
        title: 'Account Locked',
        status: 429,
        detail: `Account is locked until ${employee.lockedUntil.toISOString()}.`,
      });
    }

    const valid = await verifyPassword(password, employee.passwordHash);
    if (!valid) {
      const attempts = employee.failedLoginAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000) : null;

      await db
        .update(schema.employees)
        .set({
          failedLoginAttempts: attempts,
          ...(lockedUntil ? { lockedUntil } : {}),
        })
        .where(eq(schema.employees.id, employee.id));

      return reply.status(401).send({
        type: 'https://nexus.app/errors/invalid-credentials',
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
        type: 'https://nexus.app/errors/org-suspended',
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
        type: 'https://nexus.app/errors/validation',
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
          type: 'https://nexus.app/errors/invalid-pin',
          title: 'Invalid PIN',
          status: 401,
          detail: 'No employee found with that PIN.',
        });
      }
      return buildSuccess(employee);
    }

    // Org-scan flow: find whichever employee in the org has this PIN
    const employees = await db.query.employees.findMany({
      where: and(
        eq(schema.employees.orgId, body.data.orgId),
        eq(schema.employees.isActive, true),
      ),
      with: { role: true },
    });

    for (const employee of employees) {
      if (!employee.pin) continue;
      const valid = await verifyPin(pin, employee.pin);
      if (valid) return buildSuccess(employee);
    }

    return reply.status(401).send({
      type: 'https://nexus.app/errors/invalid-pin',
      title: 'Invalid PIN',
      status: 401,
      detail: 'No employee found with that PIN.',
    });
  });

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (request, reply) => {
    const body = refreshSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
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
        type: 'https://nexus.app/errors/invalid-refresh-token',
        title: 'Invalid or Expired Refresh Token',
        status: 401,
      });
    }

    const { employee } = stored;
    if (!employee.isActive) {
      return reply.status(401).send({
        type: 'https://nexus.app/errors/account-inactive',
        title: 'Account Inactive',
        status: 401,
      });
    }

    // Rotate: revoke old token, issue new
    await db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.refreshTokens.id, stored.id));

    const newRawRefreshToken = generateRefreshToken();
    const newTokenHash = hashToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.insert(schema.refreshTokens).values({
      employeeId: employee.id,
      tokenHash: newTokenHash,
      deviceId: stored.deviceId,
      deviceName: stored.deviceName,
      ipAddress: request.ip,
      expiresAt,
    });

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
    const jwtPayload = request.user as { jti?: string; exp?: number };
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
    return reply.status(204).send();
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
}
