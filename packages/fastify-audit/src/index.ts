/**
 * @nexus/fastify-audit — universal mutation audit plugin
 * ================================================================
 * v2.7.48-univlog. Registered in every backend service. On every
 * non-GET response, writes one row to `system_audit_logs` carrying
 * the actor (decoded from the JWT), the entity (resolved by the
 * caller via `entityFromUrl`), the HTTP context, and an optional
 * before/after diff for PATCH/PUT.
 *
 * Behaviour
 *   - `onResponse` hook so the row carries `status_code`.
 *   - GET / HEAD / OPTIONS skipped — only mutations.
 *   - Excluded paths skipped (default `/health`).
 *   - Best-effort INSERT to `system_audit_logs` via a shared pg pool.
 *     Errors are caught, logged at warn level, and swallowed — audit
 *     failures must NEVER break the main request. The merchant's
 *     POS / dashboard / kiosk flow is sacred; audit is best-effort.
 *
 * Why not store the Drizzle instance? Each service has its own
 * Drizzle schema and we don't want to import every one. A raw `pg`
 * pool is the lowest common denominator across services and the
 * INSERT shape is identical regardless of which service runs it.
 *
 * Caller can also fire `request.audit({ … })` to capture a custom
 * row from inside a route handler. Useful for endpoints whose
 * actor / entity can't be derived from the URL alone (e.g. login).
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Pool } from 'pg';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuditActorType =
  | 'employee'
  | 'device'
  | 'godmode_staff'
  | 'system'
  | 'customer';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'auth_fail';

export interface AuditEntity {
  entityType: string;
  entityId?: string | null | undefined;
  entityName?: string | null | undefined;
}

export interface AuditRow {
  orgId?: string | null;
  locationId?: string | null;
  actorType: AuditActorType;
  actorId?: string | null;
  actorName?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  endpoint?: string | null;
  method?: string | null;
  statusCode?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  service?: string | null;
  notes?: string | null;
}

export interface AuditPluginOptions {
  /** Tag every row written by this service. */
  serviceName: string;
  /** Optional explicit pg pool — falls back to a fresh pool from `databaseUrl`. */
  pool?: Pool;
  /** Connection string used when `pool` is omitted. Defaults to `process.env.DATABASE_URL`. */
  databaseUrl?: string;
  /**
   * Paths that should NOT trigger an audit row even on mutation.
   * Matched against `request.url` with `startsWith`.
   * `/health` is always skipped regardless of this list.
   */
  exclude?: string[];
  /**
   * Resolve the entity being mutated from the request URL + body.
   * If omitted, the plugin falls back to inferring `entityType` from
   * the first non-`api`/`v1` path segment and pulls `entityId` from
   * a trailing UUID-like segment.
   */
  entityFromUrl?: (
    url: string,
    body: unknown,
    request: FastifyRequest,
  ) => Partial<AuditEntity> | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Manually emit an audit row from inside a route handler. */
    audit?: (row: Partial<AuditRow> & Pick<AuditRow, 'action' | 'entityType'>) => void;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SKIP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function inferActor(request: FastifyRequest): {
  actorType: AuditActorType;
  actorId: string | null;
  actorName: string | null;
  orgId: string | null;
} {
  // Each service that registers @fastify/jwt augments FastifyRequest with
  // a `user` field (decoded JWT). We don't depend on @fastify/jwt directly
  // here — read defensively via a structural cast so this plugin works
  // even in services that don't use JWT auth.
  const reqWithUser = request as FastifyRequest & { user?: unknown };
  const u = (reqWithUser.user ?? null) as Record<string, unknown> | null;
  if (!u) {
    return { actorType: 'system', actorId: null, actorName: null, orgId: null };
  }
  const orgId = (u['orgId'] as string | undefined) ?? null;
  const sub = (u['sub'] as string | undefined) ?? null;
  const type = (u['type'] as string | undefined) ?? null;
  const role = (u['role'] as string | undefined) ?? null;
  const emailVal = u['email'];
  const fnVal = u['firstName'];
  const lnVal = u['lastName'];
  const email = typeof emailVal === 'string' ? emailVal : null;
  const fn = typeof fnVal === 'string' ? fnVal : '';
  const ln = typeof lnVal === 'string' ? lnVal : '';
  const name = [fn, ln].filter(Boolean).join(' ').trim() || email;

  if (type === 'platform') {
    return { actorType: 'godmode_staff', actorId: sub, actorName: name ?? role ?? 'Godmode', orgId };
  }
  if (type === 'device') {
    return { actorType: 'device', actorId: sub, actorName: name ?? 'Paired device', orgId };
  }
  if (type === 'customer') {
    return { actorType: 'customer', actorId: sub, actorName: name, orgId };
  }
  // Employee tokens (the default — no `type` claim).
  return { actorType: 'employee', actorId: sub, actorName: name ?? null, orgId };
}

function inferAction(method: string): AuditAction {
  switch (method.toUpperCase()) {
    case 'POST':   return 'create';
    case 'PATCH':  return 'update';
    case 'PUT':    return 'update';
    case 'DELETE': return 'delete';
    default:       return 'update';
  }
}

function defaultEntityFromUrl(url: string): Partial<AuditEntity> {
  // /api/v1/<resource>[/<id>][/<sub-action>]
  const path = url.split('?', 1)[0] ?? url;
  const segs = path.split('/').filter(Boolean);
  // Drop the api/v1 prefix when present.
  const after = segs[0] === 'api' && segs[1] === 'v1' ? segs.slice(2) : segs;
  if (after.length === 0) return {};
  const entityType = after[0] ?? 'unknown';
  // Find a UUID-like segment for entityId.
  let entityId: string | null = null;
  for (let i = 1; i < after.length; i++) {
    const s = after[i] ?? '';
    if (UUID_RE.test(s)) {
      entityId = s;
      break;
    }
  }
  // If no UUID, treat the second segment (if any) as the id (e.g. settings keys).
  if (!entityId && after.length >= 2) {
    const second = after[1] ?? '';
    // Avoid catching sub-routes like /complete, /cancel, /export
    if (second && !['export', 'complete', 'cancel', 'reverse', 'refund', 'login', 'logout'].includes(second)) {
      entityId = second;
    }
  }
  return { entityType, entityId };
}

function safeJson(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  // Prefer the body as-is — Fastify already parsed it. We don't want
  // to mutate it (e.g. a stripping pass for secrets) here so callers
  // who care can pass `request.audit({ … })` with a redacted shape.
  try {
    JSON.stringify(v);
    return v;
  } catch {
    return null;
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const auditPlugin: FastifyPluginAsync<AuditPluginOptions> = async (app, options) => {
  const serviceName = options.serviceName;
  if (!serviceName) {
    app.log.warn('[fastify-audit] no serviceName supplied — audit rows will be untagged');
  }

  const pool: Pool =
    options.pool ??
    new Pool({
      connectionString: options.databaseUrl ?? process.env['DATABASE_URL'],
      ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 2,
    });

  const exclude = ['/health', ...(options.exclude ?? [])];
  const entityFromUrl = options.entityFromUrl ?? null;

  /**
   * Best-effort INSERT. Never throws. Logs at warn on failure so we
   * notice systemic schema drift but the main flow continues.
   */
  async function writeRow(row: AuditRow): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO system_audit_logs (
            org_id, location_id,
            actor_type, actor_id, actor_name,
            action, entity_type, entity_id, entity_name,
            before_json, after_json,
            endpoint, method, status_code, ip_address, user_agent,
            service, notes
          ) VALUES (
            $1, $2,
            $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11,
            $12, $13, $14, $15, $16,
            $17, $18
          )`,
        [
          row.orgId ?? null,
          row.locationId ?? null,
          row.actorType,
          row.actorId ?? null,
          row.actorName ?? null,
          row.action,
          row.entityType,
          row.entityId ?? null,
          row.entityName ?? null,
          row.beforeJson === undefined ? null : JSON.stringify(safeJson(row.beforeJson)),
          row.afterJson === undefined ? null : JSON.stringify(safeJson(row.afterJson)),
          row.endpoint ?? null,
          row.method ?? null,
          row.statusCode ?? null,
          row.ipAddress ?? null,
          row.userAgent ?? null,
          row.service ?? serviceName,
          row.notes ?? null,
        ],
      );
    } catch (err) {
      app.log.warn({ err: err instanceof Error ? err.message : String(err) }, '[fastify-audit] insert failed (swallowed)');
    }
  }

  /**
   * Decorator: routes can fire `request.audit({...})` to capture a row
   * with custom actor / entity / before-after fields. Used by hand-rolled
   * flows like login / logout / auth_fail where the URL → entity mapping
   * doesn't apply.
   */
  app.decorateRequest('audit', null);
  app.addHook('onRequest', async (request) => {
    request.audit = (partial) => {
      const actor = inferActor(request);
      void writeRow({
        actorType: actor.actorType,
        actorId: actor.actorId,
        actorName: actor.actorName,
        orgId: actor.orgId,
        ...partial,
        action: partial.action,
        entityType: partial.entityType,
        endpoint: partial.endpoint ?? request.url,
        method: partial.method ?? request.method,
        ipAddress: partial.ipAddress ?? request.ip,
        userAgent: partial.userAgent ?? (request.headers['user-agent'] as string | undefined) ?? null,
        service: partial.service ?? serviceName,
      });
    };
  });

  /**
   * onResponse — fires after the response is sent so we know the
   * status code. Skipped for GET/HEAD/OPTIONS, /health, and any
   * caller-excluded prefixes.
   */
  app.addHook('onResponse', async (request, reply) => {
    try {
      const method = request.method.toUpperCase();
      if (SKIP_METHODS.has(method)) return;

      const url = request.url;
      for (const prefix of exclude) {
        if (url.startsWith(prefix)) return;
      }

      // Skip 4xx where validation failed before any state change. Keep 5xx
      // because they often happen mid-mutation and are the most important
      // forensic case.
      const status = reply.statusCode;
      if (status >= 400 && status < 500) {
        // 401/403 are interesting — capture them as auth_fail.
        if (status === 401 || status === 403) {
          const actor = inferActor(request);
          await writeRow({
            orgId: actor.orgId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            actorName: actor.actorName,
            action: 'auth_fail',
            entityType: 'auth',
            entityId: null,
            entityName: null,
            endpoint: url,
            method,
            statusCode: status,
            ipAddress: request.ip,
            userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
            service: serviceName,
          });
          return;
        }
        // 422 / 400 / 404 etc. — not worth audit noise.
        return;
      }

      const body: unknown = (request as { body?: unknown }).body ?? null;
      const entityHint =
        (entityFromUrl ? entityFromUrl(url, body, request) : null) ??
        defaultEntityFromUrl(url);

      const actor = inferActor(request);
      const action = inferAction(method);

      await writeRow({
        orgId: actor.orgId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        actorName: actor.actorName,
        action,
        entityType: entityHint.entityType ?? 'unknown',
        entityId: entityHint.entityId ?? null,
        entityName: entityHint.entityName ?? null,
        beforeJson: null,                                        // mutation-side capture; before-state requires per-route hooks
        afterJson: action === 'create' || action === 'update' ? body : null,
        endpoint: url,
        method,
        statusCode: status,
        ipAddress: request.ip,
        userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
        service: serviceName,
      });
    } catch (err) {
      app.log.warn({ err: err instanceof Error ? err.message : String(err) }, '[fastify-audit] hook failed (swallowed)');
    }
  });

  // Close the pool on shutdown if we created it.
  if (!options.pool) {
    app.addHook('onClose', async () => {
      try {
        await pool.end();
      } catch {
        // best-effort
      }
    });
  }

  // Expose pool for hand-rolled emitters in the same service that want
  // to reuse the connection (e.g. login flow in services/auth).
  app.decorate('auditPool', pool);
};

declare module 'fastify' {
  interface FastifyInstance {
    auditPool?: Pool;
  }
}

export default auditPlugin;
export { auditPlugin };

// ── Stand-alone helper for hand-rolled emitters ──────────────────────────────

/**
 * Direct insert helper — used by services/auth's login / logout / auth_fail
 * flow which can't use the URL-based entity inference.
 */
export async function writeAuditRow(pool: Pool, row: AuditRow): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO system_audit_logs (
          org_id, location_id,
          actor_type, actor_id, actor_name,
          action, entity_type, entity_id, entity_name,
          before_json, after_json,
          endpoint, method, status_code, ip_address, user_agent,
          service, notes
        ) VALUES (
          $1, $2,
          $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18
        )`,
      [
        row.orgId ?? null,
        row.locationId ?? null,
        row.actorType,
        row.actorId ?? null,
        row.actorName ?? null,
        row.action,
        row.entityType,
        row.entityId ?? null,
        row.entityName ?? null,
        row.beforeJson === undefined ? null : JSON.stringify(row.beforeJson),
        row.afterJson === undefined ? null : JSON.stringify(row.afterJson),
        row.endpoint ?? null,
        row.method ?? null,
        row.statusCode ?? null,
        row.ipAddress ?? null,
        row.userAgent ?? null,
        row.service ?? null,
        row.notes ?? null,
      ],
    );
  } catch {
    // swallow — audit failures must never throw
  }
}
