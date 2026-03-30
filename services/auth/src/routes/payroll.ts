import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, gte, lte, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { shifts, employees } from '../db/schema.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const REGULAR_HOURS_PER_WEEK = 38;

// ── Helpers ────────────────────────────────────────────────────────────────────

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Given an array of (workMinutes, weekKey) pairs for a single employee,
 * compute regularMinutes and overtimeMinutes respecting 38h/week threshold.
 */
function computeHoursBreakdown(
  shiftRows: Array<{ totalMinutes: number | null; weekKey: string }>,
): { regularMinutes: number; overtimeMinutes: number } {
  // Group by ISO week
  const byWeek: Record<string, number> = {};
  for (const row of shiftRows) {
    const mins = row.totalMinutes ?? 0;
    byWeek[row.weekKey] = (byWeek[row.weekKey] ?? 0) + mins;
  }

  let regularMinutes = 0;
  let overtimeMinutes = 0;
  const regularThreshold = REGULAR_HOURS_PER_WEEK * 60;

  for (const weekMins of Object.values(byWeek)) {
    if (weekMins <= regularThreshold) {
      regularMinutes += weekMins;
    } else {
      regularMinutes += regularThreshold;
      overtimeMinutes += weekMins - regularThreshold;
    }
  }

  return { regularMinutes, overtimeMinutes };
}

/** Get ISO week key YYYY-Www from a Date */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // 1=Mon, 7=Sun
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// MYOB column header names
const MYOB_HEADERS = [
  'Employee Name',
  'Employee ID',
  'Pay Period',
  'Regular Hours',
  'Overtime Hours',
  'Total Hours',
  'Hourly Rate',
  'Gross Pay',
];

function buildCsvRow(values: (string | number)[], delimiter = ','): string {
  return values
    .map((v) => {
      const str = String(v);
      // Wrap in quotes if the value contains delimiter, quotes, or newlines
      if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(delimiter);
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function payrollRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  /**
   * GET /api/v1/payroll/export
   * Query params:
   *   dateFrom  YYYY-MM-DD (required)
   *   dateTo    YYYY-MM-DD (required)
   *   format    csv | myob | xero (default: json)
   */
  app.get('/export', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const querySchema = z.object({
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      format: z.enum(['json', 'csv', 'myob', 'xero']).default('json'),
    });

    const q = querySchema.safeParse(request.query);
    if (!q.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: q.error.message,
      });
    }

    const { dateFrom, dateTo, format } = q.data;
    const fromDate = new Date(`${dateFrom}T00:00:00Z`);
    const toDate = new Date(`${dateTo}T23:59:59Z`);
    const payPeriod = `${dateFrom} to ${dateTo}`;

    // Fetch all closed/approved shifts in date range for this org
    const shiftRows = await db
      .select({
        shiftId: shifts.id,
        employeeId: shifts.employeeId,
        clockInAt: shifts.clockInAt,
        clockOutAt: shifts.clockOutAt,
        totalMinutes: shifts.totalMinutes,
        breakMinutes: shifts.breakMinutes,
      })
      .from(shifts)
      .where(
        and(
          eq(shifts.orgId, orgId),
          isNotNull(shifts.clockOutAt),
          gte(shifts.clockInAt, fromDate),
          lte(shifts.clockInAt, toDate),
        ),
      );

    // Fetch employee data for this org
    const employeeRows = await db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employmentType: employees.employmentType,
      })
      .from(employees)
      .where(and(eq(employees.orgId, orgId), eq(employees.isActive, true)));

    const employeeMap = new Map(employeeRows.map((e) => [e.id, e]));

    // Group shifts by employee
    type EmpShiftRow = { totalMinutes: number | null; weekKey: string };
    const byEmployee = new Map<string, EmpShiftRow[]>();

    for (const shift of shiftRows) {
      if (!byEmployee.has(shift.employeeId)) {
        byEmployee.set(shift.employeeId, []);
      }
      byEmployee.get(shift.employeeId)!.push({
        totalMinutes: shift.totalMinutes,
        weekKey: isoWeekKey(shift.clockInAt),
      });
    }

    // Build payroll rows
    const rows = employeeRows
      .filter((e) => byEmployee.has(e.id))
      .map((emp) => {
        const { regularMinutes, overtimeMinutes } = computeHoursBreakdown(
          byEmployee.get(emp.id) ?? [],
        );
        const regularHours = minutesToHours(regularMinutes);
        const overtimeHours = minutesToHours(overtimeMinutes);
        const totalHours = minutesToHours(regularMinutes + overtimeMinutes);

        // Hourly rate placeholder — in production this would come from the employee record
        const hourlyRate = 0;
        const grossPay = totalHours * hourlyRate;

        return {
          employeeName: `${emp.firstName} ${emp.lastName}`,
          employeeId: emp.id,
          payPeriod,
          regularHours,
          overtimeHours,
          totalHours,
          hourlyRate,
          grossPay: Math.round(grossPay * 100) / 100,
        };
      });

    // ── JSON response ────────────────────────────────────────────────────────
    if (format === 'json') {
      return reply.status(200).send({ data: rows, meta: { payPeriod, employeeCount: rows.length } });
    }

    // ── CSV / MYOB / Xero ────────────────────────────────────────────────────
    const isMyob = format === 'myob';
    // Xero uses comma-separated (same columns as standard CSV for simplicity)
    const delimiter = isMyob ? '\t' : ',';
    const filename = `payroll-${dateFrom}-to-${dateTo}.${isMyob ? 'txt' : 'csv'}`;

    const lines: string[] = [];

    // Headers
    lines.push(buildCsvRow(MYOB_HEADERS, delimiter));

    // Data rows
    for (const row of rows) {
      lines.push(
        buildCsvRow(
          [
            row.employeeName,
            row.employeeId,
            row.payPeriod,
            row.regularHours.toFixed(2),
            row.overtimeHours.toFixed(2),
            row.totalHours.toFixed(2),
            row.hourlyRate.toFixed(2),
            row.grossPay.toFixed(2),
          ],
          delimiter,
        ),
      );
    }

    const csvContent = lines.join('\r\n');

    return reply
      .status(200)
      .header('Content-Type', isMyob ? 'text/tab-separated-values' : 'text/csv')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csvContent);
  });
}
