import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { franchiseRoutes } from './routes/franchise.js';
import { policyRoutes } from './routes/policies.js';
import { royaltyRoutes } from './routes/royalties.js';
import { complianceRoutes } from './routes/compliance.js';

const app = Fastify({ logger: true, trustProxy: true });

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    verify: { issuer: 'elevatedpos-auth' },
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

  await app.register(franchiseRoutes, { prefix: '/api/v1/franchise' });
  await app.register(policyRoutes, { prefix: '/api/v1/franchise' });
  await app.register(royaltyRoutes, { prefix: '/api/v1/franchise' });
  await app.register(complianceRoutes, { prefix: '/api/v1/franchise' });

  app.get('/health', async () => ({ status: 'ok', service: 'franchise' }));

  const port = Number(process.env['PORT'] ?? 4013);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Franchise service listening on port ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
