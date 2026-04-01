import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { campaignRoutes } from './routes/campaigns.js';
import { segmentRoutes } from './routes/segments.js';
import { templateRoutes } from './routes/templates.js';
import { startConsumers } from './consumers/index.js';

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
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
  });

  app.decorate(
    'authenticate',
    async (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => {
      try {
        await request.jwtVerify({ issuer: 'elevatedpos-auth' });
      } catch {
        return reply.status(401).send({
          type: 'https://nexus.app/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
        });
      }
    },
  );

  await app.register(campaignRoutes, { prefix: '/api/v1/campaigns' });
  await app.register(segmentRoutes, { prefix: '/api/v1/segments' });
  await app.register(templateRoutes, { prefix: '/api/v1/templates' });

  app.get('/health', async () => ({ status: 'ok', service: 'campaigns' }));

  const port = Number(process.env['PORT'] ?? 4008);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Campaigns service listening on port ${port}`);

  // Start Kafka consumers after HTTP server is up
  await startConsumers();
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
