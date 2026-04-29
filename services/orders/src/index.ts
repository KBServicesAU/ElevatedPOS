import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { Pool } from 'pg';
import { getRedisClient } from '@nexus/config';
import { orderRoutes } from './routes/orders';
import { kdsRoutes } from './routes/kds';
import { laybyRoutes } from './routes/laybys';
import { giftCardRoutes } from './routes/giftCards';
import { quoteRoutes } from './routes/quotes';
import { fulfillmentRoutes } from './routes/fulfillment';
import {
  terminalTransactionRoutes,
  godmodeTerminalTransactionRoutes,
} from './routes/terminalTransactions';
import auditPlugin from '@nexus/fastify-audit';

// Type augmentation — allows app.authenticate to be used as a preHandler
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}


const app = Fastify({ logger: true, trustProxy: true });

// Minimal interface for a raw WebSocket connection
interface RawWS {
  readyState: number;
  send(data: string): void;
}

// In-memory KDS connection registry: locationId -> Set of raw WebSocket clients
export const kdsConnections = new Map<string, Set<RawWS>>();

export function broadcastToKDS(locationId: string, payload: Record<string, unknown>): void {
  // v2.7.44 — hardened against a misbehaving WebSocket throwing inside
  // `ws.send`. Previously this could synchronously throw out of POST
  // /:id/complete *after* the DB had marked the order completed, causing
  // the route to 500 even though the work was done. Mobile retries would
  // then see a 409 (already completed), which we already treat as
  // success — but per-call try/catch around send is cheap insurance.
  const clients = kdsConnections.get(locationId);
  if (!clients || clients.size === 0) return;
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(message);
      } catch (err) {
        // Single misbehaving client must not abort the whole broadcast or
        // (worse) propagate up the synchronous call chain to a request
        // handler.
        console.error('[orders] KDS broadcast send failed for', locationId, err);
      }
    }
  }
}

/**
 * v2.7.77 — Apply ad-hoc schema changes idempotently before serving traffic.
 * Mirrors the pattern in services/auth/src/index.ts. Required so the
 * idempotency-key column + unique index land on every prod pod
 * regardless of whether `drizzle-kit push` was run during deploy.
 */
async function applyMigrations(): Promise<void> {
  // v2.7.82 — retry the migration up to 5× with backoff before giving
  // up. Pods that boot before Postgres is ready (typical during a
  // rolling deploy where the DB pod restarts at the same time) used
  // to crash-loop on the very first connect, which timed out the
  // Helm rollout. Retrying lets the pod ride out transient blips.
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
      // v2.7.77 — idempotency key for /orders POST.
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key varchar(100)`);
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS orders_org_idempotency_key_unique
          ON orders (org_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL`,
      );
      console.log('[orders] schema migrations applied successfully');
      client.release();
      await pool.end();
      return;
    } catch (err) {
      lastErr = err;
      if (client) client.release();
      await pool.end();
      const isLast = attempt === MAX_ATTEMPTS;
      console.warn(
        `[orders] migration attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        err instanceof Error ? err.message : err,
        isLast ? '— giving up.' : '— retrying.',
      );
      if (!isLast) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  console.error('[orders] migration failed after retries — aborting startup:', lastErr);
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
  const redis = getRedisClient();
  await app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
    redis: redis ?? undefined,
    keyGenerator: (req) => req.ip,
    allowList: (req: import('fastify').FastifyRequest) => req.url === '/health',
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' }),
  });
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
  // v2.7.81 — set sign.issuer too. Without it, internal-token mints
  // (e.g. /orders/:id/send-receipt minting a system token to call the
  // notifications service) sign tokens with no `iss` claim — and the
  // notifications service's `verify: { issuer: 'elevatedpos-auth' }`
  // rejects them, surfacing as the merchant's "Failed to send receipt
  // — HTTP 502". Setting sign.issuer makes every app.jwt.sign() output
  // include `iss: 'elevatedpos-auth'` automatically. Cast matches the
  // pattern used in auth service — @fastify/jwt's TS types omit
  // `issuer` from SignOptions even though it's a documented option.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(jwt as any, {
    secret: jwtSecret,
    sign: { issuer: 'elevatedpos-auth' },
    verify: { allowedIss: 'elevatedpos-auth' },
  });
  await app.register(websocket);

  app.decorate('authenticate', async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    try { await request.jwtVerify(); } catch { return reply.status(401).send({ title: 'Unauthorized', status: 401 }); }
  });

  // v2.7.48-univlog — universal audit middleware. Captures every
  // POST/PATCH/PUT/DELETE response into system_audit_logs (Godmode + org
  // dashboard "Activity" tab). Registered AFTER jwt so request.user is
  // populated when the onResponse hook runs. Errors are swallowed inside
  // the plugin so audit blips never break a sale.
  await app.register(auditPlugin, {
    serviceName: 'orders',
    entityFromUrl: (url, body) => {
      // POST /api/v1/orders/:id/complete → entity: order, id: :id
      const m = url.match(/\/api\/v1\/orders\/([0-9a-f-]{36})\/(complete|hold|cancel|refund)/i);
      if (m) return { entityType: 'order', entityId: m[1] };
      const b = (body as { id?: string; orderNumber?: string } | null) ?? null;
      if (url.startsWith('/api/v1/orders')) {
        return {
          entityType: 'order',
          entityId: b?.id,
          entityName: b?.orderNumber,
        };
      }
      return null;
    },
  });

  await app.register(orderRoutes, { prefix: '/api/v1/orders' });
  await app.register(kdsRoutes, { prefix: '/api/v1/kds' });
  await app.register(laybyRoutes, { prefix: '/api/v1/laybys' });
  await app.register(giftCardRoutes, { prefix: '/api/v1/gift-cards' });
  await app.register(quoteRoutes, { prefix: '/api/v1/quotes' });
  await app.register(fulfillmentRoutes, { prefix: '/api/v1/fulfillment' });
  await app.register(terminalTransactionRoutes, { prefix: '/api/v1/terminal/transactions' });
  await app.register(godmodeTerminalTransactionRoutes, { prefix: '/api/v1/godmode/terminal/transactions' });

  app.get('/health', async () => ({ status: 'ok', service: 'orders' }));
  const port = Number(process.env['PORT'] ?? 4004);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Orders service listening on port ${port}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
