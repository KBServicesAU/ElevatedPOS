import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { posApiFetch } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  price: number;          // dollars (display-ready)
  category: string;
  imageUrl?: string;
  image?: string;
  wholesalePrice?: number; // dollars
  costPrice?: number;      // dollars
  barcode?: string;
  sku?: string;
  modifierGroups?: Array<{
    id: string;
    name: string;
    minSelections: number;
    maxSelections: number;
    options: Array<{
      id: string;
      name: string;
      priceDelta: number; // cents (matches API)
    }>;
  }>;
  hasModifiers?: boolean;
}

/** Shape returned by the catalog API (prices in cents). */
interface ApiProduct {
  id: string;
  name: string;
  price: number;           // cents
  category?: string;
  categoryName?: string;
  imageUrl?: string;
  image?: string;
  wholesalePrice?: number; // cents
  costPrice?: number;      // cents
  barcode?: string;
  sku?: string;
  status?: string;
  modifierGroups?: Array<{
    id: string;
    name: string;
    minSelections: number;
    maxSelections: number;
    options: Array<{
      id: string;
      name: string;
      priceDelta: number; // cents
    }>;
  }>;
  hasModifiers?: boolean;
}

// ─── Hardcoded fallback catalogue ────────────────────────────────────────────

const FALLBACK_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Flat White',    price: 5.50,  category: 'Coffee'   },
  { id: 'p2', name: 'Iced Latte',    price: 6.00,  category: 'Coffee'   },
  { id: 'p3', name: 'Cold Brew',     price: 5.00,  category: 'Coffee'   },
  { id: 'p4', name: 'Pour Over',     price: 8.00,  category: 'Coffee'   },
  { id: 'p5', name: 'Croissant',     price: 4.00,  category: 'Pastries' },
  { id: 'p6', name: 'Banana Bread',  price: 4.50,  category: 'Pastries' },
  { id: 'p7', name: 'Avocado Toast', price: 14.50, category: 'Food'     },
  { id: 'p8', name: 'Eggs Benedict', price: 18.00, category: 'Food'     },
];

const FALLBACK_CATEGORIES = ['All', 'Coffee', 'Pastries', 'Food'];

// ─── Constants ───────────────────────────────────────────────────────────────

const PRODUCTS_CACHE_KEY = 'elevatedpos_products_cache';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert an API product (cents) to a local Product (dollars). */
function mapApiProduct(api: ApiProduct): Product {
  return {
    id: api.id,
    name: api.name,
    price: api.price / 100,
    category: api.category ?? api.categoryName ?? 'Uncategorised',
    imageUrl: api.imageUrl,
    image: api.image,
    wholesalePrice: api.wholesalePrice != null ? api.wholesalePrice / 100 : undefined,
    costPrice: api.costPrice != null ? api.costPrice / 100 : undefined,
    barcode: api.barcode,
    sku: api.sku,
    modifierGroups: api.modifierGroups,
    hasModifiers: api.hasModifiers ?? ((api.modifierGroups?.length ?? 0) > 0),
  };
}

/** Extract sorted unique categories (with "All" first). */
function extractCategories(products: Product[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    if (p.category) set.add(p.category);
  }
  const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
  return ['All', ...sorted];
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface ProductsState {
  products: Product[];
  categories: string[];
  loading: boolean;
  error: string | null;
  /** true when displaying cached/fallback data rather than a fresh API response */
  offline: boolean;
}

interface ProductsActions {
  fetchProducts: () => Promise<void>;
  searchProducts: (query: string) => Product[];
}

type ProductsStore = ProductsState & ProductsActions;

export const useProductsStore = create<ProductsStore>((set, get) => ({
  products: [],
  categories: ['All'],
  loading: false,
  error: null,
  offline: false,

  fetchProducts: async () => {
    set({ loading: true, error: null });

    // 1. Load cached products immediately so the UI is never empty.
    try {
      const raw = await AsyncStorage.getItem(PRODUCTS_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Product[];
        if (cached.length > 0) {
          set({
            products: cached,
            categories: extractCategories(cached),
            // Don't clear loading — we're still fetching fresh data.
          });
        }
      }
    } catch {
      // Non-critical: cache miss or corrupt — ignore.
    }

    // 2. Fetch from API.
    try {
      const res = await posApiFetch<{ data: ApiProduct[] } | ApiProduct[]>(
        '/api/v1/catalog/products?limit=500&status=active',
      );

      const apiList: ApiProduct[] = Array.isArray(res)
        ? res
        : (res as { data: ApiProduct[] }).data ?? [];

      const products = apiList.map(mapApiProduct);

      if (products.length > 0) {
        set({
          products,
          categories: extractCategories(products),
          loading: false,
          error: null,
          offline: false,
        });

        // Persist to cache for next offline load.
        AsyncStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products)).catch(() => undefined);
        return;
      }

      // API returned an empty list — treat as if it failed so we show fallback.
      throw new Error('API returned no products');
    } catch (err) {
      // If we already loaded cached products, just mark offline.
      const current = get().products;
      if (current.length > 0) {
        set({
          loading: false,
          error: (err as Error).message ?? 'Failed to fetch products',
          offline: true,
        });
        return;
      }

      // No cache either — fall back to hardcoded catalogue.
      set({
        products: FALLBACK_PRODUCTS,
        categories: FALLBACK_CATEGORIES,
        loading: false,
        error: (err as Error).message ?? 'Failed to fetch products',
        offline: true,
      });
    }
  },

  searchProducts: (query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return get().products;
    return get().products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)),
    );
  },
}));
