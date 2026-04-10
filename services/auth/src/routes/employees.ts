import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, or, ilike } from 'drizzle-orm';
import { db, schema } from '../db';
import { hashPassword, hashPin } from '../lib/tokens';

const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  pin: z.string().min(4).max(8).optional(),
  roleId: z.string().uuid(),
  locationIds: z.array(z.string().uuid()).default([]),
  employmentType: z.enum(['full_time', 'part_time', 'casual']).default('full_time'),
  startDate: z.string().datetime().optional(),
});

const updateEmployeeSchema = z.object({
  firstName:            z.string().min(1).max(100).optional(),
  lastName:             z.string().min(1).max(100).optional(),
  email:                z.string().email().optional(),
  pin:                  z.string().min(4).max(8).optional(),
  roleId:               z.string().uuid().optional(),
  locationIds:          z.array(z.string().uuid()).optional(),
  employmentType:       z.enum(['full_time', 'part_time', 'casual']).optional(),
  startDate:            z.string().datetime().optional(),
  isActive:             z.boolean().optional(),
  lockedUntil:          z.string().datetime().nullable().optional(),
  failedLoginAttempts:  z.number().int().min(0).optional(),
  password:             z.string().min(8).optional(),
});

export async function employeeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/employees
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const querySchema = z.object({
      search: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const parsed = querySchema.safeParse(request.query);
    const { search, limit, offset } = parsed.success ? parsed.data : { search: undefined, limit: 50, offset: 0 };

    const employees = await db.query.employees.findMany({
      where: and(
        eq(schema.employees.orgId, orgId),
        search
          ? or(
              ilike(schema.employees.firstName, `%${search}%`),
              ilike(schema.employees.lastName, `%${search}%`),
              ilike(schema.employees.email, `%${search}%`),
            )
          : undefined,
      ),
      with: { role: true },
      columns: { passwordHash: false, pin: false, mfaSecret: false },
      limit,
      offset,
      orderBy: [asc(schema.employees.firstName), asc(schema.employees.lastName)],
    });

    return reply.status(200).send({ data: employees, meta: { totalCount: employees.length } });
  });

  // GET /api/v1/employees/:id
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const employee = await db.query.employees.findFirst({
      where: and(eq(schema.employees.id, id), eq(schema.employees.orgId, orgId)),
      with: { role: true },
      columns: { passwordHash: false, pin: false, mfaSecret: false },
    });

    if (!employee) {
      return reply.status(404).send({ type: 'https://elevatedpos.com/errors/not-found', title: 'Not Found', status: 404 });
    }

    return reply.status(200).send({ data: employee });
  });

  // POST /api/v1/employees
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createEmployeeSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { password, pin, ...rest } = body.data;

    const createdRows = await db
      .insert(schema.employees)
      .values({
        orgId,
        firstName: rest.firstName,
        lastName: rest.lastName,
        email: rest.email.toLowerCase(),
        roleId: rest.roleId ?? null,
        locationIds: rest.locationIds,
        employmentType: rest.employmentType,
        startDate: rest.startDate ? new Date(rest.startDate) : null,
        passwordHash: password ? await hashPassword(password) : null,
        pin: pin ? await hashPin(pin) : null,
      })
      .returning();
    const created = createdRows[0]!;

    return reply.status(201).send({ data: { ...created, passwordHash: undefined, pin: undefined } });
  });

  // PATCH /api/v1/employees/:id
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = updateEmployeeSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const existing = await db.query.employees.findFirst({
      where: and(eq(schema.employees.id, id), eq(schema.employees.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    let newPasswordHash: string | undefined;
    if (parsed.data.password) {
      newPasswordHash = await hashPassword(parsed.data.password);
    }

    const updatedRows = await db
      .update(schema.employees)
      .set({
        ...(parsed.data.firstName !== undefined ? { firstName: parsed.data.firstName } : {}),
        ...(parsed.data.lastName !== undefined ? { lastName: parsed.data.lastName } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email.toLowerCase() } : {}),
        ...(parsed.data.roleId !== undefined ? { roleId: parsed.data.roleId } : {}),
        ...(parsed.data.locationIds !== undefined ? { locationIds: parsed.data.locationIds } : {}),
        ...(parsed.data.employmentType !== undefined ? { employmentType: parsed.data.employmentType } : {}),
        ...(parsed.data.startDate !== undefined ? { startDate: new Date(parsed.data.startDate) } : {}),
        ...(parsed.data.pin !== undefined ? { pin: await hashPin(parsed.data.pin) } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        ...(parsed.data.lockedUntil !== undefined ? { lockedUntil: parsed.data.lockedUntil ? new Date(parsed.data.lockedUntil) : null } : {}),
        ...(parsed.data.failedLoginAttempts !== undefined ? { failedLoginAttempts: parsed.data.failedLoginAttempts } : {}),
        ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.employees.id, id), eq(schema.employees.orgId, orgId)))
      .returning();
    const updated = updatedRows[0]!;

    return reply.status(200).send({ data: { ...updated, passwordHash: undefined, pin: undefined } });
  });

  // POST /api/v1/employees/:id/unlock — clear lock and reset failed attempts
  app.post('/:id/unlock', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const employee = await db.query.employees.findFirst({
      where: and(eq(schema.employees.id, id), eq(schema.employees.orgId, user.orgId)),
    });
    if (!employee) return reply.status(404).send({ title: 'Employee not found', status: 404 });

    const [updated] = await db.update(schema.employees)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(and(eq(schema.employees.id, id), eq(schema.employees.orgId, user.orgId)))
      .returning();

    return reply.code(200).send({ data: updated });
  });

  // DELETE /api/v1/employees/:id (soft delete)
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    await db
      .update(schema.employees)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.employees.id, id), eq(schema.employees.orgId, orgId)));

    return reply.status(204).send();
  });
}
