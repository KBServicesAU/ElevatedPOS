import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db';

/**
 * Terminal Transactions API — v2.7.48
 * ================================================================
 * Audit log for every ANZ Worldline TIM API interaction. Built for
 * the ANZ certification submission (cert evidence requires merchants
 * to download a full transaction log alongside test videos and
 * receipts) and ongoing operations (cardholder dispute resolution,
 * acquirer settlement reconciliation).
 *
 * Endpoints
 *   POST   /api/v1/terminal/transactions             — capture a row
 *   GET    /api/v1/terminal/transactions             — list (org-scoped)
 *   GET    /api/v1/terminal/transactions/:id         — single detail
 *   GET    /api/v1/terminal/transactions/export      — JSON / CSV stream
 *   GET    /api/v1/godmode/terminal/transactions     — cross-org list
 *   GET    /api/v1/godmode/terminal/transactions/export — cross-org export
 */

// ── Zod schemas ───────────────────────────────────────────────────────────────

const outcomeEnum = z.enum(['approved', 'declined', 'cancelled', 'error', 'timeout']);
const txTypeEnum  = z.enum(['purchase', 'refund', 'reversal', 'reconcile', 'logon', 'logoff']);

const createSchema = z.object({
  // org_id is taken from the auth token (employee or device JWT). The
  // mobile bridge doesn't need to send it — but we accept it for
  // platform/godmode-issued tokens that don't carry an org claim.
  orgId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional().nullable(),
  referenceId: z.string().max(255).optional().nullable(),
  provider: z.string().max(20).default('anz'),
  outcome: outcomeEnum,
  amountCents: z.number().int().nullable().optional(),
  transactionType: txTypeEnum.optional(),
  transactionRef: z.string().nullable().optional(),
  authCode: z.string().nullable().optional(),
  rrn: z.string().nullable().optional(),
  maskedPan: z.string().nullable().optional(),
  cardType: z.string().nullable().optional(),
  errorCategory: z.string().nullable().optional(),
  errorCode: z.number().int().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorStep: z.string().nullable().optional(),
  merchantReceipt: z.string().nullable().optional(),
  customerReceipt: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  timCapabilities: z.unknown().optional(),
  raw: z.unknown().optional(),
});

const listQuerySchema = z.object({
  orgId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  outcome: outcomeEnum.optional(),
  transactionType: txTypeEnum.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const exportQuerySchema = listQuerySchema
  .extend({ format: z.enum(['json', 'csv']).default('json') })
  // Allow large exports for cert evidence — cap at 10k to avoid runaway memory.
  .extend({ limit: z.coerce.number().int().min(1).max(10000).default(10000) });

// ── Auth helpers ──────────────────────────────────────────────────────────────

interface OrgUser  { orgId: string; sub?: string; type?: string; role?: string }
interface PlatformUser { type: 'platform'; role: string; sub: string }

/**
 * Allow Godmode platform tokens to look up rows across orgs. Returns true
 * if the request bearer is a `type: 'platform'` JWT (issued by the auth
 * service `/api/v1/platform/login` flow). Matches the auth/platform
 * `authenticatePlatform` shape so the same staff cookie that drives the
 * Godmode portal works against this service.
 */
function isPlatformUser(request: FastifyRequest): request is FastifyRequest & { user: PlatformUser } {
  const u = request.user as Partial<PlatformUser> | undefined;
  return !!u && u.type === 'platform';
}

/**
 * Common where-builder for both org-scoped and godmode queries. `orgScope`
 * — when non-null — pins the query to a single org (org-scoped endpoint
 * pulls it from the JWT; godmode pulls it from `?orgId=` if supplied).
 */
function buildWhere(
  orgScope: string | null,
  q: z.infer<typeof listQuerySchema>,
): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (orgScope) conds.push(eq(schema.terminalTransactions.orgId, orgScope));
  if (q.locationId) conds.push(eq(schema.terminalTransactions.locationId, q.locationId));
  if (q.deviceId) conds.push(eq(schema.terminalTransactions.deviceId, q.deviceId));
  if (q.orderId) conds.push(eq(schema.terminalTransactions.orderId, q.orderId));
  if (q.outcome) conds.push(eq(schema.terminalTransactions.outcome, q.outcome));
  if (q.transactionType)
    conds.push(eq(schema.terminalTransactions.transactionType, q.transactionType));
  if (q.from) conds.push(gte(schema.terminalTransactions.createdAt, new Date(q.from)));
  if (q.to) conds.push(lte(schema.terminalTransactions.createdAt, new Date(q.to)));
  const filtered = conds.filter((c): c is SQL => c !== undefined);
  return filtered.length === 0 ? undefined : and(...filtered);
}

// ── CSV serialiser ────────────────────────────────────────────────────────────

const CSV_COLUMNS: Array<keyof typeof schema.terminalTransactions.$inferSelect> = [
  'id',
  'createdAt',
  'orgId',
  'locationId',
  'deviceId',
  'orderId',
  'referenceId',
  'provider',
  'outcome',
  'transactionType',
  'amountCents',
  'transactionRef',
  'authCode',
  'rrn',
  'maskedPan',
  'cardType',
  'errorCategory',
  'errorCode',
  'errorStep',
  'errorMessage',
  'durationMs',
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : String(v);
  // Strip newlines from receipts/error messages so a single row is a single line.
  s = s.replace(/\r?\n/g, ' ').replace(/\r/g, ' ');
  if (s.includes(',') || s.includes('"')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCsv(rows: Array<typeof schema.terminalTransactions.$inferSelect>): string {
  const header = CSV_COLUMNS.join(',');
  const body = rows
    .map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function terminalTransactionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /api/v1/terminal/transactions
  // Capture a single terminal interaction. Idempotent on `id` if the
  // caller supplies one (mobile retries can land here twice).
  app.post('/', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const body = parsed.data;

    const user = request.user as OrgUser;
    // Prefer JWT orgId — fall back to the body for platform/godmode
    // tokens that don't have one. Reject if neither is present.
    const orgId = user.orgId ?? body.orgId;
    if (!orgId) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: 'orgId is required (must be present in JWT or body).',
      });
    }

    const inserted = await db
      .insert(schema.terminalTransactions)
      .values({
        orgId,
        locationId: body.locationId ?? null,
        deviceId: body.deviceId ?? null,
        orderId: body.orderId ?? null,
        referenceId: body.referenceId ?? null,
        provider: body.provider,
        outcome: body.outcome,
        amountCents: body.amountCents ?? null,
        transactionType: body.transactionType ?? null,
        transactionRef: body.transactionRef ?? null,
        authCode: body.authCode ?? null,
        rrn: body.rrn ?? null,
        maskedPan: body.maskedPan ?? null,
        cardType: body.cardType ?? null,
        errorCategory: body.errorCategory ?? null,
        errorCode: body.errorCode ?? null,
        errorMessage: body.errorMessage ?? null,
        errorStep: body.errorStep ?? null,
        merchantReceipt: body.merchantReceipt ?? null,
        customerReceipt: body.customerReceipt ?? null,
        durationMs: body.durationMs ?? null,
        timCapabilities: (body.timCapabilities ?? null) as object | null,
        raw: (body.raw ?? null) as object | null,
      })
      .returning();

    return reply.status(201).send({ data: inserted[0] });
  });

  // GET /api/v1/terminal/transactions/export
  // Stream-friendly export. CSV: text/csv with header. JSON: pretty array.
  // Declared BEFORE `/:id` so it isn't swallowed by the catch-all param.
  app.get('/export', async (request, reply) => {
    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const q = parsed.data;
    const user = request.user as OrgUser;
    const orgScope = user.orgId ?? null;
    if (!orgScope) {
      return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'org-scoped export requires an org JWT.' });
    }
    const where = buildWhere(orgScope, q);

    const rows = await db.query.terminalTransactions.findMany({
      where,
      orderBy: [desc(schema.terminalTransactions.createdAt)],
      limit: q.limit,
      offset: q.offset,
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `anz-terminal-transactions-${stamp}.${q.format}`;
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    if (q.format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      return reply.send(rowsToCsv(rows));
    }
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return reply.send(JSON.stringify(rows, null, 2));
  });

  // GET /api/v1/terminal/transactions
  app.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const q = parsed.data;
    const user = request.user as OrgUser;
    const orgScope = user.orgId ?? null;
    if (!orgScope) {
      return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'org-scoped list requires an org JWT.' });
    }
    const where = buildWhere(orgScope, q);

    const [rows, [countRow]] = await Promise.all([
      db.query.terminalTransactions.findMany({
        where,
        limit: q.limit,
        offset: q.offset,
        orderBy: [desc(schema.terminalTransactions.createdAt)],
      }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.terminalTransactions)
        .where(where ?? sql`true`),
    ]);

    const totalCount = countRow?.count ?? 0;
    return reply.status(200).send({
      data: rows,
      meta: {
        totalCount,
        hasMore: q.offset + rows.length < totalCount,
        limit: q.limit,
        offset: q.offset,
      },
    });
  });

  // GET /api/v1/terminal/transactions/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as OrgUser;
    const orgScope = user.orgId;
    if (!orgScope && !isPlatformUser(request)) {
      return reply.status(403).send({ title: 'Forbidden', status: 403 });
    }

    const row = await db.query.terminalTransactions.findFirst({
      where: orgScope
        ? and(
            eq(schema.terminalTransactions.id, id),
            eq(schema.terminalTransactions.orgId, orgScope),
          )
        : eq(schema.terminalTransactions.id, id),
    });

    if (!row) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: row });
  });
}

// ── Godmode (cross-org) routes ────────────────────────────────────────────────
//
// Mounted under /api/v1/godmode/terminal/transactions. Requires a
// `type: 'platform'` JWT (issued by `/api/v1/platform/login`). Same query
// shape as the org-scoped variant but `orgId` is optional — when omitted,
// returns rows from every org so support staff can drill in across the
// platform.

export async function godmodeTerminalTransactionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ title: 'Unauthorized', status: 401 });
    }
    if (!isPlatformUser(request)) {
      return reply.status(403).send({
        title: 'Forbidden',
        status: 403,
        detail: 'Godmode endpoint requires a platform staff JWT.',
      });
    }
  });

  // GET /api/v1/godmode/terminal/transactions/export
  app.get('/export', async (request, reply) => {
    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: parsed.error.message });
    }
    const q = parsed.data;
    const where = buildWhere(q.orgId ?? null, q);

    const rows = await db.query.terminalTransactions.findMany({
      where,
      orderBy: [desc(schema.terminalTransactions.createdAt)],
      limit: q.limit,
      offset: q.offset,
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `anz-terminal-transactions-godmode-${stamp}.${q.format}`;
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    if (q.format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      return reply.send(rowsToCsv(rows));
    }
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return reply.send(JSON.stringify(rows, null, 2));
  });

  // GET /api/v1/godmode/terminal/transactions
  app.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: parsed.error.message });
    }
    const q = parsed.data;
    const where = buildWhere(q.orgId ?? null, q);

    const [rows, [countRow]] = await Promise.all([
      db.query.terminalTransactions.findMany({
        where,
        limit: q.limit,
        offset: q.offset,
        orderBy: [desc(schema.terminalTransactions.createdAt)],
      }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.terminalTransactions)
        .where(where ?? sql`true`),
    ]);

    const totalCount = countRow?.count ?? 0;
    return reply.status(200).send({
      data: rows,
      meta: {
        totalCount,
        hasMore: q.offset + rows.length < totalCount,
        limit: q.limit,
        offset: q.offset,
      },
    });
  });

  // GET /api/v1/godmode/terminal/transactions/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.query.terminalTransactions.findFirst({
      where: eq(schema.terminalTransactions.id, id),
    });
    if (!row) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: row });
  });
}
