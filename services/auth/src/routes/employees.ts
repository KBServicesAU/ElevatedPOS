import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
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

const updateEmployeeSchema = createEmployeeSchema.partial().omit({ password: true });

export async function employeeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/employees
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const query = (request.query as { search?: string; locationId?: string });

    let whereClause = eq(schema.employees.orgId, orgId);

    const employees = await db.query.employees.findMany({
      where: whereClause,
      with: { role: true },
      columns: { passwordHash: false, pin: false, mfaSecret: false },
      orderBy: [desc(schema.employees.createdAt)],
    });

    const filtered = query.search
      ? employees.filter(
          (e) =>
            e.firstName.toLowerCase().includes(query.search!.toLowerCase()) ||
            e.lastName.toLowerCase().includes(query.search!.toLowerCase()) ||
            e.email.toLowerCase().includes(query.search!.toLowerCase()),
        )
      : employees;

    return reply.status(200).send({ data: filtered, meta: { totalCount: filtered.length } });
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
      return reply.status(404).send({ type: 'https://nexus.app/errors/not-found', title: 'Not Found', status: 404 });
    }

    return reply.status(200).send({ data: employee });
  });

  // POST /api/v1/employees
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createEmployeeSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
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
    const body = updateEmployeeSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.employees.findFirst({
      where: and(eq(schema.employees.id, id), eq(schema.employees.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    const updatedRows = await db
      .update(schema.employees)
      .set({
        ...(body.data.firstName !== undefined ? { firstName: body.data.firstName } : {}),
        ...(body.data.lastName !== undefined ? { lastName: body.data.lastName } : {}),
        ...(body.data.email !== undefined ? { email: body.data.email.toLowerCase() } : {}),
        ...(body.data.roleId !== undefined ? { roleId: body.data.roleId } : {}),
        ...(body.data.locationIds !== undefined ? { locationIds: body.data.locationIds } : {}),
        ...(body.data.employmentType !== undefined ? { employmentType: body.data.employmentType } : {}),
        ...(body.data.startDate !== undefined ? { startDate: new Date(body.data.startDate) } : {}),
        ...(body.data.pin !== undefined ? { pin: await hashPin(body.data.pin) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.employees.id, id), eq(schema.employees.orgId, orgId)))
      .returning();
    const updated = updatedRows[0]!;

    return reply.status(200).send({ data: { ...updated, passwordHash: undefined, pin: undefined } });
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
