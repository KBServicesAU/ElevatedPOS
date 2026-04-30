import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { Pool } from 'pg';
import { appRoutes } from './routes/apps';
import { webhookRoutes } from './routes/webhooks';
import { connectorRoutes } from './routes/connectors';
import { connectRoutes } from './routes/connect';
import { connectExtendedRoutes } from './routes/connect-extended';
import { stripeWebhookRoutes } from './routes/stripe-webhook';
import { terminalHardwareRoutes } from './routes/terminal-hardware';
import { platformIntegrationsRoutes } from './routes/platform';
import { reservationsRoutes } from './routes/reservations';
import { startRetryPoller } from './lib/webhookDelivery';
import auditPlugin from '@nexus/fastify-audit';

// Type augmentation — allows app.authenticate to be used as a preHandler
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}


const app = Fastify({ logger: true, trustProxy: true });

/**
 * v2.7.78 — Apply ad-hoc schema changes idempotently before serving traffic.
 * Mirrors the pattern in services/auth/src/index.ts and services/orders.
 */
async function applyMigrations(): Promise<void> {
  // v2.7.82 — retry-with-backoff to ride out transient Postgres
  // unavailability during rolling deploys (see orders/src/index.ts
  // for the same pattern + rationale).
  const MAX_ATTEMPTS = 5;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 1,
    });
    let client;
    try {
      client = await pool.connect();
      // v2.7.78 — per-org QR Pay opt-in. Default false so existing merchants
      // don't see a new payment method appear without their consent.
      await client.query(
        `ALTER TABLE stripe_connect_accounts ADD COLUMN IF NOT EXISTS qr_pay_enabled boolean NOT NULL DEFAULT false`,
      );

      // v2.7.98 — reservations + reservation_settings self-heal. Same
      // self-heal pattern as services/auth/src/index.ts for display_content
      // (v2.7.95). Production environments where the v2.7.42 Drizzle
      // migration that creates these two tables didn't run will otherwise
      // 500 every /reservations and /reservations/count call (we hit
      // exactly this when verifying the v2.7.97 sidebar-badge endpoint —
      // GET /reservations/count returned 'relation "reservations" does
      // not exist'). Schema mirrors services/integrations/src/db/schema.ts
      // — keep them in sync if either side changes.
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
            CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deposit_status') THEN
            CREATE TYPE deposit_status AS ENUM ('none', 'pending', 'paid', 'refunded', 'failed');
          END IF;
        END $$
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS reservations (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id uuid NOT NULL,
          location_id uuid,
          booking_type varchar(20) NOT NULL DEFAULT 'restaurant',
          party_size integer,
          table_id uuid,
          service_id uuid,
          staff_employee_id uuid,
          duration_minutes integer,
          customer_name varchar(255) NOT NULL,
          customer_email varchar(255) NOT NULL,
          customer_phone varchar(50),
          scheduled_at timestamp with time zone NOT NULL,
          ends_at timestamp with time zone,
          status reservation_status NOT NULL DEFAULT 'pending',
          notes text,
          internal_notes text,
          deposit_status deposit_status NOT NULL DEFAULT 'none',
          deposit_amount_cents integer NOT NULL DEFAULT 0,
          deposit_stripe_account_id varchar(255),
          deposit_payment_intent_id varchar(255),
          deposit_paid_at timestamp with time zone,
          deposit_refunded_at timestamp with time zone,
          source varchar(30) NOT NULL DEFAULT 'widget',
          reminder_sent_at timestamp with time zone,
          cancelled_at timestamp with time zone,
          cancellation_reason text,
          created_at timestamp with time zone NOT NULL DEFAULT NOW(),
          updated_at timestamp with time zone NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS reservations_org_scheduled_idx ON reservations (org_id, scheduled_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS reservations_org_status_idx    ON reservations (org_id, status)`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS reservation_settings (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id uuid NOT NULL UNIQUE,
          restaurant_enabled boolean NOT NULL DEFAULT false,
          service_enabled boolean NOT NULL DEFAULT false,
          restaurant_deposit_required boolean NOT NULL DEFAULT false,
          restaurant_deposit_cents integer NOT NULL DEFAULT 0,
          service_deposit_required boolean NOT NULL DEFAULT false,
          service_deposit_cents integer NOT NULL DEFAULT 0,
          slot_duration_minutes integer NOT NULL DEFAULT 30,
          advance_notice_minutes integer NOT NULL DEFAULT 60,
          max_party_size integer NOT NULL DEFAULT 12,
          confirmation_email_enabled boolean NOT NULL DEFAULT true,
          reminder_email_enabled boolean NOT NULL DEFAULT true,
          reminder_hours_before integer NOT NULL DEFAULT 24,
          created_at timestamp with time zone NOT NULL DEFAULT NOW(),
          updated_at timestamp with time zone NOT NULL DEFAULT NOW()
        )
      `);

      console.log('[integrations] schema migrations applied successfully');
      client.release();
      await pool.end();
      return;
    } catch (err) {
      lastErr = err;
      if (client) client.release();
      await pool.end();
      const isLast = attempt === MAX_ATTEMPTS;
      console.warn(
        `[integrations] migration attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        err instanceof Error ? err.message : err,
        isLast ? '— giving up.' : '— retrying.',
      );
      if (!isLast) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  console.error('[integrations] migration failed after retries — aborting startup:', lastErr);
  process.exit(1);
}

async function start() {
  await applyMigrations();
  await app.register(helmet);
  await app.register(cors, {
    origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
  // v2.7.81 — set sign.issuer + verify.allowedIss so internal tokens
  // we mint (and the ones we accept from auth/orders/etc.) all carry
  // the same issuer claim. Same fix applied to orders service in v2.7.81.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(jwt as any, {
    secret: jwtSecret,
    sign: { issuer: 'elevatedpos-auth' },
    verify: { allowedIss: 'elevatedpos-auth' },
  });

  app.decorate(
    'authenticate',
    async (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          type: 'https://elevatedpos.com/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
        });
      }
    },
  );

  // v2.7.48-univlog — universal audit middleware (system_audit_logs).
  // /stripe-webhook and similar webhook receive endpoints are intentionally
  // included so the merchant has forensics on Stripe state changes.
  await app.register(auditPlugin, { serviceName: 'integrations' });

  await app.register(appRoutes, { prefix: '/api/v1/integrations/apps' });
  await app.register(webhookRoutes, { prefix: '/api/v1/integrations/webhooks' });
  await app.register(connectorRoutes, { prefix: '/api/v1/connectors' });
  await app.register(connectRoutes, { prefix: '/api/v1' });
  await app.register(connectExtendedRoutes, { prefix: '/api/v1' });
  await app.register(stripeWebhookRoutes, { prefix: '/api/v1' });
  await app.register(terminalHardwareRoutes, { prefix: '/api/v1' });
  await app.register(platformIntegrationsRoutes, { prefix: '/api/v1' });
  await app.register(reservationsRoutes, { prefix: '/api/v1' });

  app.get('/health', async () => ({ status: 'ok', service: 'integrations' }));

  // Register onClose hook BEFORE listen() — Fastify throws if hooks added after server starts
  let stopRetryPoller: (() => void) | null = null;
  app.addHook('onClose', async () => {
    if (stopRetryPoller) stopRetryPoller();
  });

  const port = Number(process.env['PORT'] ?? 4010);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Integrations service listening on port ${port}`);

  // Start webhook retry poller (exponential backoff for failed deliveries)
  stopRetryPoller = startRetryPoller();
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
