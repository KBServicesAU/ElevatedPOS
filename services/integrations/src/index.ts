import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { appRoutes } from './routes/apps';
import { webhookRoutes } from './routes/webhooks';
import { connectorRoutes } from './routes/connectors';
import { connectRoutes } from './routes/connect';
import { connectExtendedRoutes } from './routes/connect-extended';
import { stripeWebhookRoutes } from './routes/stripe-webhook';
import { terminalHardwareRoutes } from './routes/terminal-hardware';
import { platformIntegrationsRoutes } from './routes/platform';
import { reservationsRoutes } from './routes/reservations';
import { startRetryPoller } from './lib/webhookDelivery';

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

  await app.register(appRoutes, { prefix: '/api/v1/integrations/apps' });
  await app.register(webhookRoutes, { prefix: '/api/v1/integrations/webhooks' });
  await app.register(connectorRoutes, { prefix: '/api/v1/connectors' });
  await app.register(connectRoutes, { prefix: '/api/v1' });
  await app.register(connectExtendedRoutes, { prefix: '/api/v1' });
  await app.register(stripeWebhookRoutes, { prefix: '/api/v1' });
  await app.register(terminalHardwareRoutes, { prefix: '/api/v1' });
  await app.register(platformIntegrationsRoutes, { prefix: '/api/v1' });
  await app.register(reservationsRoutes, { prefix: '/api/v1' });

  app.get('/health', async () => ({ status: 'ok', service: 'integrations' }));

  // Register onClose hook BEFORE listen() — Fastify throws if hooks added after server starts
  let stopRetryPoller: (() => void) | null = null;
  app.addHook('onClose', async () => {
    if (stopRetryPoller) stopRetryPoller();
  });

  const port = Number(process.env['PORT'] ?? 4010);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Integrations service listening on port ${port}`);

  // Start webhook retry poller (exponential backoff for failed deliveries)
  stopRetryPoller = startRetryPoller();
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
