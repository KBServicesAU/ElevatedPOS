import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { productRoutes } from './routes/products';
import { categoryRoutes } from './routes/categories';
import { modifierRoutes } from './routes/modifiers';
import { priceListRoutes } from './routes/priceLists';

const app = Fastify({ logger: true, trustProxy: true });

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? true, credentials: true });
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    verify: { issuer: 'nexus-auth' },
  });

  app.decorate('authenticate', async (request: Parameters<typeof app.authenticate>[0], reply: Parameters<typeof app.authenticate>[1]) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ type: 'https://nexus.app/errors/unauthorized', title: 'Unauthorized', status: 401 });
    }
  });

  await app.register(productRoutes, { prefix: '/api/v1/products' });
  await app.register(categoryRoutes, { prefix: '/api/v1/categories' });
  await app.register(modifierRoutes, { prefix: '/api/v1/modifiers' });
  await app.register(priceListRoutes, { prefix: '/api/v1/price-lists' });

  app.get('/health', async () => ({ status: 'ok', service: 'catalog' }));

  const port = Number(process.env['PORT'] ?? 4002);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Catalog service listening on port ${port}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
