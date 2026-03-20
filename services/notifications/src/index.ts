import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { notificationRoutes } from './routes/notifications.js';
import { startConsumer, stopConsumer } from './lib/kafka.js';

const app = Fastify({ logger: true, trustProxy: true });

async function handleEvent(topic: string, payload: Record<string, unknown>): Promise<void> {
  app.log.info({ topic, payload }, '[notifications] Processing event');

  // Route events to the appropriate notification dispatch logic
  switch (topic) {
    case 'order.created':
      // e.g. send order confirmation email to customer
      app.log.info({ orderId: payload['id'] }, '[notifications] Order created — queuing confirmation');
      break;
    case 'order.completed':
      app.log.info({ orderId: payload['id'] }, '[notifications] Order completed — queuing receipt');
      break;
    case 'order.cancelled':
      app.log.info({ orderId: payload['id'] }, '[notifications] Order cancelled — queuing cancellation notice');
      break;
    case 'payment.captured':
      app.log.info({ paymentId: payload['id'] }, '[notifications] Payment captured — queuing receipt');
      break;
    case 'payment.failed':
      app.log.info({ paymentId: payload['id'] }, '[notifications] Payment failed — queuing failure alert');
      break;
    case 'customer.created':
      app.log.info({ customerId: payload['id'] }, '[notifications] New customer — queuing welcome email');
      break;
    case 'loyalty.tier_changed':
      app.log.info({ accountId: payload['accountId'] }, '[notifications] Tier changed — queuing congratulations');
      break;
    case 'inventory.low_stock':
      app.log.info({ productId: payload['productId'] }, '[notifications] Low stock — alerting staff');
      break;
    default:
      app.log.warn({ topic }, '[notifications] Unknown event topic');
  }
}

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

  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });

  app.get('/health', async () => ({ status: 'ok', service: 'notifications' }));

  const port = Number(process.env['PORT'] ?? 4009);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Notifications service listening on port ${port}`);

  // Start Kafka consumer after HTTP server is up
  if (process.env['KAFKA_BROKERS']) {
    await startConsumer(handleEvent);
  } else {
    app.log.warn('[notifications] KAFKA_BROKERS not set — consumer not started');
  }

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
