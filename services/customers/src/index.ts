import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { getRedisClient } from '@nexus/config';
import { customerRoutes } from './routes/customers';
import { rfmRoutes } from './routes/rfm';
import { crmRoutes } from './routes/crm';
import { gdprRoutes } from './routes/gdpr';

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
    max: 100,
    timeWindow: '1 minute',
    ...(redis ? { redis } : {}),
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' }),
  });
  await app.register(jwt, { secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production', verify: { allowedIss: 'elevatedpos-auth' } });
  app.decorate('authenticate', async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    try { await request.jwtVerify(); } catch { return reply.status(401).send({ title: 'Unauthorized', status: 401 }); }
  });
  await app.register(customerRoutes, { prefix: '/api/v1/customers' });
  await app.register(rfmRoutes, { prefix: '/api/v1/customers' });
  await app.register(crmRoutes, { prefix: '/api/v1/crm' });
  await app.register(gdprRoutes, { prefix: '/api/v1/customers' });
  app.get('/health', async () => ({ status: 'ok', service: 'customers' }));
  const port = Number(process.env['PORT'] ?? 4006);
  await app.listen({ port, host: '0.0.0.0' });
}

start().catch((err) => { console.error(err); process.exit(1); });
