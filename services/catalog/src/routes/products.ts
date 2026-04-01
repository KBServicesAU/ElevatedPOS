import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, gte, ilike, or, arrayContains } from 'drizzle-orm';
import { db, schema } from '../db';
import { searchProducts, indexProduct, deleteProductFromIndex } from '../lib/typesense';
import { getCached, setCached, invalidateCache } from '../lib/cache';

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  taxClassId: z.string().uuid().optional(),
  productType: z.enum(['standard', 'variant', 'kit', 'service']).default('standard'),
  sku: z.string().min(1).max(100),
  barcodes: z.array(z.string()).default([]),
  basePrice: z.number().min(0),
  costPrice: z.number().min(0).default(0),
  isSoldOnline: z.boolean().default(false),
  isSoldInstore: z.boolean().default(true),
  trackStock: z.boolean().default(true),
  reorderPoint: z.number().int().min(0).default(0),
  reorderQuantity: z.number().int().min(0).default(0),
  ageRestricted: z.boolean().default(false),
  ageRestrictionMinimum: z.number().int().optional(),
  weightBased: z.boolean().default(false),
  pluCode: z.string().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export async function productRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/products/search — dedicated Typesense-powered search endpoint
  app.get('/search', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { q?: string; limit?: string; categoryId?: string; isActive?: string };
    const limit = Math.min(Number(q.limit ?? 20), 100);
    const query = q.q ?? '';

    // Try Typesense first
    const tsResults = await searchProducts(orgId, query, {
      limit,
      categoryId: q.categoryId,
      isActive: q.isActive !== undefined ? q.isActive === 'true' : undefined,
    });

    if (tsResults !== null) {
      return reply.status(200).send({ data: tsResults, meta: { totalCount: tsResults.length, source: 'typesense' } });
    }

    // Typesense unavailable — fall back to DB
    const products = await db.query.products.findMany({
      where: and(
        eq(schema.products.orgId, orgId),
        q.isActive !== undefined ? eq(schema.products.isActive, q.isActive === 'true') : undefined,
        q.categoryId ? eq(schema.products.categoryId, q.categoryId) : undefined,
        query ? or(
          ilike(schema.products.name, `%${query}%`),
          ilike(schema.products.sku, `%${query}%`),
        ) : undefined,
      ),
      with: { category: true, taxClass: true, variants: true },
      orderBy: [desc(schema.products.updatedAt)],
      limit,
    });

    return reply.status(200).send({ data: products, meta: { totalCount: products.length, source: 'db' } });
  });

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { search?: string; q?: string; categoryId?: string; isActive?: string; limit?: string; cursor?: string; channel?: string };

    const limit = Math.min(Number(q.limit ?? 50), 200);
    const query = q.q ?? q.search;

    // Build channel filter: when channel param is present, require that channel in the array
    const channelFilter = q.channel
      ? arrayContains(schema.products.channels, [q.channel])
      : undefined;

    // If q/search present, try Typesense first
    if (query) {
      const tsResults = await searchProducts(orgId, query, {
        limit,
        categoryId: q.categoryId,
        isActive: q.isActive !== undefined ? q.isActive === 'true' : undefined,
      });

      if (tsResults !== null) {
        // Filter by channel in-memory when Typesense returns results
        const channelFiltered = q.channel
          ? tsResults.filter((p: { channels?: string[] }) => Array.isArray(p.channels) && p.channels.includes(q.channel!))
          : tsResults;
        return reply.status(200).send({ data: channelFiltered, meta: { totalCount: channelFiltered.length, hasMore: channelFiltered.length === limit, source: 'typesense' } });
      }

      // Typesense unavailable — fall back to DB with ILIKE
      const products = await db.query.products.findMany({
        where: and(
          eq(schema.products.orgId, orgId),
          q.isActive !== undefined ? eq(schema.products.isActive, q.isActive === 'true') : undefined,
          q.categoryId ? eq(schema.products.categoryId, q.categoryId) : undefined,
          channelFilter,
        ),
        with: { category: true, taxClass: true, variants: true },
        orderBy: [desc(schema.products.updatedAt)],
        limit,
      });

      const filtered = products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.sku.toLowerCase().includes(query.toLowerCase()) ||
          (p.barcodes as string[]).some((b) => b.includes(query)),
      );

      return reply.status(200).send({ data: filtered, meta: { totalCount: filtered.length, hasMore: filtered.length === limit, source: 'db' } });
    }

    // No search query — standard list (cache only when no filters applied)
    const cacheKey = `products:${orgId}:list`;
    const useCache = !q.isActive && !q.categoryId && !q.channel && limit === 50;

    if (useCache) {
      const cached = await getCached<typeof products>(cacheKey);
      if (cached) {
        return reply.status(200).send({ data: cached, meta: { totalCount: cached.length, hasMore: cached.length === limit, source: 'cache' } });
      }
    }

    const products = await db.query.products.findMany({
      where: and(
        eq(schema.products.orgId, orgId),
        q.isActive !== undefined ? eq(schema.products.isActive, q.isActive === 'true') : undefined,
        q.categoryId ? eq(schema.products.categoryId, q.categoryId) : undefined,
        channelFilter,
      ),
      with: { category: true, taxClass: true, variants: true },
      orderBy: [desc(schema.products.updatedAt)],
      limit,
    });

    if (useCache) {
      await setCached(cacheKey, products);
    }

    return reply.status(200).send({ data: products, meta: { totalCount: products.length, hasMore: products.length === limit } });
  });

  // GET /api/v1/products/barcode/:barcode
  app.get('/barcode/:barcode', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ barcode: z.string() }),
    }
  }, async (request, reply) => {
    const { barcode } = request.params;
    const { orgId } = request.user;

    // Search in barcodes array (it's stored as jsonb/text array)
    const products = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.orgId, orgId),
          eq(schema.products.isActive, true)
        )
      );

    const product = products.find(p =>
      Array.isArray(p.barcodes) && (p.barcodes as string[]).includes(barcode)
    );

    if (!product) {
      return reply.code(404).send({ error: 'Product not found', barcode });
    }

    return reply.send({ data: product });
  });

  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const product = await db.query.products.findFirst({
      where: and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)),
      with: { category: true, taxClass: true, variants: true, modifierGroups: { with: { group: { with: { options: true } } } } },
    });

    if (!product) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: product });
  });

  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createProductSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

    const [created] = await db.insert(schema.products).values({ ...body.data, orgId }).returning();

    // Index in Typesense — fire-and-forget (non-fatal)
    indexProduct({
      id: created.id,
      orgId: created.orgId,
      name: created.name,
      description: created.description ?? undefined,
      sku: created.sku,
      barcodes: (created.barcodes as string[]) ?? [],
      categoryId: created.categoryId ?? undefined,
      basePrice: Number(created.basePrice),
      isActive: created.isActive,
      tags: (created.tags as string[]) ?? [],
    }).catch((err) => console.error('Typesense indexProduct (create) failed:', err));

    // Invalidate list cache for this org
    await invalidateCache(`products:${orgId}:*`);

    return reply.status(201).send({ data: created });
  });

  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = createProductSchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422 });

    const existing = await db.query.products.findFirst({ where: and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)) });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const [updated] = await db.update(schema.products).set({ ...body.data, updatedAt: new Date() }).where(and(eq(schema.products.id, id), eq(schema.products.orgId, orgId))).returning();

    // Re-index in Typesense — fire-and-forget (non-fatal)
    indexProduct({
      id: updated.id,
      orgId: updated.orgId,
      name: updated.name,
      description: updated.description ?? undefined,
      sku: updated.sku,
      barcodes: (updated.barcodes as string[]) ?? [],
      categoryId: updated.categoryId ?? undefined,
      basePrice: Number(updated.basePrice),
      isActive: updated.isActive,
      tags: (updated.tags as string[]) ?? [],
    }).catch((err) => console.error('Typesense indexProduct (update) failed:', err));

    // Invalidate list cache for this org
    await invalidateCache(`products:${orgId}:*`);

    return reply.status(200).send({ data: updated });
  });

  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db.update(schema.products).set({ isActive: false, updatedAt: new Date() }).where(and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)));
    // Remove from Typesense index — fire-and-forget (non-fatal)
    deleteProductFromIndex(id).catch((err) => console.error('Typesense deleteProductFromIndex failed:', err));
    // Invalidate list cache for this org
    await invalidateCache(`products:${orgId}:*`);
    return reply.status(204).send();
  });

  // POST /api/v1/products/:id/availability — 86 or restore a product
  app.post('/:id/availability', { onRequest: [app.authenticate] } as Parameters<typeof app.post>[1], async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const bodySchema = z.object({
      available: z.boolean(),
      reason: z.string().optional(),
      restoreAt: z.string().datetime({ offset: true }).optional(),
    });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

    const existing = await db.query.products.findFirst({ where: and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)) });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const [updated] = await db
      .update(schema.products)
      .set({
        isActive: body.data.available,
        updatedAt: new Date(),
        ...(body.data.reason !== undefined ? { notes: body.data.reason } : {}),
      })
      .where(and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)))
      .returning();

    return reply.status(200).send({
      data: {
        ...updated,
        availabilityChangedAt: new Date().toISOString(),
        available: body.data.available,
        reason: body.data.reason,
        restoreAt: body.data.restoreAt,
      },
    });
  });

  // NOTE: GET /api/v1/products/availability-changes is registered at the top level in index.ts
  // as a public (no-auth) endpoint. Do not add it here in the authenticated plugin.
}
