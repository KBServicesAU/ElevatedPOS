import { create } from 'zustand';
import { catalogApiFetch } from '../lib/catalog-api';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  basePrice: string; // decimal string from API, e.g. "5.50"
  categoryId: string | null;
  category?: { id: string; name: string; color: string | null } | null;
  isActive: boolean;
  imageUrl?: string | null;
}

export interface CatalogCategory {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  parentId: string | null;
  isActive?: boolean;
}

/** The /api/v1/products endpoint may return either shape */
interface ProductsResponse {
  data: CatalogProduct[];
  meta?: { totalCount: number; hasMore: boolean };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

interface CatalogStore {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;

  /** Fetch all categories + active products in one shot */
  fetchAll: () => Promise<void>;
}

export const useCatalogStore = create<CatalogStore>((set) => ({
  products: [],
  categories: [],
  loading: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [catRes, prodRes] = await Promise.all([
        catalogApiFetch<CatalogCategory[]>('/api/v1/categories'),
        catalogApiFetch<ProductsResponse | CatalogProduct[]>(
          '/api/v1/products?limit=200&isActive=true',
        ),
      ]);

      // API may return raw array or { data: [...] } wrapper
      const rawCats = Array.isArray(catRes) ? catRes : ((catRes as any).data ?? []);
      const categories = rawCats.filter((c: CatalogCategory) => c.isActive !== false);
      const rawProds = Array.isArray(prodRes)
        ? prodRes
        : ((prodRes as ProductsResponse).data ?? []);
      // Prices are stored in cents (dashboard multiplies by 100).
      // Convert to dollar strings for display.
      const products = rawProds.map((p: CatalogProduct) => {
        const cents = parseFloat(String(p.basePrice)) || 0;
        return { ...p, basePrice: (cents / 100).toFixed(2) };
      });

      set({ categories, products, loading: false, lastFetched: Date.now() });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load catalog',
        loading: false,
      });
    }
  },
}));
