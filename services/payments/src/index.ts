import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { getRedisClient } from '@nexus/config';
import { paymentRoutes } from './routes/payments';
import { paymentLinkRoutes } from './routes/paymentLinks';
import { bnplRoutes } from './routes/bnpl';
import { currencyRoutes } from './routes/currencies';

// Type augmentation — allows app.authenticate to be used as a preHandler
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}


const app = Fastify({ logger: true, trustProxy: true });

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  const redis = getRedisClient();
  await app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
    ...(redis ? { redis } : {}),
    keyGenerator: (req) => req.ip,
    skip: (req: import('fastify').FastifyRequest) => req.url === '/health',
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' }),
  });
  await app.register(jwt, { secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production', verify: { allowedIss: 'elevatedpos-auth' } });
  app.decorate('authenticate', async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    try { await request.jwtVerify(); } catch { return reply.status(401).send({ title: 'Unauthorized', status: 401 }); }
  });
  await app.register(paymentRoutes, { prefix: '/api/v1/payments' });
  await app.register(paymentLinkRoutes, { prefix: '/api/v1/payment-links' });
  await app.register(bnplRoutes, { prefix: '/api/v1/bnpl' });
  // Currency routes are public (no auth) — registered last to avoid conflicting with auth decorator
  await app.register(currencyRoutes, { prefix: '/api/v1/currencies' });
  app.get('/health', async () => ({ status: 'ok', service: 'payments' }));
  const port = Number(process.env['PORT'] ?? 4005);
  await app.listen({ port, host: '0.0.0.0' });
}

start().catch((err) => { console.error(err); process.exit(1); });
