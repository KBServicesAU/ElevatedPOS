import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { getRedisClient } from '@nexus/config';
import type { WebSocket } from 'ws';
import { orderRoutes } from './routes/orders';
import { kdsRoutes } from './routes/kds';
import { laybyRoutes } from './routes/laybys';
import { giftCardRoutes } from './routes/giftCards';
import { quoteRoutes } from './routes/quotes';
import { fulfillmentRoutes } from './routes/fulfillment';

const app = Fastify({ logger: true, trustProxy: true });

// In-memory KDS connection registry: locationId -> Set of WebSocket clients
export const kdsConnections = new Map<string, Set<WebSocket>>();

export function broadcastToKDS(locationId: string, payload: Record<string, unknown>): void {
  const clients = kdsConnections.get(locationId);
  if (!clients || clients.size === 0) return;
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(message);
    }
  }
}

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  const redis = getRedisClient();
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: redis ?? undefined,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' }),
  });
  await app.register(jwt, { secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production', verify: { issuer: 'elevatedpos-auth' } });
  await app.register(websocket);

  app.decorate('authenticate', async (request: Parameters<typeof app.authenticate>[0], reply: Parameters<typeof app.authenticate>[1]) => {
    try { await request.jwtVerify(); } catch { return reply.status(401).send({ title: 'Unauthorized', status: 401 }); }
  });

  await app.register(orderRoutes, { prefix: '/api/v1/orders' });
  await app.register(kdsRoutes, { prefix: '/api/v1/kds' });
  await app.register(laybyRoutes, { prefix: '/api/v1/laybys' });
  await app.register(giftCardRoutes, { prefix: '/api/v1/gift-cards' });
  await app.register(quoteRoutes, { prefix: '/api/v1/quotes' });
  await app.register(fulfillmentRoutes, { prefix: '/api/v1/fulfillment' });

  app.get('/health', async () => ({ status: 'ok', service: 'orders' }));
  const port = Number(process.env['PORT'] ?? 4004);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Orders service listening on port ${port}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
