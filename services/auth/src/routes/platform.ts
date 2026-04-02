import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, ilike, and, count, or, SQL } from 'drizzle-orm';
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

    return reply.status(200).send({ token, staff: { id: staff.id, email: staff.email, firstName: staff.firstName, lastName: staff.lastName, role: staff.role } });
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

    return reply.send({ data: rows, total: totalRows[0]?.value ?? 0, limit, offset });
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
}
