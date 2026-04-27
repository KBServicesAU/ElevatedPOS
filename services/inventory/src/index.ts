import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { stockRoutes } from './routes/stock';
import { supplierRoutes } from './routes/suppliers';
import { purchaseOrderRoutes } from './routes/purchaseOrders';
import { transferRoutes } from './routes/transfers';
import { serialTrackingRoutes } from './routes/serialTracking';
import { lotTrackingRoutes } from './routes/lotTracking';
import { stocktakeRoutes } from './routes/stocktakes';
import { startConsumers } from './consumers';
import auditPlugin from '@nexus/fastify-audit';

// Type augmentation — allows app.authenticate to be used as a preHandler
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}


const app = Fastify({ logger: true, trustProxy: true });

async function start() {
  await app.register(helmet);
  await app.register(cors, {
    origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
  await app.register(jwt, { secret: jwtSecret, verify: { allowedIss: 'elevatedpos-auth' } });

  app.decorate('authenticate', async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    try { await request.jwtVerify(); } catch { return reply.status(401).send({ title: 'Unauthorized', status: 401 }); }
  });

  // v2.7.48-univlog — universal audit middleware (system_audit_logs).
  await app.register(auditPlugin, { serviceName: 'inventory' });

  await app.register(stockRoutes, { prefix: '/api/v1/stock' });
  await app.register(supplierRoutes, { prefix: '/api/v1/suppliers' });
  await app.register(purchaseOrderRoutes, { prefix: '/api/v1/purchase-orders' });
  await app.register(transferRoutes, { prefix: '/api/v1/transfers' });
  await app.register(serialTrackingRoutes, { prefix: '/api/v1/serials' });
  await app.register(lotTrackingRoutes, { prefix: '/api/v1/lots' });
  await app.register(stocktakeRoutes, { prefix: '/api/v1/stocktakes' });

  app.get('/health', async () => ({ status: 'ok', service: 'inventory' }));
  const port = Number(process.env['PORT'] ?? 4003);
  await app.listen({ port, host: '0.0.0.0' });

  // Start Kafka consumers after HTTP server is up
  await startConsumers();
}

start().catch((err) => { console.error(err); process.exit(1); });
