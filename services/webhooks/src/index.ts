import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { webhookRoutes } from './routes/webhooks';
import { ingestRoutes } from './routes/ingest';
import { processDeliveries } from './lib/deliver';

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
    origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? true,
    credentials: true,
  });
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

  await app.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
  await app.register(ingestRoutes);

  app.get('/health', async () => ({ status: 'ok', service: 'webhooks', timestamp: new Date().toISOString() }));

  const port = Number(process.env['PORT'] ?? 4015);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Webhooks service listening on port ${port}`);

  // Poll every 30 seconds for pending/retrying deliveries
  const pollerInterval = setInterval(() => {
    processDeliveries().catch((err) => {
      app.log.error({ err }, '[webhooks] delivery poller error');
    });
  }, 30_000);

  app.addHook('onClose', async () => {
    clearInterval(pollerInterval);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
