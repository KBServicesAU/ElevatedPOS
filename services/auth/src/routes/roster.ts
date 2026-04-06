import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db, schema } from '../db';

// ── Validation Schemas ───────────────────────────────────────────────────────

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;

const createShiftSchema = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(dateRegex, 'Expected YYYY-MM-DD'),
  startTime: z.string().regex(timeRegex, 'Expected HH:MM'),
  endTime: z.string().regex(timeRegex, 'Expected HH:MM'),
  role: z.string().max(100).optional(),
  station: z.string().max(100).optional(),
  notes: z.string().optional(),
});

const listQuerySchema = z.object({
  dateFrom: z.string().regex(dateRegex, 'Expected YYYY-MM-DD'),
  dateTo: z.string().regex(dateRegex, 'Expected YYYY-MM-DD'),
  employeeId: z.string().uuid().optional(),
});

const publishSchema = z.object({
  dateFrom: z.string().regex(dateRegex, 'Expected YYYY-MM-DD'),
  dateTo: z.string().regex(dateRegex, 'Expected YYYY-MM-DD'),
});

const copyWeekSchema = z.object({
  sourceFrom: z.string().regex(dateRegex, 'Expected YYYY-MM-DD'),
  sourceTo: z.string().regex(dateRegex, 'Expected YYYY-MM-DD'),
  targetFrom: z.string().regex(dateRegex, 'Expected YYYY-MM-DD'),
  targetTo: z.string().regex(dateRegex, 'Expected YYYY-MM-DD'),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatWeekLabel(dateFrom: string, dateTo: string): string {
  const from = new Date(dateFrom + 'T00:00:00');
  const to = new Date(dateTo + 'T00:00:00');
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fromStr = `${from.getDate()} ${monthsShort[from.getMonth()]}`;
  const toStr = `${to.getDate()} ${monthsShort[to.getMonth()]} ${to.getFullYear()}`;
  return `${fromStr} \u2013 ${toStr}`;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00Z');
  const b = new Date(dateB + 'T00:00:00Z');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function rosterRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /shifts — create a roster entry
  app.post('/shifts', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createShiftSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const createdRows = await db
      .insert(schema.rosterShifts)
      .values({
        orgId,
        employeeId: body.data.employeeId,
        date: body.data.date,
        startTime: body.data.startTime,
        endTime: body.data.endTime,
        role: body.data.role ?? null,
        station: body.data.station ?? null,
        notes: body.data.notes ?? null,
      })
      .returning();
    const created = createdRows[0]!;

    return reply.status(201).send({ data: created });
  });

  // GET /shifts — list roster entries for a date range
  app.get('/shifts', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const query = listQuerySchema.safeParse(request.query);

    if (!query.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: query.error.message,
      });
    }

    const { dateFrom, dateTo, employeeId } = query.data;

    const conditions = [
      eq(schema.rosterShifts.orgId, orgId),
      gte(schema.rosterShifts.date, dateFrom),
      lte(schema.rosterShifts.date, dateTo),
    ];

    if (employeeId) {
      conditions.push(eq(schema.rosterShifts.employeeId, employeeId));
    }

    const rows = await db
      .select({
        id: schema.rosterShifts.id,
        orgId: schema.rosterShifts.orgId,
        employeeId: schema.rosterShifts.employeeId,
        employeeName: sql<string>`${schema.employees.firstName} || ' ' || ${schema.employees.lastName}`,
        date: schema.rosterShifts.date,
        startTime: schema.rosterShifts.startTime,
        endTime: schema.rosterShifts.endTime,
        role: schema.rosterShifts.role,
        station: schema.rosterShifts.station,
        published: schema.rosterShifts.published,
        publishedAt: schema.rosterShifts.publishedAt,
        notes: schema.rosterShifts.notes,
        createdAt: schema.rosterShifts.createdAt,
        updatedAt: schema.rosterShifts.updatedAt,
      })
      .from(schema.rosterShifts)
      .innerJoin(schema.employees, eq(schema.rosterShifts.employeeId, schema.employees.id))
      .where(and(...conditions))
      .orderBy(schema.rosterShifts.date, schema.rosterShifts.startTime);

    return reply.status(200).send({ data: rows, meta: { totalCount: rows.length } });
  });

  // DELETE /shifts/:id — delete a roster entry
  app.delete('/shifts/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const deleted = await db
      .delete(schema.rosterShifts)
      .where(and(eq(schema.rosterShifts.id, id), eq(schema.rosterShifts.orgId, orgId)))
      .returning();

    if (deleted.length === 0) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    return reply.status(200).send({ data: deleted[0] });
  });

  // POST /publish — publish roster for a date range and notify employees
  app.post('/publish', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = publishSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { dateFrom, dateTo } = body.data;
    const now = new Date();

    // Mark all matching shifts as published
    const published = await db
      .update(schema.rosterShifts)
      .set({ published: true, publishedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.rosterShifts.orgId, orgId),
          gte(schema.rosterShifts.date, dateFrom),
          lte(schema.rosterShifts.date, dateTo),
        ),
      )
      .returning();

    // Group shifts by employee so we can send one email per person
    const byEmployee = new Map<string, typeof published>();
    for (const shift of published) {
      const empId = shift.employeeId;
      if (!byEmployee.has(empId)) {
        byEmployee.set(empId, []);
      }
      byEmployee.get(empId)!.push(shift);
    }

    // Fetch employee details for email
    const employeeIds = [...byEmployee.keys()];
    const employeeMap = new Map<string, { firstName: string; lastName: string; email: string }>();

    if (employeeIds.length > 0) {
      const empRows = await db
        .select({
          id: schema.employees.id,
          firstName: schema.employees.firstName,
          lastName: schema.employees.lastName,
          email: schema.employees.email,
        })
        .from(schema.employees)
        .where(
          and(
            eq(schema.employees.orgId, orgId),
            eq(schema.employees.isActive, true),
          ),
        );

      for (const emp of empRows) {
        employeeMap.set(emp.id, { firstName: emp.firstName, lastName: emp.lastName, email: emp.email });
      }
    }

    const weekLabel = formatWeekLabel(dateFrom, dateTo);
    let emailsSent = 0;
    let emailsFailed = 0;

    const notificationsUrl = process.env['NOTIFICATIONS_API_URL'] || 'localhost:4008';

    for (const [empId, empShifts] of byEmployee.entries()) {
      const emp = employeeMap.get(empId);
      if (!emp) continue;

      const shiftsData = empShifts.map((s) => ({
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        role: s.role ?? '',
      }));

      try {
        const res = await fetch(`http://${notificationsUrl}/api/v1/notifications/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emp.email,
            subject: `Your roster for ${weekLabel}`,
            template: 'roster',
            data: {
              employeeName: emp.firstName,
              shifts: shiftsData,
              weekLabel,
            },
          }),
        });
        if (res.ok) {
          emailsSent++;
        } else {
          emailsFailed++;
          app.log.warn({ empId, status: res.status }, 'Roster email send failed');
        }
      } catch (err) {
        emailsFailed++;
        app.log.warn({ empId, err }, 'Roster email send error — notification service may be unavailable');
      }
    }

    return reply.status(200).send({
      published: published.length,
      emailsSent,
      emailsFailed,
    });
  });

  // POST /copy-week — copy shifts from one date range to another
  app.post('/copy-week', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = copyWeekSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { sourceFrom, sourceTo, targetFrom } = body.data;

    // Fetch source shifts
    const sourceShifts = await db
      .select()
      .from(schema.rosterShifts)
      .where(
        and(
          eq(schema.rosterShifts.orgId, orgId),
          gte(schema.rosterShifts.date, sourceFrom),
          lte(schema.rosterShifts.date, sourceTo),
        ),
      );

    if (sourceShifts.length === 0) {
      return reply.status(200).send({ copied: 0 });
    }

    // Calculate offset in days between source and target start
    const offset = daysBetween(sourceFrom, targetFrom);

    const newShifts = sourceShifts.map((s) => ({
      orgId,
      employeeId: s.employeeId,
      date: addDays(s.date, offset),
      startTime: s.startTime,
      endTime: s.endTime,
      role: s.role,
      station: s.station,
      notes: s.notes,
    }));

    const inserted = await db
      .insert(schema.rosterShifts)
      .values(newShifts)
      .returning();

    return reply.status(201).send({ copied: inserted.length });
  });
}
