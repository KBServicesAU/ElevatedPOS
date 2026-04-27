import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';

/**
 * System Audit Logs API — v2.7.48-univlog
 * ================================================================
 * Read-side API for `system_audit_logs`. Writes happen automatically
 * via @nexus/fastify-audit registered in every backend service.
 *
 * Endpoints
 *   GET   /api/v1/audit-logs                  — list (org-scoped)
 *   GET   /api/v1/audit-logs/:id              — single detail
 *   GET   /api/v1/audit-logs/export           — JSON / CSV stream
 *   GET   /api/v1/godmode/audit-logs          — cross-org (platform JWT)
 *   GET   /api/v1/godmode/audit-logs/:id
 *   GET   /api/v1/godmode/audit-logs/export
 */

const actorTypeEnum = z.enum(['employee', 'device', 'godmode_staff', 'system', 'customer']);
const actionEnum    = z.enum(['create', 'update', 'delete', 'login', 'logout', 'auth_fail']);

const listQuerySchema = z.object({
  orgId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  actorType: actorTypeEnum.optional(),
  action: actionEnum.optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(255).optional(),
  service: z.string().max(50).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const exportQuerySchema = listQuerySchema
  .extend({ format: z.enum(['json', 'csv']).default('json') })
  .extend({ limit: z.coerce.number().int().min(1).max(10000).default(10000) });

interface OrgUser  { orgId?: string; sub?: string; type?: string; role?: string }
interface PlatformUser { type: 'platform'; role: string; sub: string }

function isPlatformUser(request: FastifyRequest): request is FastifyRequest & { user: PlatformUser } {
  const u = request.user as Partial<PlatformUser> | undefined;
  return !!u && u.type === 'platform';
}

function buildWhere(orgScope: string | null, q: z.infer<typeof listQuerySchema>): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (orgScope) conds.push(eq(schema.systemAuditLogs.orgId, orgScope));
  if (q.actorId) conds.push(eq(schema.systemAuditLogs.actorId, q.actorId));
  if (q.actorType) conds.push(eq(schema.systemAuditLogs.actorType, q.actorType));
  if (q.action) conds.push(eq(schema.systemAuditLogs.action, q.action));
  if (q.entityType) conds.push(eq(schema.systemAuditLogs.entityType, q.entityType));
  if (q.entityId) conds.push(eq(schema.systemAuditLogs.entityId, q.entityId));
  if (q.service) conds.push(eq(schema.systemAuditLogs.service, q.service));
  if (q.from) conds.push(gte(schema.systemAuditLogs.createdAt, new Date(q.from)));
  if (q.to)   conds.push(lte(schema.systemAuditLogs.createdAt, new Date(q.to)));
  const filtered = conds.filter((c): c is SQL => c !== undefined);
  return filtered.length === 0 ? undefined : and(...filtered);
}

const CSV_COLUMNS: Array<keyof typeof schema.systemAuditLogs.$inferSelect> = [
  'id', 'createdAt', 'orgId', 'service',
  'actorType', 'actorId', 'actorName',
  'action', 'entityType', 'entityId', 'entityName',
  'method', 'endpoint', 'statusCode',
  'ipAddress', 'userAgent', 'notes',
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : String(v);
  s = s.replace(/\r?\n/g, ' ').replace(/\r/g, ' ');
  if (s.includes(',') || s.includes('"')) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rowsToCsv(rows: Array<typeof schema.systemAuditLogs.$inferSelect>): string {
  const header = CSV_COLUMNS.join(',');
  const body = rows.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

// ── Org-scoped routes ─────────────────────────────────────────────────────────

export async function systemAuditLogRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/audit-logs/export — declared BEFORE :id so it isn't shadowed
  app.get('/export', async (request, reply) => {
    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: parsed.error.message });
    }
    const q = parsed.data;
    const user = request.user as OrgUser;
    const orgScope = user.orgId ?? null;
    if (!orgScope) {
      return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'org-scoped export requires an org JWT.' });
    }
    const where = buildWhere(orgScope, q);
    const rows = await db.query.systemAuditLogs.findMany({
      where, limit: q.limit, offset: q.offset,
      orderBy: [desc(schema.systemAuditLogs.createdAt)],
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audit-logs-${stamp}.${q.format}`;
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    if (q.format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      return reply.send(rowsToCsv(rows));
    }
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return reply.send(JSON.stringify(rows, null, 2));
  });

  // GET /api/v1/audit-logs
  app.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: parsed.error.message });
    }
    const q = parsed.data;
    const user = request.user as OrgUser;
    const orgScope = user.orgId ?? null;
    if (!orgScope) {
      return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'org-scoped list requires an org JWT.' });
    }
    const where = buildWhere(orgScope, q);
    const [rows, [countRow]] = await Promise.all([
      db.query.systemAuditLogs.findMany({
        where, limit: q.limit, offset: q.offset,
        orderBy: [desc(schema.systemAuditLogs.createdAt)],
      }),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.systemAuditLogs).where(where ?? sql`true`),
    ]);
    return reply.status(200).send({
      data: rows,
      meta: {
        totalCount: countRow?.count ?? 0,
        hasMore: q.offset + rows.length < (countRow?.count ?? 0),
        limit: q.limit, offset: q.offset,
      },
    });
  });

  // GET /api/v1/audit-logs/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as OrgUser;
    const orgScope = user.orgId;
    if (!orgScope && !isPlatformUser(request)) {
      return reply.status(403).send({ title: 'Forbidden', status: 403 });
    }
    const row = await db.query.systemAuditLogs.findFirst({
      where: orgScope
        ? and(eq(schema.systemAuditLogs.id, id), eq(schema.systemAuditLogs.orgId, orgScope))
        : eq(schema.systemAuditLogs.id, id),
    });
    if (!row) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: row });
  });
}

// ── Godmode (cross-org) routes ────────────────────────────────────────────────

export async function godmodeSystemAuditLogRoutes(app: FastifyInstance) {
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

  // GET /api/v1/godmode/audit-logs/export
  app.get('/export', async (request, reply) => {
    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: parsed.error.message });
    }
    const q = parsed.data;
    const where = buildWhere(q.orgId ?? null, q);
    const rows = await db.query.systemAuditLogs.findMany({
      where, limit: q.limit, offset: q.offset,
      orderBy: [desc(schema.systemAuditLogs.createdAt)],
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audit-logs-godmode-${stamp}.${q.format}`;
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    if (q.format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      return reply.send(rowsToCsv(rows));
    }
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return reply.send(JSON.stringify(rows, null, 2));
  });

  // GET /api/v1/godmode/audit-logs
  app.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: parsed.error.message });
    }
    const q = parsed.data;
    const where = buildWhere(q.orgId ?? null, q);
    const [rows, [countRow]] = await Promise.all([
      db.query.systemAuditLogs.findMany({
        where, limit: q.limit, offset: q.offset,
        orderBy: [desc(schema.systemAuditLogs.createdAt)],
      }),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.systemAuditLogs).where(where ?? sql`true`),
    ]);
    return reply.status(200).send({
      data: rows,
      meta: {
        totalCount: countRow?.count ?? 0,
        hasMore: q.offset + rows.length < (countRow?.count ?? 0),
        limit: q.limit, offset: q.offset,
      },
    });
  });

  // GET /api/v1/godmode/audit-logs/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.query.systemAuditLogs.findFirst({
      where: eq(schema.systemAuditLogs.id, id),
    });
    if (!row) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: row });
  });
}
