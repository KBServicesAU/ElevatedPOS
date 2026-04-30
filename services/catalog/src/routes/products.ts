import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, ilike, or, arrayContains, count, sql } from 'drizzle-orm';
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
  // v2.7.48 — accept the boolean active flag from create + PATCH bodies so
  // the dashboard's "archive" toggle actually mutates state. The DB column
  // already defaults to true, so omitting this on create still yields an
  // active product (matching the merchant mental model: archive is opt-in).
  isActive: z.boolean().default(true),
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
    const searchWhereClause = and(
      eq(schema.products.orgId, orgId),
      q.isActive !== undefined ? eq(schema.products.isActive, q.isActive === 'true') : undefined,
      q.categoryId ? eq(schema.products.categoryId, q.categoryId) : undefined,
      query ? or(
        ilike(schema.products.name, `%${query}%`),
        ilike(schema.products.sku, `%${query}%`),
      ) : undefined,
    );

    const [products, countResult] = await Promise.all([
      db.query.products.findMany({
        where: searchWhereClause,
        with: { category: true, taxClass: true, variants: true },
        orderBy: [desc(schema.products.updatedAt)],
        limit,
      }),
      db.select({ totalCount: count() }).from(schema.products).where(searchWhereClause),
    ]);
    const searchTotalCount = countResult[0]?.totalCount ?? 0;

    return reply.status(200).send({ data: products, meta: { totalCount: searchTotalCount, source: 'db' } });
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
        return reply.status(200).send({ data: channelFiltered, meta: { totalCount: tsResults.found, hasMore: channelFiltered.length === limit, source: 'typesense' } });
      }

      // Typesense unavailable — fall back to DB with ILIKE
      const dbSearchWhere = and(
        eq(schema.products.orgId, orgId),
        q.isActive !== undefined ? eq(schema.products.isActive, q.isActive === 'true') : undefined,
        q.categoryId ? eq(schema.products.categoryId, q.categoryId) : undefined,
        channelFilter,
        or(
          ilike(schema.products.name, `%${query}%`),
          ilike(schema.products.sku, `%${query}%`),
        ),
      );

      const [products, dbSearchCountResult] = await Promise.all([
        db.query.products.findMany({
          where: dbSearchWhere,
          with: { category: true, taxClass: true, variants: true },
          orderBy: [desc(schema.products.updatedAt)],
          limit,
        }),
        db.select({ totalCount: count() }).from(schema.products).where(dbSearchWhere),
      ]);
      const dbSearchTotal = dbSearchCountResult[0]?.totalCount ?? 0;

      return reply.status(200).send({ data: products, meta: { totalCount: dbSearchTotal, hasMore: products.length === limit, source: 'db' } });
    }

    // No search query — standard list (cache only when no filters applied)
    const cacheKey = `products:${orgId}:list`;
    const countCacheKey = `products:${orgId}:count`;
    const useCache = !q.isActive && !q.categoryId && !q.channel && limit === 50;

    if (useCache) {
      const cached = await getCached<typeof products>(cacheKey);
      const cachedCount = await getCached<number>(countCacheKey);
      if (cached && cachedCount !== null) {
        return reply.status(200).send({ data: cached, meta: { totalCount: cachedCount, hasMore: cached.length === limit, source: 'cache' } });
      }
    }

    const listWhereClause = and(
      eq(schema.products.orgId, orgId),
      q.isActive !== undefined ? eq(schema.products.isActive, q.isActive === 'true') : undefined,
      q.categoryId ? eq(schema.products.categoryId, q.categoryId) : undefined,
      channelFilter,
    );

    const [products, listCountResult] = await Promise.all([
      db.query.products.findMany({
        where: listWhereClause,
        with: { category: true, taxClass: true, variants: true },
        orderBy: [desc(schema.products.updatedAt)],
        limit,
      }),
      db.select({ totalCount: count() }).from(schema.products).where(listWhereClause),
    ]);
    const listTotalCount = listCountResult[0]?.totalCount ?? 0;

    if (useCache) {
      await setCached(cacheKey, products);
      await setCached(countCacheKey, listTotalCount);
    }

    return reply.status(200).send({ data: products, meta: { totalCount: listTotalCount, hasMore: products.length === limit } });
  });

  // GET /api/v1/products/barcode/:barcode
  app.get('/barcode/:barcode', {
    onRequest: app.authenticate,
  }, async (request, reply) => {
    const { barcode } = (request.params as { barcode: string });
    const { orgId } = request.user as { orgId: string };

    const product = await db.query.products.findFirst({
      where: and(
        eq(schema.products.orgId, orgId),
        eq(schema.products.isActive, true),
        sql`${schema.products.barcodes} @> ARRAY[${barcode}]::text[]`
      ),
      with: { category: true }
    });

    if (!product) {
      return reply.code(404).send({ type: 'about:blank', title: 'Not Found', status: 404, detail: `No product found with barcode '${barcode}'.` });
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
    // v2.7.93 — derive `channels` from `isSoldOnline` so the storefront
    // (which filters by channels containing 'web') automatically shows
    // products the merchant flags as online-sellable. Without this the
    // dashboard's `isSoldOnline` toggle was a no-op for the storefront —
    // a confusing UX where flipping a switch did nothing visible.
    const inferredChannels: ('pos' | 'web')[] = productRest.isSoldOnline
      ? ['pos', 'web']
      : ['pos'];

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
      channels: inferredChannels,
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
    }).catch((err) => request.log.error({ err }, 'Typesense indexProduct failed — product may not appear in search'));

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
    // v2.7.48 — accept isActive on PATCH so the dashboard archive toggle
    // can flip products active/inactive without going through the
    // /availability endpoint (which is reserved for auto-86 in the POS).
    if (bd.isActive !== undefined) patchData['isActive'] = bd.isActive;
    if (bd.isSoldOnline !== undefined) {
      patchData['isSoldOnline'] = bd.isSoldOnline;
      // v2.7.93 — keep `channels` in sync with the toggle. Storefront
      // filters on `channels.includes('web')`, so flipping isSoldOnline
      // without updating channels was a silent no-op for the merchant.
      const currentChannels = (existing.channels ?? ['pos']) as string[];
      const withoutWeb = currentChannels.filter((c) => c !== 'web');
      patchData['channels'] = bd.isSoldOnline
        ? Array.from(new Set([...withoutWeb, 'web']))
        : withoutWeb.length > 0 ? withoutWeb : ['pos'];
    }
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
    }).catch((err) => request.log.error({ err }, 'Typesense indexProduct failed — product may not appear in search'));

    // Invalidate list cache for this org
    await invalidateCache(`products:${orgId}:*`);

    return reply.status(200).send({ data: u });
  });

  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db.update(schema.products).set({ isActive: false, updatedAt: new Date() }).where(and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)));
    // Remove from Typesense index — fire-and-forget (non-fatal)
    deleteProductFromIndex(id).catch((err) => request.log.error({ err }, 'Typesense indexProduct failed — product may not appear in search'));
    // Invalidate list cache for this org
    await invalidateCache(`products:${orgId}:*`);
    return reply.status(204).send();
  });

  // POST /api/v1/products/bulk-channels — flip every active product's
  // web/pos channel flags in one shot (v2.7.93). Used by the Web Store
  // dashboard's "Show all products on website" button so a merchant
  // doesn't have to flip 40 individual isSoldOnline toggles to populate
  // the storefront menu.
  app.post('/bulk-channels', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const bodySchema = z.object({
      action: z.enum(['add_web', 'remove_web', 'web_only', 'pos_only']),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const action = parsed.data.action;

    // Pull all active products for the org once so we can compute new
    // channels per row (channels may differ today if the merchant has
    // already done some manual customisation).
    const rows = await db.query.products.findMany({
      where: and(eq(schema.products.orgId, orgId), eq(schema.products.isActive, true)),
      columns: { id: true, channels: true },
    });

    let updated = 0;
    for (const row of rows) {
      const current = (row.channels ?? ['pos']) as string[];
      let next: string[];
      switch (action) {
        case 'add_web':
          next = Array.from(new Set([...current, 'web']));
          break;
        case 'remove_web':
          next = current.filter((c) => c !== 'web');
          if (next.length === 0) next = ['pos'];
          break;
        case 'web_only':
          next = ['web'];
          break;
        case 'pos_only':
          next = ['pos'];
          break;
      }
      // Skip the write when the row already matches the target — saves
      // a fan-out of needless updates and keeps `updatedAt` stable on
      // products that didn't actually change.
      if (
        next.length === current.length &&
        next.every((c) => current.includes(c))
      ) {
        continue;
      }
      await db
        .update(schema.products)
        .set({
          channels: next,
          isSoldOnline: next.includes('web'),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.products.id, row.id), eq(schema.products.orgId, orgId)));
      updated += 1;
    }

    await invalidateCache(`products:${orgId}:*`);
    return reply.status(200).send({
      data: { action, totalProducts: rows.length, updated },
    });
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

  // POST /api/v1/products/:id/countdown/decrement — internal: called after an order contains a
  // countdown product. Decrements countdownQty by the sold quantity; auto-86s when qty ≤ 0.
  // Accepts both authenticated (employee JWT) and internal service calls (x-internal-secret).
  app.post('/:id/countdown/decrement', async (request, reply) => {
    const { id } = request.params as { id: string };
    const internalSecret = process.env['INTERNAL_SERVICE_TOKEN'] ?? process.env['JWT_SECRET'];
    const authHeader = request.headers['authorization'] ?? '';
    const xInternal = request.headers['x-internal-secret'];

    // Allow internal service calls — skip org-scoped auth check
    let orgId: string | null = null;
    if (xInternal && xInternal === internalSecret) {
      orgId = null; // look up by id only
    } else {
      try {
        await request.jwtVerify();
        orgId = (request.user as { orgId: string }).orgId;
      } catch {
        // Try internal secret in Bearer position
        const token = authHeader.replace('Bearer ', '');
        if (token !== internalSecret) {
          return reply.status(401).send({ title: 'Unauthorized', status: 401 });
        }
        orgId = null;
      }
    }

    const bodySchema = z.object({ quantity: z.number().positive().default(1) });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const existing = await db.query.products.findFirst({
      where: orgId ? and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)) : eq(schema.products.id, id),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!existing.isCountdown || existing.countdownQty == null) {
      return reply.status(200).send({ data: { skipped: true, reason: 'not a countdown product' } });
    }

    const newQty = Math.max(0, existing.countdownQty - body.data.quantity);
    const shouldAuto86 = newQty <= 0;

    const [updated] = await db
      .update(schema.products)
      .set({
        countdownQty: newQty,
        ...(shouldAuto86 ? { isActive: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.products.id, id))
      .returning();

    if (shouldAuto86) {
      console.log(`[catalog] Auto-86'd product ${id} (${existing.name}) — countdown reached 0`);
      await invalidateCache(`products:${existing.orgId}:*`);
    }

    return reply.status(200).send({
      data: { ...updated, countdownQty: newQty, auto86: shouldAuto86 },
    });
  });

  // NOTE: GET /api/v1/products/availability-changes is registered at the top level in index.ts
  // as a public (no-auth) endpoint. Do not add it here in the authenticated plugin.

  // POST /api/v1/products/lookup-or-create — resolve a free-form line to a real product.
  // v2.7.41 — the dashboard Purchase-Order form lets staff type a product name + SKU
  // without linking to the catalog. Instead of fabricating a synthetic productId (which
  // would create orphan stock rows on receive), the inventory service calls this endpoint
  // from POST /purchase-orders so every PO line ends up pointing at a real catalog row.
  // Matches on (orgId, sku) first; falls back to (orgId, name). When nothing matches,
  // creates an inactive draft product tagged 'po-free-form' so staff can later edit
  // price/category/barcodes without it cluttering the POS menu.
  app.post('/lookup-or-create', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = z.object({
      sku: z.string().optional(),
      name: z.string().min(1),
      costPrice: z.number().min(0).optional(),
    }).safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { name } = body.data;
    const sku = body.data.sku?.trim() ?? '';

    // 1) Exact-match SKU when provided (the unique index is on orgId+sku).
    if (sku) {
      const existing = await db.query.products.findFirst({
        where: and(eq(schema.products.orgId, orgId), eq(schema.products.sku, sku)),
      });
      if (existing) return reply.status(200).send({ data: existing, meta: { matched: 'sku' } });
    }

    // 2) Case-insensitive name match within the org as a secondary key.
    const byName = await db.query.products.findFirst({
      where: and(eq(schema.products.orgId, orgId), ilike(schema.products.name, name)),
    });
    if (byName) return reply.status(200).send({ data: byName, meta: { matched: 'name' } });

    // 3) Create an inactive draft. The schema requires (orgId, sku) unique, so
    // synthesise one when empty using a timestamp-based suffix — keeps the index happy
    // and is easy to spot in the catalog UI as a PO-origin stub.
    const generatedSku = sku || `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [created] = await db.insert(schema.products).values({
      orgId,
      name,
      sku: generatedSku,
      isActive: false,
      isSoldInstore: false,
      isSoldOnline: false,
      showOnKiosk: false,
      trackStock: true,
      tags: ['po-free-form'],
      basePrice: '0',
      costPrice: String(body.data.costPrice ?? 0),
      notes: 'Auto-created from purchase-order free-form line. Review & activate to sell.',
    }).returning();
    const c = created!;

    // Index in Typesense (fire-and-forget) so it shows up in internal searches.
    indexProduct({
      id: c.id,
      orgId: c.orgId,
      name: c.name,
      sku: c.sku,
      barcodes: (c.barcodes as string[]) ?? [],
      basePrice: Number(c.basePrice),
      isActive: c.isActive,
      ...(Array.isArray(c.tags) && (c.tags as string[]).length > 0 ? { tags: c.tags as string[] } : {}),
    }).catch((err) => request.log.error({ err }, 'Typesense indexProduct failed'));

    // Invalidate list cache for this org
    await invalidateCache(`products:${orgId}:*`);

    return reply.status(201).send({ data: c, meta: { matched: 'created' } });
  });
}
