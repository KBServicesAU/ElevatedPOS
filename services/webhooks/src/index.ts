import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { webhookRoutes } from './routes/webhooks';
import { ingestRoutes } from './routes/ingest';
import { stripeProxyRoutes } from './routes/stripe-proxy';
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
    origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
  await app.register(jwt, {
    secret: jwtSecret,
  });

  app.decorate(
    'authenticate',
    async (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          type: 'https://elevatedpos.com/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
        });
      }
    },
  );

  await app.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
  await app.register(stripeProxyRoutes, { prefix: '/api/v1' });
  await app.register(ingestRoutes);

  app.get('/health', async () => ({ status: 'ok', service: 'webhooks', timestamp: new Date().toISOString() }));

  // Register onClose hook BEFORE listen() — Fastify disallows hooks after server starts
  let pollerInterval: ReturnType<typeof setInterval> | null = null;
  app.addHook('onClose', async () => {
    if (pollerInterval) clearInterval(pollerInterval);
  });

  const port = Number(process.env['PORT'] ?? 4015);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Webhooks service listening on port ${port}`);

  // Poll every 30 seconds for pending/retrying deliveries
  pollerInterval = setInterval(() => {
    processDeliveries().catch((err) => {
      app.log.error({ err }, '[webhooks] delivery poller error');
    });
  }, 30_000);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
