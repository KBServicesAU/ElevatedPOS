import type { FastifyInstance } from 'fastify';
import { eq, and, ilike, or, gte, lte } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  getTypesenseClient,
  searchProducts as tsSearchProducts,
  bulkIndexProducts,
} from '../lib/typesense';

export async function searchRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  /**
   * GET /api/v1/search/products
   * Query params: q, categoryId, minPrice, maxPrice, limit (default 20), page (default 1)
   * Returns: { results, total, page, facets, typesense }
   */
  app.get('/products', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as {
      q?: string;
      categoryId?: string;
      minPrice?: string;
      maxPrice?: string;
      limit?: string;
      page?: string;
    };

    const query = q.q ?? '';
    const limit = Math.min(Number(q.limit ?? 20), 100);
    const page = Math.max(Number(q.page ?? 1), 1);
    const categoryId = q.categoryId;
    const minPrice = q.minPrice !== undefined ? Number(q.minPrice) : undefined;
    const maxPrice = q.maxPrice !== undefined ? Number(q.maxPrice) : undefined;

    // Attempt Typesense first
    const tsClient = getTypesenseClient();
    if (tsClient) {
      const tsResult = await tsSearchProducts(orgId, query, {
        limit,
        page,
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(minPrice !== undefined ? { minPrice } : {}),
        ...(maxPrice !== undefined ? { maxPrice } : {}),
      });

      if (tsResult !== null) {
        // Build category facets from facet_counts
        const categoryFacet =
          tsResult.facetCounts?.find((fc) => fc.fieldName === 'categoryName');
        const categories = categoryFacet?.counts ?? [];

        return reply.status(200).send({
          results: tsResult.hits,
          total: tsResult.found,
          page,
          facets: { categories },
          typesense: true,
        });
      }
    }

    // Typesense unavailable — fall back to Postgres ILIKE
    const conditions = [eq(schema.products.orgId, orgId)];

    if (categoryId) conditions.push(eq(schema.products.categoryId, categoryId));
    if (minPrice !== undefined) conditions.push(gte(schema.products.basePrice, String(minPrice)));
    if (maxPrice !== undefined) conditions.push(lte(schema.products.basePrice, String(maxPrice)));

    const rows = await db.query.products.findMany({
      where: and(
        ...conditions,
        query
          ? or(
              ilike(schema.products.name, `%${query}%`),
              ilike(schema.products.sku, `%${query}%`),
            )
          : undefined,
      ),
      with: { category: true },
      limit,
      offset: (page - 1) * limit,
    });

    return reply.status(200).send({
      results: rows,
      total: rows.length,
      page,
      facets: { categories: [] },
      typesense: false,
    });
  });

  /**
   * POST /api/v1/search/reindex
   * Manager+ only. Fetches all active products for the org and bulk-indexes into Typesense.
   * Returns: { indexed: N }
   */
  app.post('/reindex', async (request, reply) => {
    const { orgId, role } = request.user as { orgId: string; role: string };

    if (!['manager', 'owner', 'admin'].includes(role)) {
      return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'Manager role required' });
    }

    const products = await db.query.products.findMany({
      where: and(eq(schema.products.orgId, orgId), eq(schema.products.isActive, true)),
      with: { category: true },
    });

    const docs = products.map((p) => ({
      id: p.id,
      orgId: p.orgId,
      name: p.name,
      sku: p.sku,
      barcodes: (p.barcodes as string[]) ?? [],
      basePrice: Number(p.basePrice),
      isActive: p.isActive,
      ...(p.description != null ? { description: p.description } : {}),
      ...(p.categoryId != null ? { categoryId: p.categoryId } : {}),
      ...((p as { category?: { name: string } | null }).category?.name != null ? { categoryName: (p as { category?: { name: string } | null }).category!.name } : {}),
      ...(Array.isArray(p.tags) && (p.tags as string[]).length > 0 ? { tags: p.tags as string[] } : {}),
    }));

    await bulkIndexProducts(docs);

    return reply.status(200).send({ indexed: docs.length });
  });
}
