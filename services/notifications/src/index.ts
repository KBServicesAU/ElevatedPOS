import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import { notificationRoutes } from './routes/notifications.js';

const app = Fastify({ logger: true, trustProxy: true });

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
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

  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });

  app.get('/health', async () => ({ status: 'ok', service: 'notifications' }));

  const port = Number(process.env['PORT'] ?? 4009);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Notifications service listening on port ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
