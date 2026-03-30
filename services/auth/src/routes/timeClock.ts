import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { db, schema } from '../db';

const clockInSchema = z.object({
  locationId: z.string().uuid(),
  registerId: z.string().uuid().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().optional(),
});

const clockOutSchema = z.object({
  locationId: z.string().uuid(),
  registerId: z.string().uuid().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().optional(),
});

const breakSchema = z.object({
  locationId: z.string().uuid(),
  notes: z.string().optional(),
});

const editShiftSchema = z.object({
  clockInAt: z.string().datetime().optional(),
  clockOutAt: z.string().datetime().optional(),
  breakMinutes: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  editReason: z.string().min(1),
});

const shiftQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  status: z.enum(['open', 'closed', 'approved']).optional(),
});

export async function timeClockRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /api/v1/time-clock/clock-in
  app.post('/clock-in', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = clockInSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    // Check for already-open shift
    const existingShift = await db.query.shifts.findFirst({
      where: and(
        eq(schema.shifts.orgId, orgId),
        eq(schema.shifts.employeeId, employeeId),
        eq(schema.shifts.status, 'open'),
      ),
    });

    if (existingShift) {
      return reply.status(409).send({
        type: 'https://nexus.app/errors/conflict',
        title: 'Employee already has an open shift',
        status: 409,
      });
    }

    const now = new Date();

    const [clockEvent] = await db
      .insert(schema.clockEvents)
      .values({
        orgId,
        employeeId,
        locationId: body.data.locationId,
        registerId: body.data.registerId,
        type: 'clock_in',
        timestamp: now,
        latitude: body.data.latitude?.toString(),
        longitude: body.data.longitude?.toString(),
        notes: body.data.notes,
      })
      .returning();

    const [shift] = await db
      .insert(schema.shifts)
      .values({
        orgId,
        employeeId,
        locationId: body.data.locationId,
        clockInAt: now,
        status: 'open',
      })
      .returning();

    return reply.status(201).send({ data: { clockEvent, shift } });
  });

  // POST /api/v1/time-clock/clock-out
  app.post('/clock-out', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = clockOutSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const openShift = await db.query.shifts.findFirst({
      where: and(
        eq(schema.shifts.orgId, orgId),
        eq(schema.shifts.employeeId, employeeId),
        eq(schema.shifts.status, 'open'),
      ),
    });

    if (!openShift) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'No open shift found',
        status: 404,
      });
    }

    const now = new Date();

    const [clockEvent] = await db
      .insert(schema.clockEvents)
      .values({
        orgId,
        employeeId,
        locationId: body.data.locationId,
        registerId: body.data.registerId,
        type: 'clock_out',
        timestamp: now,
        latitude: body.data.latitude?.toString(),
        longitude: body.data.longitude?.toString(),
        notes: body.data.notes,
      })
      .returning();

    const totalMinutes = Math.floor((now.getTime() - openShift.clockInAt.getTime()) / 60000) - openShift.breakMinutes;

    const [shift] = await db
      .update(schema.shifts)
      .set({
        clockOutAt: now,
        totalMinutes,
        status: 'closed',
        updatedAt: now,
      })
      .where(and(eq(schema.shifts.id, openShift.id), eq(schema.shifts.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: { clockEvent, shift } });
  });

  // POST /api/v1/time-clock/break/start
  app.post('/break/start', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = breakSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const openShift = await db.query.shifts.findFirst({
      where: and(
        eq(schema.shifts.orgId, orgId),
        eq(schema.shifts.employeeId, employeeId),
        eq(schema.shifts.status, 'open'),
      ),
    });

    if (!openShift) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'No open shift found',
        status: 404,
      });
    }

    const [clockEvent] = await db
      .insert(schema.clockEvents)
      .values({
        orgId,
        employeeId,
        locationId: body.data.locationId,
        type: 'break_start',
        timestamp: new Date(),
        notes: body.data.notes,
      })
      .returning();

    return reply.status(201).send({ data: { clockEvent } });
  });

  // POST /api/v1/time-clock/break/end
  app.post('/break/end', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = breakSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    // Find the last break_start event to compute break duration
    const lastBreakStart = await db.query.clockEvents.findFirst({
      where: and(
        eq(schema.clockEvents.orgId, orgId),
        eq(schema.clockEvents.employeeId, employeeId),
        eq(schema.clockEvents.type, 'break_start'),
      ),
      orderBy: [desc(schema.clockEvents.timestamp)],
    });

    const openShift = await db.query.shifts.findFirst({
      where: and(
        eq(schema.shifts.orgId, orgId),
        eq(schema.shifts.employeeId, employeeId),
        eq(schema.shifts.status, 'open'),
      ),
    });

    if (!openShift) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'No open shift found',
        status: 404,
      });
    }

    const now = new Date();

    const [clockEvent] = await db
      .insert(schema.clockEvents)
      .values({
        orgId,
        employeeId,
        locationId: body.data.locationId,
        type: 'break_end',
        timestamp: now,
        notes: body.data.notes,
      })
      .returning();

    // Accrue break minutes into shift
    if (lastBreakStart) {
      const breakDurationMinutes = Math.floor((now.getTime() - lastBreakStart.timestamp.getTime()) / 60000);
      await db
        .update(schema.shifts)
        .set({
          breakMinutes: openShift.breakMinutes + breakDurationMinutes,
          updatedAt: now,
        })
        .where(and(eq(schema.shifts.id, openShift.id), eq(schema.shifts.orgId, orgId)));
    }

    return reply.status(200).send({ data: { clockEvent } });
  });

  // GET /api/v1/time-clock/shifts
  app.get('/shifts', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const queryResult = shiftQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: queryResult.error.message,
      });
    }

    const q = queryResult.data;
    const conditions = [eq(schema.shifts.orgId, orgId)];

    if (q.employeeId) conditions.push(eq(schema.shifts.employeeId, q.employeeId));
    if (q.locationId) conditions.push(eq(schema.shifts.locationId, q.locationId));
    if (q.status) conditions.push(eq(schema.shifts.status, q.status));
    if (q.dateFrom) conditions.push(gte(schema.shifts.clockInAt, new Date(q.dateFrom)));
    if (q.dateTo) conditions.push(lte(schema.shifts.clockInAt, new Date(q.dateTo)));

    const shifts = await db.query.shifts.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.shifts.clockInAt)],
    });

    return reply.status(200).send({ data: shifts, meta: { totalCount: shifts.length } });
  });

  // GET /api/v1/time-clock/shifts/current
  app.get('/shifts/current', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };

    const shift = await db.query.shifts.findFirst({
      where: and(
        eq(schema.shifts.orgId, orgId),
        eq(schema.shifts.employeeId, employeeId),
        eq(schema.shifts.status, 'open'),
      ),
    });

    if (!shift) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'No open shift',
        status: 404,
      });
    }

    return reply.status(200).send({ data: shift });
  });

  // PATCH /api/v1/time-clock/shifts/:id — manager edit
  app.patch('/shifts/:id', async (request, reply) => {
    const { orgId, sub: editorId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };
    const body = editShiftSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.shifts.findFirst({
      where: and(eq(schema.shifts.id, id), eq(schema.shifts.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    const { editReason, clockInAt, clockOutAt, breakMinutes, notes } = body.data;
    const now = new Date();

    // Recompute totalMinutes if times changed
    const resolvedClockIn = clockInAt ? new Date(clockInAt) : existing.clockInAt;
    const resolvedClockOut = clockOutAt ? new Date(clockOutAt) : existing.clockOutAt;
    const resolvedBreak = breakMinutes ?? existing.breakMinutes;
    const totalMinutes = resolvedClockOut
      ? Math.floor((resolvedClockOut.getTime() - resolvedClockIn.getTime()) / 60000) - resolvedBreak
      : existing.totalMinutes;

    const [updated] = await db
      .update(schema.shifts)
      .set({
        ...(clockInAt && { clockInAt: resolvedClockIn }),
        ...(clockOutAt && { clockOutAt: resolvedClockOut }),
        ...(breakMinutes !== undefined && { breakMinutes: resolvedBreak }),
        ...(notes !== undefined && { notes }),
        totalMinutes,
        updatedAt: now,
      })
      .where(and(eq(schema.shifts.id, id), eq(schema.shifts.orgId, orgId)))
      .returning();

    // Log edit event on the shift's employee clock events
    await db.insert(schema.clockEvents).values({
      orgId,
      employeeId: existing.employeeId,
      locationId: existing.locationId,
      type: 'clock_in', // placeholder type; real edit audit could use a separate table
      timestamp: now,
      isManual: true,
      editedBy: editorId,
      editedAt: now,
      editReason,
      notes: `Manager edit: ${editReason}`,
    });

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/time-clock/shifts/:id/approve
  app.post('/shifts/:id/approve', async (request, reply) => {
    const { orgId, sub: approverId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.shifts.findFirst({
      where: and(eq(schema.shifts.id, id), eq(schema.shifts.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    if (existing.status === 'open') {
      return reply.status(409).send({
        type: 'https://nexus.app/errors/conflict',
        title: 'Cannot approve an open shift',
        status: 409,
      });
    }

    const now = new Date();

    const [updated] = await db
      .update(schema.shifts)
      .set({ status: 'approved', approvedBy: approverId, approvedAt: now, updatedAt: now })
      .where(and(eq(schema.shifts.id, id), eq(schema.shifts.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // GET /api/v1/time-clock/timesheets/export — CSV export
  app.get('/timesheets/export', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const queryResult = shiftQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: queryResult.error.message,
      });
    }

    const q = queryResult.data;
    const conditions = [eq(schema.shifts.orgId, orgId)];

    if (q.employeeId) conditions.push(eq(schema.shifts.employeeId, q.employeeId));
    if (q.locationId) conditions.push(eq(schema.shifts.locationId, q.locationId));
    if (q.status) conditions.push(eq(schema.shifts.status, q.status));
    if (q.dateFrom) conditions.push(gte(schema.shifts.clockInAt, new Date(q.dateFrom)));
    if (q.dateTo) conditions.push(lte(schema.shifts.clockInAt, new Date(q.dateTo)));

    const shifts = await db.query.shifts.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.shifts.clockInAt)],
    });

    const header = 'shift_id,employee_id,location_id,clock_in_at,clock_out_at,break_minutes,total_minutes,status\n';
    const rows = shifts
      .map((s) =>
        [
          s.id,
          s.employeeId,
          s.locationId,
          s.clockInAt.toISOString(),
          s.clockOutAt?.toISOString() ?? '',
          s.breakMinutes,
          s.totalMinutes ?? '',
          s.status,
        ].join(','),
      )
      .join('\n');

    const csv = header + rows;

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="timesheet.csv"');
    return reply.status(200).send(csv);
  });
}
