import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
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

async function start() {
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
  await app.register(jwt, { secret: jwtSecret, verify: { allowedIss: 'elevatedpos-auth' } });
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
