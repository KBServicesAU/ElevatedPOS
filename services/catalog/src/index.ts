import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { getRedisClient } from '@nexus/config';
import { eq, and, desc, gte } from 'drizzle-orm';
import { productRoutes } from './routes/products';
import { categoryRoutes } from './routes/categories';
import { modifierRoutes } from './routes/modifiers';
import { priceListRoutes } from './routes/priceLists';
import { bundleRoutes } from './routes/bundles';
import { markdownRoutes } from './routes/markdowns';
import { recipeRoutes } from './routes/recipes';
import { wastageRoutes } from './routes/wastage';
import { searchRoutes } from './routes/search';
import { db, schema } from './db';
import { initCollections } from './lib/typesense';
import { registerGraphQL } from './graphql';

const app = Fastify({ logger: true, trustProxy: true });

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? true, credentials: true });
  await app.register(sensible);
  const redis = getRedisClient();
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: redis ?? undefined,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' }),
  });
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

  // Public polling endpoint registered BEFORE productRoutes plugin to ensure static path wins over /:id param
  // No auth required — used by KDS and web-backoffice to poll for availability changes every 30s
  app.get('/api/v1/products/availability-changes', async (request, reply) => {
    const q = request.query as { since?: string; orgId?: string };
    const targetOrgId = q.orgId;
    if (!targetOrgId) {
      return reply.status(400).send({ title: 'Bad Request', status: 400, detail: 'orgId query param is required' });
    }
    const since = q.since ? new Date(q.since) : new Date(Date.now() - 60_000);
    const products = await db.query.products.findMany({
      where: and(eq(schema.products.orgId, targetOrgId), gte(schema.products.updatedAt, since)),
      columns: { id: true, name: true, sku: true, isActive: true, updatedAt: true, orgId: true },
      orderBy: [desc(schema.products.updatedAt)],
      limit: 200,
    });
    return reply.status(200).send({
      data: products.map((p) => ({
        id: p.id, name: p.name, sku: p.sku, available: p.isActive, changedAt: p.updatedAt?.toISOString(),
      })),
      meta: { since: since.toISOString() },
    });
  });

  await app.register(productRoutes, { prefix: '/api/v1/products' });
  await app.register(categoryRoutes, { prefix: '/api/v1/categories' });
  await app.register(modifierRoutes, { prefix: '/api/v1/modifiers' });
  await app.register(priceListRoutes, { prefix: '/api/v1/price-lists' });
  await app.register(bundleRoutes, { prefix: '/api/v1/bundles' });
  await app.register(markdownRoutes, { prefix: '/api/v1/markdowns' });
  await app.register(recipeRoutes, { prefix: '/api/v1/recipes' });
  await app.register(wastageRoutes, { prefix: '/api/v1/wastage' });
  await app.register(searchRoutes, { prefix: '/api/v1/search' });

  await registerGraphQL(app);

  app.get('/health', async () => ({ status: 'ok', service: 'catalog' }));

  const port = Number(process.env['PORT'] ?? 4002);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Catalog service listening on port ${port}`);

  // Initialize Typesense collections (non-fatal if Typesense is down)
  try {
    await initCollections();
    app.log.info('Typesense collections initialized');
  } catch (err) {
    app.log.warn({ err }, 'Typesense unavailable — search will fall back to DB');
  }
}

start().catch((err) => { console.error(err); process.exit(1); });
