import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { getRedisClient } from '@nexus/config';
import { z } from 'zod';
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
import { variantRoutes } from './routes/variants';
import { promoCodeRoutes } from './routes/promoCodes';
import { db, schema } from './db';
import { initCollections } from './lib/typesense';
import { registerGraphQL } from './graphql';
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
  const redis = getRedisClient();
  await app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
    redis: redis ?? undefined,
    keyGenerator: (req) => req.ip,
    allowList: (req: import('fastify').FastifyRequest) => req.url === '/health',
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' }),
  });
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
  await app.register(jwt, {
    secret: jwtSecret,
  });

  app.decorate('authenticate', async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ type: 'https://elevatedpos.com/errors/unauthorized', title: 'Unauthorized', status: 401 });
    }
  });

  // v2.7.48-univlog — universal audit middleware (system_audit_logs).
  await app.register(auditPlugin, { serviceName: 'catalog' });

  // Public polling endpoint registered BEFORE productRoutes plugin to ensure static path wins over /:id param
  // No auth required — used by KDS and web-backoffice to poll for availability changes every 30s
  // Dual-registered at /api/v1/catalog/products/... for API-gateway prefix forwarding
  app.get('/api/v1/catalog/products/availability-changes', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const q = request.query as { since?: string; orgId?: string };
    const orgIdValidation = z.string().uuid().safeParse(q.orgId);
    if (!orgIdValidation.success) {
      return reply.status(400).send({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'orgId must be a valid UUID.' });
    }
    const targetOrgId = orgIdValidation.data;
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
  app.get('/api/v1/products/availability-changes', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const q = request.query as { since?: string; orgId?: string };
    const orgIdValidation = z.string().uuid().safeParse(q.orgId);
    if (!orgIdValidation.success) {
      return reply.status(400).send({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'orgId must be a valid UUID.' });
    }
    const targetOrgId = orgIdValidation.data;
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

  // Public storefront endpoints — no auth required.
  // Registered BEFORE productRoutes so static paths win over the /:id catch-all.

  // Single product lookup by webSlug or UUID — used by product detail pages
  // Dual-registered at /api/v1/catalog/products/... for API-gateway prefix forwarding
  app.get('/api/v1/catalog/products/storefront/:slugOrId', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { slugOrId } = request.params as { slugOrId: string };
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    const row = await db.query.products.findFirst({
      where: isUuid
        ? eq(schema.products.id, slugOrId)
        : eq(schema.products.webSlug, slugOrId),
      with: { category: { columns: { id: true, name: true } } },
    });
    if (!row || !row.isActive) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send(row);
  });
  app.get('/api/v1/products/storefront/:slugOrId', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { slugOrId } = request.params as { slugOrId: string };
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    const row = await db.query.products.findFirst({
      where: isUuid
        ? eq(schema.products.id, slugOrId)
        : eq(schema.products.webSlug, slugOrId),
      with: { category: { columns: { id: true, name: true } } },
    });
    if (!row || !row.isActive) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send(row);
  });

  // Product list for a given org filtered to web-active products
  // Dual-registered at /api/v1/catalog/products/... for API-gateway prefix forwarding
  app.get('/api/v1/catalog/products/storefront', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const q = request.query as { orgId?: string };
    const orgIdValidation = z.string().uuid().safeParse(q.orgId);
    if (!orgIdValidation.success) {
      return reply.status(400).send({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'orgId must be a valid UUID.' });
    }
    const orgId = orgIdValidation.data;
    const rows = await db.query.products.findMany({
      where: and(
        eq(schema.products.orgId, orgId),
        eq(schema.products.isActive, true),
      ),
      with: { category: { columns: { id: true, name: true } } },
      orderBy: [desc(schema.products.webSortOrder), desc(schema.products.createdAt)],
      limit: 200,
    });
    const webProducts = rows.filter((p) =>
      Array.isArray(p.channels) && (p.channels.includes('web') || p.channels.includes('both'))
    );
    return reply.status(200).send({ products: webProducts });
  });
  app.get('/api/v1/products/storefront', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const q = request.query as { orgId?: string };
    const orgIdValidation = z.string().uuid().safeParse(q.orgId);
    if (!orgIdValidation.success) {
      return reply.status(400).send({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'orgId must be a valid UUID.' });
    }
    const orgId = orgIdValidation.data;
    const rows = await db.query.products.findMany({
      where: and(
        eq(schema.products.orgId, orgId),
        eq(schema.products.isActive, true),
      ),
      with: { category: { columns: { id: true, name: true } } },
      orderBy: [desc(schema.products.webSortOrder), desc(schema.products.createdAt)],
      limit: 200,
    });
    // Filter to web-enabled products in application code (array-contains is DB-specific)
    const webProducts = rows.filter((p) =>
      Array.isArray(p.channels) && (p.channels.includes('web') || p.channels.includes('both'))
    );
    return reply.status(200).send({ products: webProducts });
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
  await app.register(variantRoutes, { prefix: '/api/v1' });
  await app.register(promoCodeRoutes, { prefix: '/api/v1/promo-codes' });

  // ── Gateway-prefixed duplicates (/api/v1/catalog/xxx) ──────────────
  // The API gateway ingress forwards /api/v1/catalog/* to this service
  // WITHOUT path rewriting, so the full path arrives here as-is.
  // Registering both prefix forms lets direct calls AND gateway-proxied
  // calls work without any nginx rewrite-target configuration.
  await app.register(productRoutes, { prefix: '/api/v1/catalog/products' });
  await app.register(categoryRoutes, { prefix: '/api/v1/catalog/categories' });
  await app.register(modifierRoutes, { prefix: '/api/v1/catalog/modifiers' });
  await app.register(priceListRoutes, { prefix: '/api/v1/catalog/price-lists' });
  await app.register(bundleRoutes, { prefix: '/api/v1/catalog/bundles' });
  await app.register(markdownRoutes, { prefix: '/api/v1/catalog/markdowns' });
  await app.register(recipeRoutes, { prefix: '/api/v1/catalog/recipes' });
  await app.register(wastageRoutes, { prefix: '/api/v1/catalog/wastage' });
  await app.register(searchRoutes, { prefix: '/api/v1/catalog/search' });
  await app.register(variantRoutes, { prefix: '/api/v1/catalog' });
  await app.register(promoCodeRoutes, { prefix: '/api/v1/catalog/promo-codes' });

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
