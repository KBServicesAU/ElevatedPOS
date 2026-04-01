import Typesense from 'typesense';
import type { Client } from 'typesense';

// ─── Lazy singleton ────────────────────────────────────────────────────────────

let _client: Client | null = null;

export function getTypesenseClient(): Client | null {
  if (!process.env['TYPESENSE_HOST']) return null;
  if (!_client) {
    _client = new Typesense.Client({
      nodes: [{
        host: process.env['TYPESENSE_HOST'],
        port: parseInt(process.env['TYPESENSE_PORT'] ?? '8108', 10),
        protocol: (process.env['TYPESENSE_PROTOCOL'] ?? 'http') as 'http' | 'https',
      }],
      apiKey: process.env['TYPESENSE_API_KEY'] ?? 'xyz',
      connectionTimeoutSeconds: 2,
    });
  }
  return _client;
}

// ─── Collection names ──────────────────────────────────────────────────────────

export const PRODUCTS_COLLECTION = 'products';
export const CUSTOMERS_COLLECTION = 'customers';

// ─── Schema ───────────────────────────────────────────────────────────────────

export const PRODUCTS_SCHEMA = {
  name: PRODUCTS_COLLECTION,
  fields: [
    { name: 'id', type: 'string' as const },
    { name: 'orgId', type: 'string' as const, facet: true },
    { name: 'name', type: 'string' as const },
    { name: 'description', type: 'string' as const, optional: true },
    { name: 'sku', type: 'string' as const },
    { name: 'barcodes', type: 'string[]' as const, optional: true },
    { name: 'categoryId', type: 'string' as const, facet: true, optional: true },
    { name: 'categoryName', type: 'string' as const, facet: true, optional: true },
    { name: 'basePrice', type: 'float' as const },
    { name: 'isActive', type: 'bool' as const, facet: true },
    { name: 'tags', type: 'string[]' as const, optional: true },
  ],
  default_sorting_field: 'basePrice',
};

// ─── Initialize collections ────────────────────────────────────────────────────

export async function initCollections(): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return; // Typesense not configured

  // Products collection
  try {
    await client.collections(PRODUCTS_COLLECTION).retrieve();
  } catch {
    await client.collections().create(PRODUCTS_SCHEMA);
  }

  // Customers collection
  try {
    await client.collections(CUSTOMERS_COLLECTION).retrieve();
  } catch {
    await client.collections().create({
      name: CUSTOMERS_COLLECTION,
      fields: [
        { name: 'id', type: 'string' as const },
        { name: 'orgId', type: 'string' as const, facet: true },
        { name: 'firstName', type: 'string' as const },
        { name: 'lastName', type: 'string' as const },
        { name: 'email', type: 'string' as const, optional: true },
        { name: 'phone', type: 'string' as const, optional: true },
        { name: 'loyaltyNumber', type: 'string' as const, optional: true },
        { name: 'tier', type: 'string' as const, facet: true, optional: true },
      ],
    });
  }
}

// Alias used by index.ts
export { initCollections as initTypesense };

// ─── Index a single product ────────────────────────────────────────────────────

export async function indexProduct(product: {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  sku: string;
  barcodes?: string[];
  categoryId?: string;
  categoryName?: string;
  basePrice: number;
  isActive: boolean;
  tags?: string[];
}): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;
  try {
    await client.collections(PRODUCTS_COLLECTION).documents().upsert(product);
  } catch (e) {
    console.warn('Typesense indexProduct failed (non-critical):', e);
  }
}

// ─── Bulk index products ───────────────────────────────────────────────────────

export async function bulkIndexProducts(products: {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  sku: string;
  barcodes?: string[];
  categoryId?: string;
  categoryName?: string;
  basePrice: number;
  isActive: boolean;
  tags?: string[];
}[]): Promise<void> {
  const client = getTypesenseClient();
  if (!client || products.length === 0) return;
  try {
    // Typesense recommends batches of 100 for imports
    const BATCH = 100;
    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH);
      await client.collections(PRODUCTS_COLLECTION).documents().import(batch, { action: 'upsert' });
    }
  } catch (e) {
    console.warn('Typesense bulkIndexProducts failed (non-critical):', e);
  }
}

// ─── Delete a product from the index ──────────────────────────────────────────

export async function deleteProductFromIndex(productId: string): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;
  try {
    await client.collections(PRODUCTS_COLLECTION).documents(productId).delete();
  } catch (e) {
    console.warn('Typesense deleteProductFromIndex failed (non-critical):', e);
  }
}

// ─── Search products ───────────────────────────────────────────────────────────

export interface SearchProductsResult {
  hits: Record<string, unknown>[];
  found: number;
  facetCounts?: { fieldName: string; counts: { value: string; count: number }[] }[];
}

export async function searchProducts(
  orgId: string,
  query: string,
  opts?: {
    categoryId?: string;
    isActive?: boolean;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    page?: number;
  },
): Promise<SearchProductsResult | null> {
  const client = getTypesenseClient();
  if (!client) return null;

  try {
    const filters: string[] = [`orgId:=${orgId}`];
    if (opts?.categoryId) filters.push(`categoryId:=${opts.categoryId}`);
    if (opts?.isActive !== undefined) filters.push(`isActive:=${opts.isActive}`);
    if (opts?.minPrice !== undefined && opts?.maxPrice !== undefined) {
      filters.push(`basePrice:[${opts.minPrice}..${opts.maxPrice}]`);
    } else if (opts?.minPrice !== undefined) {
      filters.push(`basePrice:>=${opts.minPrice}`);
    } else if (opts?.maxPrice !== undefined) {
      filters.push(`basePrice:<=${opts.maxPrice}`);
    }

    const result = await client.collections(PRODUCTS_COLLECTION).documents().search({
      q: query || '*',
      query_by: 'name,sku,barcodes,tags',
      filter_by: filters.join(' && '),
      per_page: opts?.limit ?? 20,
      page: opts?.page ?? 1,
      sort_by: query ? '_text_match:desc' : 'name:asc',
      facet_by: 'categoryId,categoryName,isActive',
    });

    const facetCounts = result.facet_counts?.map((fc: { field_name: string; counts: { value: string; count: number }[] }) => ({
      fieldName: String(fc.field_name),
      counts: fc.counts.map((c: { value: string; count: number }) => ({ value: String(c.value), count: c.count })),
    }));
    return {
      hits: (result.hits ?? []).map((h) => h.document as Record<string, unknown>),
      found: result.found ?? 0,
      ...(facetCounts !== undefined ? { facetCounts } : {}),
    };
  } catch {
    return null; // Typesense unavailable — caller falls back to DB
  }
}
