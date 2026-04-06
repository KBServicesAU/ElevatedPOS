import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, ilike, or, arrayContains } from 'drizzle-orm';
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
  // Inventory enhancements
  showOnKiosk: z.boolean().default(true),
  dimensions: z.record(z.unknown()).default({}),
  allergens: z.array(z.string()).default([]),
  prepTimeMinutes: z.number().int().min(0).optional(),
  calories: z.number().int().min(0).optional(),
  isCountdown: z.boolean().default(false),
  countdownQty: z.number().int().min(0).optional(),
  kitchenDisplayName: z.string().max(255).optional(),
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
      ...(q.categoryId !== undefined ? { categoryId: q.categoryId } : {}),
      ...(q.isActive !== undefined ? { isActive: q.isActive === 'true' } : {}),
    });

    if (tsResults !== null) {
      return reply.status(200).send({ data: tsResults.hits, meta: { totalCount: tsResults.found, source: 'typesense' } });
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
        ...(q.categoryId !== undefined ? { categoryId: q.categoryId } : {}),
        ...(q.isActive !== undefined ? { isActive: q.isActive === 'true' } : {}),
      });

      if (tsResults !== null) {
        // Filter by channel in-memory when Typesense returns results
        const channelFiltered = q.channel
          ? tsResults.hits.filter((p: Record<string, unknown>) => Array.isArray(p['channels']) && (p['channels'] as string[]).includes(q.channel!))
          : tsResults.hits;
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
    onRequest: app.authenticate,
  }, async (request, reply) => {
    const { barcode } = (request.params as { barcode: string });
    const { orgId } = request.user as { orgId: string };

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
    if (!body.success) return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

    const {
      description: rawDescription,
      categoryId: rawCategoryId,
      taxClassId: rawTaxClassId,
      ageRestrictionMinimum: rawAgeMin,
      pluCode: rawPluCode,
      notes: rawNotes,
      basePrice: rawBasePrice,
      costPrice: rawCostPrice,
      prepTimeMinutes: rawPrepTime,
      calories: rawCalories,
      countdownQty: rawCountdownQty,
      kitchenDisplayName: rawKitchenDisplayName,
      ...productRest
    } = body.data;
    const [created] = await db.insert(schema.products).values({
      ...productRest,
      orgId,
      description: rawDescription ?? null,
      categoryId: rawCategoryId ?? null,
      taxClassId: rawTaxClassId ?? null,
      ageRestrictionMinimum: rawAgeMin ?? null,
      pluCode: rawPluCode ?? null,
      notes: rawNotes ?? null,
      basePrice: String(rawBasePrice),
      costPrice: String(rawCostPrice),
      prepTimeMinutes: rawPrepTime ?? null,
      calories: rawCalories ?? null,
      countdownQty: rawCountdownQty ?? null,
      kitchenDisplayName: rawKitchenDisplayName ?? null,
    }).returning();
    const c = created!;

    // Index in Typesense — fire-and-forget (non-fatal)
    indexProduct({
      id: c.id,
      orgId: c.orgId,
      name: c.name,
      sku: c.sku,
      barcodes: (c.barcodes as string[]) ?? [],
      basePrice: Number(c.basePrice),
      isActive: c.isActive,
      ...(c.description != null ? { description: c.description } : {}),
      ...(c.categoryId != null ? { categoryId: c.categoryId } : {}),
      ...(Array.isArray(c.tags) && (c.tags as string[]).length > 0 ? { tags: c.tags as string[] } : {}),
    }).catch((err) => console.error('Typesense indexProduct (create) failed:', err));

    // Invalidate list cache for this org
    await invalidateCache(`products:${orgId}:*`);

    return reply.status(201).send({ data: c });
  });

  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = createProductSchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422 });

    const existing = await db.query.products.findFirst({ where: and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)) });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const patchData: Record<string, unknown> = { updatedAt: new Date() };
    const bd = body.data;
    if (bd.name !== undefined) patchData['name'] = bd.name;
    if (bd.description !== undefined) patchData['description'] = bd.description ?? null;
    if (bd.categoryId !== undefined) patchData['categoryId'] = bd.categoryId ?? null;
    if (bd.taxClassId !== undefined) patchData['taxClassId'] = bd.taxClassId ?? null;
    if (bd.productType !== undefined) patchData['productType'] = bd.productType;
    if (bd.sku !== undefined) patchData['sku'] = bd.sku;
    if (bd.barcodes !== undefined) patchData['barcodes'] = bd.barcodes;
    if (bd.basePrice !== undefined) patchData['basePrice'] = String(bd.basePrice);
    if (bd.costPrice !== undefined) patchData['costPrice'] = String(bd.costPrice);
    if (bd.isSoldOnline !== undefined) patchData['isSoldOnline'] = bd.isSoldOnline;
    if (bd.isSoldInstore !== undefined) patchData['isSoldInstore'] = bd.isSoldInstore;
    if (bd.trackStock !== undefined) patchData['trackStock'] = bd.trackStock;
    if (bd.reorderPoint !== undefined) patchData['reorderPoint'] = bd.reorderPoint;
    if (bd.reorderQuantity !== undefined) patchData['reorderQuantity'] = bd.reorderQuantity;
    if (bd.ageRestricted !== undefined) patchData['ageRestricted'] = bd.ageRestricted;
    if (bd.ageRestrictionMinimum !== undefined) patchData['ageRestrictionMinimum'] = bd.ageRestrictionMinimum ?? null;
    if (bd.weightBased !== undefined) patchData['weightBased'] = bd.weightBased;
    if (bd.pluCode !== undefined) patchData['pluCode'] = bd.pluCode ?? null;
    if (bd.tags !== undefined) patchData['tags'] = bd.tags;
    if (bd.notes !== undefined) patchData['notes'] = bd.notes ?? null;
    if (bd.showOnKiosk !== undefined) patchData['showOnKiosk'] = bd.showOnKiosk;
    if (bd.dimensions !== undefined) patchData['dimensions'] = bd.dimensions;
    if (bd.allergens !== undefined) patchData['allergens'] = bd.allergens;
    if (bd.prepTimeMinutes !== undefined) patchData['prepTimeMinutes'] = bd.prepTimeMinutes ?? null;
    if (bd.calories !== undefined) patchData['calories'] = bd.calories ?? null;
    if (bd.isCountdown !== undefined) patchData['isCountdown'] = bd.isCountdown;
    if (bd.countdownQty !== undefined) patchData['countdownQty'] = bd.countdownQty ?? null;
    if (bd.kitchenDisplayName !== undefined) patchData['kitchenDisplayName'] = bd.kitchenDisplayName ?? null;

    type ProductUpdate = typeof schema.products.$inferInsert;
    const [updated] = await db.update(schema.products).set(patchData as unknown as ProductUpdate).where(and(eq(schema.products.id, id), eq(schema.products.orgId, orgId))).returning();
    const u = updated!;

    // Re-index in Typesense — fire-and-forget (non-fatal)
    indexProduct({
      id: u.id,
      orgId: u.orgId,
      name: u.name,
      sku: u.sku,
      barcodes: (u.barcodes as string[]) ?? [],
      basePrice: Number(u.basePrice),
      isActive: u.isActive,
      ...(u.description != null ? { description: u.description } : {}),
      ...(u.categoryId != null ? { categoryId: u.categoryId } : {}),
      ...(Array.isArray(u.tags) && (u.tags as string[]).length > 0 ? { tags: u.tags as string[] } : {}),
    }).catch((err) => console.error('Typesense indexProduct (update) failed:', err));

    // Invalidate list cache for this org
    await invalidateCache(`products:${orgId}:*`);

    return reply.status(200).send({ data: u });
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
  app.post('/:id/availability', { onRequest: app.authenticate }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const bodySchema = z.object({
      available: z.boolean(),
      reason: z.string().optional(),
      restoreAt: z.string().datetime({ offset: true }).optional(),
    });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

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
