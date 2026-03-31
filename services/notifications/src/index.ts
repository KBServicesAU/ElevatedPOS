import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { notificationRoutes } from './routes/notifications.js';
import { emailRoutes } from './routes/email.js';
import { smsRoutes } from './routes/sms.js';
import { pushRoutes } from './routes/push.js';
import { logsRoutes } from './routes/logs.js';
import { deviceRoutes } from './routes/devices.js';
import { stopConsumer } from './lib/kafka.js';
import { startConsumers } from './consumers/index.js';

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

  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await app.register(emailRoutes, { prefix: '/api/v1/notifications/email' });
  await app.register(smsRoutes, { prefix: '/api/v1/notifications/sms' });
  await app.register(pushRoutes, { prefix: '/api/v1/notifications/push' });
  await app.register(logsRoutes, { prefix: '/api/v1/notifications/logs' });
  await app.register(deviceRoutes, { prefix: '/api/v1/notifications/devices' });

  app.get('/health', async () => ({ status: 'ok', service: 'notifications' }));

  const port = Number(process.env['PORT'] ?? 4009);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Notifications service listening on port ${port}`);

  // Start Kafka consumers after HTTP server is up
  await startConsumers();

  // Graceful shutdown
  const shutdown = async () => {
    await stopConsumer();
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
