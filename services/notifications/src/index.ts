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
import auditPlugin from '@nexus/fastify-audit';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(jwt as any, {
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

  // v2.7.48-univlog — universal audit middleware (system_audit_logs).
  await app.register(auditPlugin, { serviceName: 'notifications' });

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
