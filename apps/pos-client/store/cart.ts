import { create } from 'zustand';

// ─── Discount types ──────────────────────────────────────────────────────────

export type DiscountType = 'percentage' | 'fixed';

export interface Discount {
  type: DiscountType;
  value: number;
}

// ─── Cart item ───────────────────────────────────────────────────────────────

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  discount?: Discount;
}

/** Compute the effective discount amount for a single line item (price * qty). */
export function computeItemDiscount(item: CartItem): number {
  if (!item.discount) return 0;
  const lineTotal = item.price * item.qty;
  if (item.discount.type === 'percentage') {
    return Math.min(lineTotal, lineTotal * (item.discount.value / 100));
  }
  // Fixed discount — capped at the line total
  return Math.min(lineTotal, item.discount.value);
}

type PriceMode = 'standard' | 'wholesale';

export type { PriceMode };

// ─── Store ───────────────────────────────────────────────────────────────────

interface CartStore {
  items: CartItem[];
  tableNumber: number | null;
  priceMode: PriceMode;
  orderDiscount: Discount | null;
  orderNote: string;

  add: (item: Omit<CartItem, 'qty'>) => void;
  remove: (id: string) => void;
  clear: () => void;
  total: () => number;
  setTableNumber: (table: number | null) => void;
  setPriceMode: (mode: PriceMode) => void;

  // Item-level discounts
  applyItemDiscount: (itemIndex: number, type: DiscountType, value: number) => void;
  removeItemDiscount: (itemIndex: number) => void;

  // Order-level discount
  applyOrderDiscount: (type: DiscountType, value: number) => void;
  removeOrderDiscount: () => void;

  // Order note
  setOrderNote: (note: string) => void;

  // Computed helpers
  subtotalBeforeDiscounts: () => number;
  totalItemDiscounts: () => number;
  orderDiscountAmount: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  tableNumber: null,
  priceMode: 'standard',
  orderDiscount: null,
  orderNote: '',

  add: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.id === item.id);
      if (existing) {
        return { items: state.items.map((i) => i.id === item.id ? { ...i, qty: i.qty + 1 } : i) };
      }
      return { items: [...state.items, { ...item, qty: 1 }] };
    }),

  remove: (id) =>
    set((state) => {
      const item = state.items.find((i) => i.id === id);
      if (!item) return state;
      if (item.qty === 1) return { items: state.items.filter((i) => i.id !== id) };
      return { items: state.items.map((i) => i.id === id ? { ...i, qty: i.qty - 1 } : i) };
    }),

  clear: () => set({ items: [], tableNumber: null, orderDiscount: null, orderNote: '' }),

  // ── Item discounts ─────────────────────────────────────────────────────────

  applyItemDiscount: (itemIndex, type, value) =>
    set((state) => {
      if (itemIndex < 0 || itemIndex >= state.items.length) return state;
      const items = [...state.items];
      items[itemIndex] = { ...items[itemIndex], discount: { type, value } };
      return { items };
    }),

  removeItemDiscount: (itemIndex) =>
    set((state) => {
      if (itemIndex < 0 || itemIndex >= state.items.length) return state;
      const items = [...state.items];
      const { discount: _removed, ...rest } = items[itemIndex];
      items[itemIndex] = rest as CartItem;
      return { items };
    }),

  // ── Order discount ─────────────────────────────────────────────────────────

  applyOrderDiscount: (type, value) =>
    set({ orderDiscount: { type, value } }),

  removeOrderDiscount: () =>
    set({ orderDiscount: null }),

  // ── Order note ─────────────────────────────────────────────────────────────

  setOrderNote: (note) => set({ orderNote: note }),

  // ── Computed totals ────────────────────────────────────────────────────────

  subtotalBeforeDiscounts: () =>
    get().items.reduce((sum, i) => sum + i.price * i.qty, 0),

  totalItemDiscounts: () =>
    get().items.reduce((sum, i) => sum + computeItemDiscount(i), 0),

  orderDiscountAmount: () => {
    const { orderDiscount } = get();
    if (!orderDiscount) return 0;
    const subtotalAfterItems =
      get().subtotalBeforeDiscounts() - get().totalItemDiscounts();
    if (orderDiscount.type === 'percentage') {
      return Math.min(subtotalAfterItems, subtotalAfterItems * (orderDiscount.value / 100));
    }
    return Math.min(subtotalAfterItems, orderDiscount.value);
  },

  total: () => {
    const subtotal = get().subtotalBeforeDiscounts();
    const itemDiscounts = get().totalItemDiscounts();
    const orderDiscAmt = get().orderDiscountAmount();
    const discountedSubtotal = subtotal - itemDiscounts - orderDiscAmt;
    return discountedSubtotal * 1.1; // include 10% tax
  },

  setTableNumber: (table) => set({ tableNumber: table }),
  setPriceMode: (mode) => set({ priceMode: mode }),
}));
