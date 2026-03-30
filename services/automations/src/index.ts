import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { automationRoutes } from './routes/automations.js';
import { startWorker } from './temporal/worker.js';
import { startEventConsumer } from './lib/eventConsumer.js';

const app = Fastify({ logger: true, trustProxy: true });

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
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
