import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { automationRoutes } from './routes/automations.js';
import { startWorker } from './temporal/worker.js';
import { startEventConsumer } from './lib/eventConsumer.js';

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
    verify: { issuer: 'elevatedpos-auth' },
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

  await app.register(automationRoutes, { prefix: '/api/v1/automations' });

  app.get('/health', async () => ({ status: 'ok', service: 'automations' }));

  const port = Number(process.env['PORT'] ?? 4011);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Automations service listening on port ${port}`);

  // Start Temporal worker (fire-and-forget; gracefully degrades if Temporal unavailable)
  startWorker().catch((err: unknown) => {
    app.log.warn({ err }, 'Temporal worker failed to start — continuing without worker');
  });

  // Start Kafka event consumer (fire-and-forget; gracefully degrades if Kafka unavailable)
  startEventConsumer().catch((err: unknown) => {
    app.log.warn({ err }, 'Kafka event consumer failed to start — continuing without consumer');
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
