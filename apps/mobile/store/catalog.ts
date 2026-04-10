import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { catalogApiFetch } from '../lib/catalog-api';

const UNAVAILABLE_KEY = '@elevatedpos/catalog/unavailable_v1';
const SALES_TYPE_KEY = '@elevatedpos/catalog/sales_type_v1';
const UPSELL_KEY = '@elevatedpos/catalog/upsell_v1';

/** Wet (drinks) vs Dry (food) classification per category. */
export type SalesType = 'wet' | 'dry';

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

  /** Auto 86 — set of product IDs marked as unavailable on this device. */
  unavailable: Set<string>;
  unavailableHydrated: boolean;

  /** Wet/Dry classification keyed by category ID. */
  salesTypeByCategory: Record<string, SalesType>;
  salesTypeHydrated: boolean;

  /** Kiosk upsell — set of product IDs to suggest at checkout. */
  upsellProductIds: Set<string>;
  upsellHydrated: boolean;

  /** Fetch all categories + active products in one shot */
  fetchAll: () => Promise<void>;

  /** Hydrate the persisted Auto 86 list from storage. Call once at boot. */
  hydrateUnavailable: () => Promise<void>;
  /** Toggle a product between in-stock and 86'd. */
  toggleUnavailable: (productId: string) => Promise<void>;
  /** Mark a product as 86'd until manually re-enabled. */
  setUnavailable: (productId: string, value: boolean) => Promise<void>;
  /** Re-enable every 86'd product. */
  clearUnavailable: () => Promise<void>;
  /** Helper for screens — true if a product is currently 86'd. */
  isUnavailable: (productId: string) => boolean;

  /** Hydrate the persisted wet/dry mapping from storage. Call once at boot. */
  hydrateSalesType: () => Promise<void>;
  /** Set or unset (null) the sales type for a category. */
  setCategorySalesType: (categoryId: string, type: SalesType | null) => Promise<void>;
  /** Look up the sales type for a category. */
  getCategorySalesType: (categoryId: string | null | undefined) => SalesType | null;
  /** Look up the sales type for a product (via its category). */
  getProductSalesType: (productName: string) => SalesType | null;

  /** Hydrate the persisted upsell list from storage. Call once at boot. */
  hydrateUpsell: () => Promise<void>;
  /** Toggle a product's upsell flag on or off. */
  toggleUpsell: (productId: string) => Promise<void>;
  /** Explicitly mark a product as upsell or not. */
  setUpsellProduct: (productId: string, value: boolean) => Promise<void>;
  /** Clear every product from the upsell list. */
  clearUpsell: () => Promise<void>;
  /** Helper for screens — true if a product is configured as an upsell. */
  isUpsell: (productId: string) => boolean;
}

async function persistUnavailable(set: Set<string>) {
  try {
    await AsyncStorage.setItem(UNAVAILABLE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // best effort
  }
}

async function persistSalesType(map: Record<string, SalesType>) {
  try {
    await AsyncStorage.setItem(SALES_TYPE_KEY, JSON.stringify(map));
  } catch {
    // best effort
  }
}

async function persistUpsell(set: Set<string>) {
  try {
    await AsyncStorage.setItem(UPSELL_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // best effort
  }
}

export const useCatalogStore = create<CatalogStore>((set, get) => ({
  products: [],
  categories: [],
  loading: false,
  error: null,
  lastFetched: null,
  unavailable: new Set<string>(),
  unavailableHydrated: false,
  salesTypeByCategory: {},
  salesTypeHydrated: false,
  upsellProductIds: new Set<string>(),
  upsellHydrated: false,

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

  hydrateUnavailable: async () => {
    if (get().unavailableHydrated) return;
    try {
      const raw = await AsyncStorage.getItem(UNAVAILABLE_KEY);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          set({ unavailable: new Set(ids), unavailableHydrated: true });
          return;
        }
      }
    } catch {
      // ignore corrupt storage
    }
    set({ unavailableHydrated: true });
  },

  toggleUnavailable: async (productId: string) => {
    const next = new Set(get().unavailable);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    set({ unavailable: next });
    await persistUnavailable(next);
  },

  setUnavailable: async (productId: string, value: boolean) => {
    const next = new Set(get().unavailable);
    if (value) {
      next.add(productId);
    } else {
      next.delete(productId);
    }
    set({ unavailable: next });
    await persistUnavailable(next);
  },

  clearUnavailable: async () => {
    set({ unavailable: new Set() });
    await persistUnavailable(new Set());
  },

  isUnavailable: (productId: string) => get().unavailable.has(productId),

  hydrateSalesType: async () => {
    if (get().salesTypeHydrated) return;
    try {
      const raw = await AsyncStorage.getItem(SALES_TYPE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          set({ salesTypeByCategory: parsed, salesTypeHydrated: true });
          return;
        }
      }
    } catch {
      // ignore corrupt storage
    }
    set({ salesTypeHydrated: true });
  },

  setCategorySalesType: async (categoryId: string, type: SalesType | null) => {
    const next = { ...get().salesTypeByCategory };
    if (type === null) {
      delete next[categoryId];
    } else {
      next[categoryId] = type;
    }
    set({ salesTypeByCategory: next });
    await persistSalesType(next);
  },

  getCategorySalesType: (categoryId: string | null | undefined) => {
    if (!categoryId) return null;
    return get().salesTypeByCategory[categoryId] ?? null;
  },

  getProductSalesType: (productName: string) => {
    const product = get().products.find(
      (p) => p.name.toLowerCase() === productName.toLowerCase(),
    );
    if (!product?.categoryId) return null;
    return get().salesTypeByCategory[product.categoryId] ?? null;
  },

  hydrateUpsell: async () => {
    if (get().upsellHydrated) return;
    try {
      const raw = await AsyncStorage.getItem(UPSELL_KEY);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          set({ upsellProductIds: new Set(ids), upsellHydrated: true });
          return;
        }
      }
    } catch {
      // ignore corrupt storage
    }
    set({ upsellHydrated: true });
  },

  toggleUpsell: async (productId: string) => {
    const next = new Set(get().upsellProductIds);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    set({ upsellProductIds: next });
    await persistUpsell(next);
  },

  setUpsellProduct: async (productId: string, value: boolean) => {
    const next = new Set(get().upsellProductIds);
    if (value) {
      next.add(productId);
    } else {
      next.delete(productId);
    }
    set({ upsellProductIds: next });
    await persistUpsell(next);
  },

  clearUpsell: async () => {
    set({ upsellProductIds: new Set() });
    await persistUpsell(new Set());
  },

  isUpsell: (productId: string) => get().upsellProductIds.has(productId),
}));
