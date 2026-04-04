import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, ilike, and, count, or, SQL, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';
import { verifyPassword, hashPassword } from '../lib/tokens';

// ── Schemas ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const patchOrgSchema = z.object({
  plan: z.string().optional(),
  planStatus: z.enum(['active', 'suspended', 'cancelled']).optional(),
  maxLocations: z.number().int().min(1).optional(),
  maxDevices: z.number().int().min(1).optional(),
  onboardingStep: z.string().optional(),
});

const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['superadmin', 'support', 'reseller']),
  resellerOrgId: z.string().uuid().optional(),
});

// ── Platform JWT payload type ─────────────────────────────────────────────────

interface PlatformPayload {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'superadmin' | 'support' | 'reseller';
  resellerOrgId: string | null;
  type: 'platform';
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function authenticatePlatform(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as Partial<PlatformPayload>;
    if (payload.type !== 'platform') {
      return reply.status(401).send({ title: 'Unauthorized', status: 401, detail: 'Not a platform token.' });
    }
  } catch {
    return reply.status(401).send({ title: 'Unauthorized', status: 401 });
  }
}

async function requireSuperadmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticatePlatform(request, reply);
  if (reply.sent) return;
  const payload = request.user as PlatformPayload;
  if (payload.role !== 'superadmin') {
    return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'Superadmin required.' });
  }
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function platformRoutes(app: FastifyInstance) {
  // POST /api/v1/platform/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { email, password } = body.data;

    const staff = await db.query.platformStaff.findFirst({
      where: eq(schema.platformStaff.email, email.toLowerCase()),
    });

    if (!staff) {
      return reply.status(401).send({ title: 'Invalid Credentials', status: 401 });
    }

    if (!staff.isActive) {
      return reply.status(403).send({ title: 'Account Inactive', status: 403, detail: 'This account has been deactivated.' });
    }

    const valid = await verifyPassword(password, staff.passwordHash);
    if (!valid) {
      return reply.status(401).send({ title: 'Invalid Credentials', status: 401 });
    }

    // Update lastLoginAt
    await db
      .update(schema.platformStaff)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.platformStaff.id, staff.id));

    const token = app.jwt.sign(
      {
        sub: staff.id,
        email: staff.email,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
        resellerOrgId: staff.resellerOrgId ?? null,
        type: 'platform',
      } satisfies PlatformPayload,
      { expiresIn: '8h' },
    );

    const userPayload = { id: staff.id, email: staff.email, name: `${staff.firstName} ${staff.lastName}`, firstName: staff.firstName, lastName: staff.lastName, role: staff.role };
    // Return both `token` (godmode) and `accessToken` + `user` (org/reseller portals)
    return reply.status(200).send({ token, accessToken: token, staff: userPayload, user: userPayload });
  });

  // GET /api/v1/platform/organisations
  app.get('/organisations', { onRequest: [authenticatePlatform] }, async (request, reply) => {
    const q = request.query as {
      search?: string;
      plan?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);

    const conditions: SQL[] = [];

    if (q.search) {
      conditions.push(
        or(
          ilike(schema.organisations.name, `%${q.search}%`),
          ilike(schema.organisations.slug, `%${q.search}%`),
        ) as SQL,
      );
    }

    if (q.plan) {
      conditions.push(eq(schema.organisations.plan, q.plan));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: schema.organisations.id,
          name: schema.organisations.name,
          slug: schema.organisations.slug,
          plan: schema.organisations.plan,
          maxLocations: schema.organisations.maxLocations,
          maxDevices: schema.organisations.maxDevices,
          onboardingStep: schema.organisations.onboardingStep,
          createdAt: schema.organisations.createdAt,
        })
        .from(schema.organisations)
        .where(where)
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(schema.organisations).where(where),
    ]);

    // Alias fields to match the portal UI expectations
    const mapped = rows.map((r) => ({
      ...r,
      businessName: r.name,
      deviceLimit: r.maxDevices,
    }));

    return reply.send({ data: mapped, total: totalRows[0]?.value ?? 0, limit, offset });
  });

  // GET /api/v1/platform/organisations/:id
  app.get('/organisations/:id', { onRequest: [authenticatePlatform] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, id),
    });

    if (!org) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const [employeeCount, deviceCount] = await Promise.all([
      db
        .select({ value: count() })
        .from(schema.employees)
        .where(and(eq(schema.employees.orgId, id), eq(schema.employees.isActive, true))),
      db
        .select({ value: count() })
        .from(schema.devices)
        .where(and(eq(schema.devices.orgId, id), eq(schema.devices.status, 'active'))),
    ]);

    return reply.send({
      data: {
        ...org,
        // Alias fields to match the portal UI expectations
        businessName: org.name,
        deviceLimit: org.maxDevices,
        _counts: {
          activeEmployees: employeeCount[0]?.value ?? 0,
          activeDevices: deviceCount[0]?.value ?? 0,
        },
      },
    });
  });

  // PATCH /api/v1/platform/organisations/:id
  app.patch('/organisations/:id', { onRequest: [requireSuperadmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const body = patchOrgSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const updates: Partial<typeof schema.organisations.$inferInsert> = {};
    if (body.data.plan !== undefined) updates.plan = body.data.plan;
    if (body.data.planStatus !== undefined) updates.planStatus = body.data.planStatus;
    if (body.data.maxLocations !== undefined) updates.maxLocations = body.data.maxLocations;
    if (body.data.maxDevices !== undefined) updates.maxDevices = body.data.maxDevices;
    if (body.data.onboardingStep !== undefined) updates.onboardingStep = body.data.onboardingStep;

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ title: 'No fields to update', status: 400 });
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(schema.organisations)
      .set(updates)
      .where(eq(schema.organisations.id, id))
      .returning();

    if (!updated) return reply.status(404).send({ title: 'Not Found', status: 404 });

    return reply.send({ data: updated });
  });

  // GET /api/v1/platform/staff
  app.get('/staff', { onRequest: [requireSuperadmin] }, async (_request, reply) => {
    const staffList = await db
      .select({
        id: schema.platformStaff.id,
        email: schema.platformStaff.email,
        firstName: schema.platformStaff.firstName,
        lastName: schema.platformStaff.lastName,
        role: schema.platformStaff.role,
        resellerOrgId: schema.platformStaff.resellerOrgId,
        isActive: schema.platformStaff.isActive,
        createdAt: schema.platformStaff.createdAt,
        lastLoginAt: schema.platformStaff.lastLoginAt,
      })
      .from(schema.platformStaff)
      .orderBy(schema.platformStaff.createdAt);

    return reply.send({ data: staffList });
  });

  // POST /api/v1/platform/staff
  app.post('/staff', { onRequest: [requireSuperadmin] }, async (request, reply) => {
    const body = createStaffSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { email, password, firstName, lastName, role, resellerOrgId } = body.data;

    const existing = await db.query.platformStaff.findFirst({
      where: eq(schema.platformStaff.email, email.toLowerCase()),
    });
    if (existing) {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: 'Email already in use.' });
    }

    const passwordHash = await hashPassword(password);

    const [created] = await db
      .insert(schema.platformStaff)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role,
        resellerOrgId: resellerOrgId ?? null,
      })
      .returning({
        id: schema.platformStaff.id,
        email: schema.platformStaff.email,
        firstName: schema.platformStaff.firstName,
        lastName: schema.platformStaff.lastName,
        role: schema.platformStaff.role,
        isActive: schema.platformStaff.isActive,
        createdAt: schema.platformStaff.createdAt,
      });

    return reply.status(201).send({ data: created });
  });

  // POST /api/v1/platform/organisations/:id/impersonate
  // Superadmin/support only — generates a short-lived access token for the org's
  // owner employee so platform staff can log in as that merchant to assist them.
  app.post('/organisations/:id/impersonate', { onRequest: [authenticatePlatform] }, async (request, reply) => {
    const { id: orgId } = request.params as { id: string };
    const platformUser = request.user as PlatformPayload;

    // Find the org
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, orgId),
    });
    if (!org) return reply.status(404).send({ title: 'Not Found', status: 404 });

    // Find the first active employee (owner) of the org
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(schema.employees.orgId, orgId),
        eq(schema.employees.isActive, true),
      ),
      with: { role: true },
      orderBy: asc(schema.employees.createdAt),
    });
    if (!employee) return reply.status(404).send({ title: 'No active employees found', status: 404 });

    // Issue a short-lived (30 min) impersonation token
    const impersonationToken = app.jwt.sign(
      {
        sub: employee.id,
        orgId: employee.orgId,
        roleId: employee.roleId,
        permissions: (employee.role?.permissions ?? {}) as Record<string, boolean>,
        locationIds: (employee.locationIds ?? []) as string[],
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        impersonatedBy: platformUser.email,
      },
      { expiresIn: '30m' },
    );

    // Audit log
    app.log.info({
      event: 'impersonation',
      platformUser: platformUser.email,
      orgId,
      orgName: org.name,
      employeeId: employee.id,
      employeeEmail: employee.email,
    });

    return reply.send({
      accessToken: impersonationToken,
      expiresIn: 1800,
      employee: {
        id: employee.id,
        orgId: employee.orgId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
      },
      org: { id: org.id, name: org.name },
      loginUrl: `${process.env['APP_URL'] ?? 'https://app.elevatedpos.com.au'}/dashboard?impersonation=1`,
    });
  });

  // DELETE /api/v1/platform/staff/:id (soft-delete)
  app.delete('/staff/:id', { onRequest: [requireSuperadmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [updated] = await db
      .update(schema.platformStaff)
      .set({ isActive: false })
      .where(eq(schema.platformStaff.id, id))
      .returning({ id: schema.platformStaff.id, isActive: schema.platformStaff.isActive });

    if (!updated) return reply.status(404).send({ title: 'Not Found', status: 404 });

    return reply.send({ data: updated });
  });

  // PATCH /api/v1/platform/staff/:id — update platform staff details (superadmin only)
  app.patch('/staff/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { role?: string };
    if (user.role !== 'superadmin') {
      return reply.status(403).send({ title: 'Forbidden', status: 403 });
    }

    const { id } = request.params as { id: string };
    const body = z.object({
      firstName: z.string().min(1).optional(),
      lastName:  z.string().min(1).optional(),
      email:     z.string().email().optional(),
      role:      z.enum(['superadmin', 'support', 'reseller']).optional(),
      isActive:  z.boolean().optional(),
      password:  z.string().min(8).optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });

    const existing = await db.query.platformStaff.findFirst({ where: eq(schema.platformStaff.id, id) });
    if (!existing) return reply.status(404).send({ title: 'Staff not found', status: 404 });

    let passwordHash: string | undefined;
    if (body.data.password) {
      passwordHash = await hashPassword(body.data.password);
    }

    const patch = Object.fromEntries(
      Object.entries({
        firstName:    body.data.firstName,
        lastName:     body.data.lastName,
        email:        body.data.email,
        role:         body.data.role,
        isActive:     body.data.isActive,
        ...(passwordHash ? { passwordHash } : {}),
      }).filter(([, v]) => v !== undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as Record<string, any>;

    const [updated] = await db.update(schema.platformStaff)
      .set(patch)
      .where(eq(schema.platformStaff.id, id))
      .returning({ id: schema.platformStaff.id, email: schema.platformStaff.email, firstName: schema.platformStaff.firstName, lastName: schema.platformStaff.lastName, role: schema.platformStaff.role, isActive: schema.platformStaff.isActive });

    return reply.send({ data: updated });
  });

  // GET /api/v1/platform/organisations/:id/employees — list employees for an org
  app.get('/organisations/:id/employees', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id: orgId } = request.params as { id: string };
    const q = request.query as { search?: string; isActive?: string };

    const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, orgId) });
    if (!org) return reply.status(404).send({ title: 'Organisation not found', status: 404 });

    const employees = await db.query.employees.findMany({
      where: and(
        eq(schema.employees.orgId, orgId),
        ...(q.isActive !== undefined ? [eq(schema.employees.isActive, q.isActive === 'true')] : []),
      ),
      with: { role: true },
      columns: { passwordHash: false, pin: false, mfaSecret: false, passwordResetToken: false, emailVerificationToken: false },
      orderBy: (e, { asc }) => [asc(e.firstName), asc(e.lastName)],
    });

    return reply.send({ data: employees });
  });

  // PATCH /api/v1/platform/organisations/:id/employees/:empId — update org employee from platform
  app.patch('/organisations/:id/employees/:empId', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id: orgId, empId } = request.params as { id: string; empId: string };

    const body = z.object({
      firstName:           z.string().min(1).optional(),
      lastName:            z.string().min(1).optional(),
      email:               z.string().email().optional(),
      isActive:            z.boolean().optional(),
      lockedUntil:         z.string().datetime().nullable().optional(),
      failedLoginAttempts: z.number().int().min(0).optional(),
      password:            z.string().min(8).optional(),
      roleId:              z.string().uuid().optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });

    const employee = await db.query.employees.findFirst({
      where: and(eq(schema.employees.id, empId), eq(schema.employees.orgId, orgId)),
    });
    if (!employee) return reply.status(404).send({ title: 'Employee not found', status: 404 });

    let passwordHash: string | undefined;
    if (body.data.password) {
      passwordHash = await hashPassword(body.data.password);
    }

    const patch = Object.fromEntries(
      Object.entries({
        firstName:           body.data.firstName,
        lastName:            body.data.lastName,
        email:               body.data.email,
        isActive:            body.data.isActive,
        lockedUntil:         body.data.lockedUntil !== undefined ? (body.data.lockedUntil ? new Date(body.data.lockedUntil) : null) : undefined,
        failedLoginAttempts: body.data.failedLoginAttempts,
        roleId:              body.data.roleId,
        ...(passwordHash ? { passwordHash } : {}),
        updatedAt:           new Date(),
      }).filter(([, v]) => v !== undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as Record<string, any>;

    const [updated] = await db.update(schema.employees)
      .set(patch)
      .where(and(eq(schema.employees.id, empId), eq(schema.employees.orgId, orgId)))
      .returning({ id: schema.employees.id, orgId: schema.employees.orgId, firstName: schema.employees.firstName, lastName: schema.employees.lastName, email: schema.employees.email, isActive: schema.employees.isActive, lockedUntil: schema.employees.lockedUntil, failedLoginAttempts: schema.employees.failedLoginAttempts, roleId: schema.employees.roleId, updatedAt: schema.employees.updatedAt });

    return reply.send({ data: updated });
  });

  // POST /api/v1/platform/organisations/:id/employees — create employee in org from platform
  app.post('/organisations/:id/employees', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { role?: string };
    if (user.role !== 'superadmin') {
      return reply.status(403).send({ title: 'Forbidden — superadmin only', status: 403 });
    }

    const { id: orgId } = request.params as { id: string };

    const body = z.object({
      firstName:      z.string().min(1),
      lastName:       z.string().min(1),
      email:          z.string().email(),
      password:       z.string().min(8),
      roleId:         z.string().uuid().optional(),
      employmentType: z.enum(['full_time', 'part_time', 'casual', 'contractor']).default('full_time'),
      locationIds:    z.array(z.string().uuid()).default([]),
      pin:            z.string().min(4).max(8).optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });

    const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, orgId) });
    if (!org) return reply.status(404).send({ title: 'Organisation not found', status: 404 });

    const existing = await db.query.employees.findFirst({
      where: and(eq(schema.employees.email, body.data.email.toLowerCase()), eq(schema.employees.orgId, orgId)),
    });
    if (existing) return reply.status(409).send({ title: 'Email already in use', status: 409 });

    const passwordHash = await hashPassword(body.data.password);
    let pinHash: string | undefined;
    if (body.data.pin) {
      const bcrypt = await import('bcryptjs');
      pinHash = await bcrypt.hash(body.data.pin, 10);
    }

    const [employee] = await db.insert(schema.employees).values({
      orgId,
      firstName:      body.data.firstName,
      lastName:       body.data.lastName,
      email:          body.data.email.toLowerCase(),
      passwordHash,
      pin:            pinHash ?? null,
      roleId:         body.data.roleId ?? null,
      locationIds:    body.data.locationIds,
      employmentType: body.data.employmentType,
      isActive:       true,
    }).returning({ id: schema.employees.id, orgId: schema.employees.orgId, firstName: schema.employees.firstName, lastName: schema.employees.lastName, email: schema.employees.email, isActive: schema.employees.isActive, roleId: schema.employees.roleId, createdAt: schema.employees.createdAt });

    return reply.status(201).send({ data: employee });
  });
}
