import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { getRedisClient } from '@nexus/config';
import { programRoutes } from './routes/programs.js';
import { accountRoutes } from './routes/accounts.js';
import { membershipRoutes } from './routes/memberships.js';
import { stampRoutes } from './routes/stamps.js';
import { multiplierEventRoutes } from './routes/multiplierEvents.js';
import { startConsumers } from './consumers/index.js';

const app = Fastify({ logger: true, trustProxy: true });

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
  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    verify: { issuer: 'nexus-auth' },
  });

  app.decorate(
    'authenticate',
    async (
      request: Parameters<typeof app.authenticate>[0],
      reply: Parameters<typeof app.authenticate>[1],
    ) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          type: 'https://nexus.app/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
        });
      }
    },
  );

  await app.register(programRoutes, { prefix: '/api/v1/loyalty/programs' });
  await app.register(accountRoutes, { prefix: '/api/v1/loyalty/accounts' });
  await app.register(membershipRoutes, { prefix: '/api/v1/memberships' });
  await app.register(stampRoutes, { prefix: '/api/v1/loyalty/stamps' });
  await app.register(multiplierEventRoutes, { prefix: '/api/v1/loyalty/multiplier-events' });

  app.get('/health', async () => ({ status: 'ok', service: 'loyalty' }));

  const port = Number(process.env['PORT'] ?? 4007);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Loyalty service listening on port ${port}`);

  // Start Kafka consumers after HTTP server is up
  await startConsumers();
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
