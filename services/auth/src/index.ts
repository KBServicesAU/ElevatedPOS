import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { Pool } from 'pg';
import { getRedisClient } from '@nexus/config';
import { isBlacklisted } from './lib/tokens';
import { authRoutes } from './routes/auth';
import { mfaRoutes } from './routes/mfa';
import { employeeRoutes } from './routes/employees';
import { roleRoutes } from './routes/roles';
import { approvalRoutes } from './routes/approvals';
import { timeClockRoutes } from './routes/timeClock';
import { oauthRoutes } from './routes/oauth';
import { locationRoutes } from './routes/locations';
import { payrollRoutes } from './routes/payroll';
import { deviceRoutes } from './routes/devices';
import { printerRoutes } from './routes/printers';
import { organisationRoutes } from './routes/organisations';
import { platformRoutes } from './routes/platform';
import { planRoutes } from './routes/plans';
import { signupLinkRoutes } from './routes/signupLinks';
import { supportNoteRoutes } from './routes/supportNotes';
import { auditLogRoutes } from './routes/auditLogs';
import { rosterRoutes } from './routes/roster';
import { displayRoutes } from './routes/display';
import { billingRoutes } from './routes/billing';
import { settingsRoutes } from './routes/settings';
import { systemAuditLogRoutes, godmodeSystemAuditLogRoutes } from './routes/systemAuditLogs';
import auditPlugin from '@nexus/fastify-audit';
import { seedDemoOrg } from './seed';

// Type augmentation — allows app.authenticate to be used as a preHandler
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}


const app = Fastify({
  logger: {
    level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
  },
  requestIdHeader: 'x-request-id',
  trustProxy: true,
  // v2.7.51 — receipt logo uploads (base64 1-bit raster) can exceed the
  // Fastify default 1 MiB body limit when the source PNG is large; raise to
  // 4 MiB so the route-level MAX_LOGO_BYTES check is the authoritative cap
  // and Fastify doesn't return a generic 413 before our handler runs.
  bodyLimit: 4 * 1024 * 1024,
});

/**
 * Apply any missing schema changes directly via pg before the service starts.
 * Uses IF NOT EXISTS / DO $$ EXCEPTION guards so it is fully idempotent and
 * safe to run on every pod restart regardless of DB state.
 * Bypasses Drizzle's journal/hash machinery entirely — no file-system reads,
 * no hash mismatches, no silent failures.
 */
async function applyMigrations(): Promise<void> {
  // v2.7.82 — retry-with-backoff to ride out transient Postgres
  // unavailability during rolling deploys.
  const MAX_ATTEMPTS = 5;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await applyMigrationsOnce();
      return;
    } catch (err) {
      lastErr = err;
      const isLast = attempt === MAX_ATTEMPTS;
      console.warn(
        `[auth] migration attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        err instanceof Error ? err.message : err,
        isLast ? '— giving up.' : '— retrying.',
      );
      if (!isLast) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  console.error('[auth] migration failed after retries — aborting startup:', lastErr);
  process.exit(1);
}

async function applyMigrationsOnce(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });
  const client = await pool.connect();
  try {
    // ── Migration 0021 ────────────────────────────────────────────────────────
    // Enums
    await client.query(`DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('incomplete','trialing','active','past_due','cancelled','paused'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await client.query(`DO $$ BEGIN CREATE TYPE device_type AS ENUM ('pos','kds','kiosk','display','dashboard'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await client.query(`DO $$ BEGIN CREATE TYPE onboarding_step_v2 AS ENUM ('business_info','owner_account','location_setup','staff_setup','device_selection','stripe_connect','subscription','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    // Columns on organisations
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS phone varchar(50)`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS business_address jsonb DEFAULT '{}'`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS website_url varchar(500)`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS billing_model varchar(20) NOT NULL DEFAULT 'legacy'`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS subscription_status subscription_status NOT NULL DEFAULT 'incomplete'`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar(255)`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS website_addon_enabled boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS custom_domain_addon_enabled boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS onboarding_step_v2 onboarding_step_v2 DEFAULT 'completed'`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS onboarding_token varchar(255)`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS onboarding_token_expires_at timestamptz`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS pending_device_selection jsonb DEFAULT '{}'`);
    // Back-fill billing model for existing orgs
    await client.query(`UPDATE organisations SET billing_model = 'legacy', subscription_status = 'active' WHERE billing_model = 'legacy' AND onboarding_step = 'completed'`);

    // ── Migration 0022 ────────────────────────────────────────────────────────
    await client.query(`CREATE SEQUENCE IF NOT EXISTS org_account_number_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1`);
    await client.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS account_number varchar(9) UNIQUE DEFAULT LPAD(nextval('org_account_number_seq')::text, 9, '0')`);
    // Back-fill existing rows that have no account number yet
    await client.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT id FROM organisations WHERE account_number IS NULL ORDER BY created_at ASC
        LOOP
          UPDATE organisations SET account_number = LPAD(nextval('org_account_number_seq')::text, 9, '0') WHERE id = r.id;
        END LOOP;
      END $$
    `);
    await client.query(`ALTER TABLE organisations ALTER COLUMN account_number SET NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS organisations_account_number_idx ON organisations (account_number)`);

    // ── Migration 0027 — TOTP MFA recovery codes + platform_staff MFA columns ──
    await client.query(`ALTER TABLE platform_staff ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE platform_staff ADD COLUMN IF NOT EXISTS mfa_secret varchar(255)`);
    await client.query(`ALTER TABLE platform_staff ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE platform_staff ADD COLUMN IF NOT EXISTS locked_until timestamptz`);
    await client.query(`CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id       uuid REFERENCES employees(id) ON DELETE CASCADE,
      platform_staff_id uuid REFERENCES platform_staff(id) ON DELETE CASCADE,
      code_hash         varchar(255) NOT NULL,
      used_at           timestamptz,
      created_at        timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT mfa_recovery_codes_one_owner CHECK (
        (employee_id IS NOT NULL AND platform_staff_id IS NULL) OR
        (employee_id IS NULL AND platform_staff_id IS NOT NULL)
      )
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_employee ON mfa_recovery_codes(employee_id) WHERE employee_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_platform ON mfa_recovery_codes(platform_staff_id) WHERE platform_staff_id IS NOT NULL`);

    // ── v2.7.77 — refresh-token reuse detection ──────────────────────────────
    await client.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id uuid`);
    await client.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_reason varchar(32)`);
    await client.query(`CREATE INDEX IF NOT EXISTS refresh_tokens_family_id_idx ON refresh_tokens (family_id)`);
    // Back-fill family_id = id for any existing rows so the reuse-
    // detection pivot doesn't see NULL families and skip them. Each
    // existing token starts as its own one-element family.
    await client.query(`UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL`);

    // ── v2.7.80 — display_content org-level defaults ─────────────────────────
    // Allow a row with deviceId IS NULL to represent the org default
    // signage template. /api/v1/display/content falls back to this when
    // a device has no per-device content yet.
    //
    // Drop the column-level UNIQUE on device_id (old definition) and
    // replace with two partial unique indexes that support both shapes.
    await client.query(`ALTER TABLE display_content ALTER COLUMN device_id DROP NOT NULL`);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'display_content_device_id_unique'
            AND conrelid = 'display_content'::regclass
        ) THEN
          ALTER TABLE display_content DROP CONSTRAINT display_content_device_id_unique;
        END IF;
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'display_content_device_id_key'
            AND conrelid = 'display_content'::regclass
        ) THEN
          ALTER TABLE display_content DROP CONSTRAINT display_content_device_id_key;
        END IF;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS display_content_device_idx
        ON display_content (device_id)
        WHERE device_id IS NOT NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS display_content_org_default_idx
        ON display_content (org_id)
        WHERE device_id IS NULL
    `);

    console.log('[auth] schema migrations applied successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

async function start() {
  await applyMigrations();

  // v2.7.87 — idempotently provision the public Demo Cafe at /demo so the
  // marketing site's "Try the demo" button always lands on a polished
  // working storefront. Failures here are fail-soft: they log and let
  // the service keep starting, since a missing demo org never blocks
  // real merchants.
  try {
    await seedDemoOrg();
  } catch (err) {
    console.warn('[auth] demo seed failed (non-fatal):', err instanceof Error ? err.message : err);
  }

  await app.register(helmet);
  await app.register(cors, {
    origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  const redis = getRedisClient();
  await app.register(rateLimit, {
    max: 500,
    timeWindow: '15 minutes',
    ...(redis ? { redis } : {}),
    keyGenerator: (req) => req.ip,
    allowList: (req: import('fastify').FastifyRequest) => req.url === '/health',
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' }),
  });
  await app.register(sensible);
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(jwt as any, {
    secret: jwtSecret,
    sign: {
      expiresIn: process.env['JWT_ACCESS_EXPIRY'] ?? '15m',
      issuer: 'elevatedpos-auth',
    },
    verify: {
      issuer: 'elevatedpos-auth',
    },
  });

  app.decorate('authenticate', async (
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => {
    try {
      await request.jwtVerify();
      const payload = request.user as { jti?: string };
      if (payload.jti && await isBlacklisted(payload.jti)) {
        return reply.status(401).send({
          type: 'https://elevatedpos.com/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
          detail: 'Token has been revoked.',
        });
      }
    } catch {
      return reply.status(401).send({
        type: 'https://elevatedpos.com/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
      });
    }
  });

  // v2.7.48-univlog — universal audit middleware (system_audit_logs).
  // The auth service ALSO hand-emits login / logout / auth_fail rows
  // from routes/auth.ts because the URL → entity inference can't infer
  // "this POST /login was a login attempt" from the URL alone.
  await app.register(auditPlugin, { serviceName: 'auth' });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  // v2.7.62 — TOTP MFA: /enroll, /confirm, /verify, /reset, /recovery-codes/regenerate.
  await app.register(mfaRoutes,  { prefix: '/api/v1/auth/mfa' });
  await app.register(employeeRoutes, { prefix: '/api/v1/employees' });
  await app.register(roleRoutes, { prefix: '/api/v1/roles' });
  await app.register(approvalRoutes, { prefix: '/api/v1/approvals' });
  await app.register(timeClockRoutes, { prefix: '/api/v1/time-clock' });
  // OAuth 2.0 — no JWT authenticate hook; uses its own client_id/secret auth
  await app.register(oauthRoutes, { prefix: '/api/v1/oauth' });
  await app.register(locationRoutes, { prefix: '/api/v1/locations' });
  await app.register(payrollRoutes, { prefix: '/api/v1/payroll' });
  await app.register(deviceRoutes, { prefix: '/api/v1/devices' });
  await app.register(printerRoutes, { prefix: '/api/v1/printers' });
  await app.register(organisationRoutes, { prefix: '/api/v1/organisations' });
  await app.register(platformRoutes, { prefix: '/api/v1/platform' });
  await app.register(planRoutes,        { prefix: '/api/v1/plans' });
  await app.register(signupLinkRoutes,  { prefix: '/api/v1/signup-links' });
  await app.register(supportNoteRoutes, { prefix: '/api/v1/support-notes' });
  await app.register(auditLogRoutes,    { prefix: '/api/v1/audit-logs' });
  await app.register(rosterRoutes,      { prefix: '/api/v1/roster' });
  await app.register(displayRoutes,     { prefix: '/api/v1/display' });
  await app.register(billingRoutes,     { prefix: '/api/v1/billing' });
  await app.register(settingsRoutes,    { prefix: '/api/v1/settings' });
  // v2.7.48-univlog — system_audit_logs read APIs.
  await app.register(systemAuditLogRoutes,        { prefix: '/api/v1/audit-logs' });
  await app.register(godmodeSystemAuditLogRoutes, { prefix: '/api/v1/godmode/audit-logs' });

  app.get('/health', async () => ({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() }));

  const port = Number(process.env['PORT'] ?? 4001);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Auth service listening on port ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
