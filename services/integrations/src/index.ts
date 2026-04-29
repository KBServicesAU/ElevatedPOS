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
