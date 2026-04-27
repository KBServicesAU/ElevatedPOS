import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * v2.7.51 — `requiresIndustry` gates a sidebar item to merchants whose
 * server-pushed identity matches that industry (see useDeviceSettings →
 * config.identity.industry). PosLayout filters by this on every render
 * so a retail shop never sees the Floor Plan / Reservations tabs and a
 * cafe never sees the Bookings / Ecommerce tabs.
 */
export type IndustryGate = 'hospitality' | 'services' | 'retail';

export interface SidebarItem {
  id: string;
  route: string;
  label: string;
  /** Ionicons glyph name */
  icon: string;
  /** Cannot be disabled by the user */
  permanent?: boolean;
  /** v2.7.51 — only show when the merchant's industry matches this value. */
  requiresIndustry?: IndustryGate;
}

export const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'sell',          route: '/sell',                  label: 'Sell',        icon: 'cart',        permanent: true },
  { id: 'orders',        route: '/orders',                label: 'Orders',      icon: 'receipt' },
  { id: 'customers',     route: '/customers',             label: 'Customers',   icon: 'people' },
  { id: 'quick-sale',    route: '/(pos)/quick-sale',      label: 'Quick',       icon: 'flash' },
  { id: 'gift-cards',    route: '/(pos)/gift-cards',      label: 'Gifts',       icon: 'gift' },
  { id: 'laybys',        route: '/(pos)/laybys',          label: 'Laybys',      icon: 'bookmark' },
  { id: 'floor-plan',    route: '/(pos)/floor-plan',      label: 'Floor',       icon: 'grid',        requiresIndustry: 'hospitality' },
  // v2.7.51 — industry-gated additions. Hospitality also gets Reservations
  // + Online Orders, Services gets Bookings, Retail gets Ecommerce. The
  // actual screens are placeholders for now; the merchant manages content
  // from the dashboard.
  { id: 'reservations',  route: '/(pos)/reservations',    label: 'Reserve',     icon: 'calendar',    requiresIndustry: 'hospitality' },
  { id: 'online-orders', route: '/(pos)/online-orders',   label: 'Online',      icon: 'globe',       requiresIndustry: 'hospitality' },
  { id: 'bookings',      route: '/(pos)/bookings',        label: 'Bookings',    icon: 'time',        requiresIndustry: 'services' },
  { id: 'ecommerce',     route: '/(pos)/ecommerce',       label: 'Ecom',        icon: 'cart-outline', requiresIndustry: 'retail' },
  // Shown in the sidebar only while the till is OPEN — see PosLayout filter.
  // v2.7.20: replaces the old separate EOD entry — Close Till is now the
  // single shift-close page that shows summary, count, and logs the
  // employee out.
  { id: 'close-till',    route: '/(pos)/close-till',      label: 'Close',       icon: 'lock-closed', permanent: true },
  { id: 'more',          route: '/more',                  label: 'More',        icon: 'menu',        permanent: true },
];

// v2.7.51 — industry-gated items are added to defaults so a hospitality
// merchant sees Reservations + Online Orders out of the box, a services
// merchant sees Bookings, and a retail merchant sees Ecommerce. PosLayout
// filters out items whose `requiresIndustry` doesn't match the merchant's
// `useDeviceSettings(s => s.config?.identity?.industry)`, so each
// merchant only sees the entries relevant to them.
const DEFAULT_ENABLED = [
  'sell',
  'orders',
  'customers',
  'floor-plan',
  'reservations',
  'online-orders',
  'bookings',
  'ecommerce',
  'close-till',
  'more',
];
const STORAGE_KEY = 'elevatedpos_sidebar_prefs';

interface SidebarStore {
  enabledIds: string[];
  ready: boolean;
  hydrate: () => Promise<void>;
  toggle: (id: string) => Promise<void>;
  reset: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useSidebarStore = create<SidebarStore>((set, get) => ({
  enabledIds: [...DEFAULT_ENABLED],
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        // Always keep permanent items, deduplicate
        const permanentIds = ALL_SIDEBAR_ITEMS.filter(i => i.permanent).map(i => i.id);
        const base = parsed.filter(id => ALL_SIDEBAR_ITEMS.some(i => i.id === id));
        permanentIds.forEach(pid => { if (!base.includes(pid)) base.push(pid); });
        // Sort by master order
        const masterOrder = ALL_SIDEBAR_ITEMS.map(i => i.id);
        base.sort((a, b) => masterOrder.indexOf(a) - masterOrder.indexOf(b));
        set({ enabledIds: base, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  toggle: async (id: string) => {
    const item = ALL_SIDEBAR_ITEMS.find(i => i.id === id);
    if (!item || item.permanent) return;

    const current = get().enabledIds;
    const isEnabled = current.includes(id);
    let next: string[];

    if (isEnabled) {
      next = current.filter(i => i !== id);
    } else {
      next = [...current, id];
      // Sort by master order
      const masterOrder = ALL_SIDEBAR_ITEMS.map(i => i.id);
      next.sort((a, b) => masterOrder.indexOf(a) - masterOrder.indexOf(b));
    }

    set({ enabledIds: next });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  },

  reset: async () => {
    set({ enabledIds: [...DEFAULT_ENABLED] });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify([...DEFAULT_ENABLED]));
    } catch { /* ignore */ }
  },
}));
