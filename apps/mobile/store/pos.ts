import { create } from 'zustand';

export interface PosCartItem {
  id: string;
  /** Unique key for this cart line — stable across qty changes but unique per add */
  cartKey: string;
  name: string;
  price: number;       // tax-inclusive price (AU GST included)
  qty: number;
  categoryColor?: string;
  note?: string;
  /** Per-item discount in dollars (applied per unit) */
  discount?: number;
  /** Discount type: '%' = percentage, '$' = flat dollar amount */
  discountType?: '%' | '$';
  /** Seat number this item is assigned to (1-indexed). Undefined = shared. */
  seat?: number;
}

interface PosStore {
  cart: PosCartItem[];
  customerId: string | null;
  customerName: string | null;
  /** Total seats / covers at the table for split-by-seat. */
  seatCount: number;

  addItem: (item: Omit<PosCartItem, 'qty' | 'cartKey'>) => void;
  removeItem: (cartKey: string) => void;
  updateQty: (cartKey: string, qty: number) => void;
  updateItem: (
    cartKey: string,
    updates: Partial<Pick<PosCartItem, 'note' | 'discount' | 'discountType' | 'seat'>>,
  ) => void;
  clearCart: () => void;
  setCustomer: (id: string | null, name: string | null) => void;
  setSeatCount: (n: number) => void;
  /** Move a single line to a particular seat (or undefined for shared). */
  assignSeat: (cartKey: string, seat: number | undefined) => void;
}

export const usePosStore = create<PosStore>((set) => ({
  cart: [],
  customerId: null,
  customerName: null,
  seatCount: 1,

  addItem: (item) =>
    set((state) => {
      // Only merge into a plain (unmodified) existing line
      const existing = state.cart.find(
        (i) => i.id === item.id && i.seat === undefined && !i.note && !i.discount,
      );
      if (existing) {
        return {
          cart: state.cart.map((i) =>
            i === existing ? { ...i, qty: i.qty + 1 } : i,
          ),
        };
      }
      const cartKey = `${item.id}::${Date.now()}::${Math.random().toString(36).slice(2, 7)}`;
      return { cart: [...state.cart, { ...item, cartKey, qty: 1 }] };
    }),

  updateItem: (cartKey, updates) =>
    set((state) => ({
      cart: state.cart.map((i) =>
        i.cartKey === cartKey ? { ...i, ...updates } : i,
      ),
    })),

  removeItem: (cartKey) =>
    set((state) => {
      const item = state.cart.find((i) => i.cartKey === cartKey);
      if (!item) return state;
      if (item.qty === 1) return { cart: state.cart.filter((i) => i.cartKey !== cartKey) };
      return {
        cart: state.cart.map((i) =>
          i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i,
        ),
      };
    }),

  updateQty: (cartKey, qty) =>
    set((state) => {
      if (qty <= 0) return { cart: state.cart.filter((i) => i.cartKey !== cartKey) };
      return {
        cart: state.cart.map((i) => (i.cartKey === cartKey ? { ...i, qty } : i)),
      };
    }),

  clearCart: () => set({ cart: [], customerId: null, customerName: null, seatCount: 1 }),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),

  setSeatCount: (n) => set({ seatCount: Math.max(1, Math.min(20, Math.round(n))) }),

  assignSeat: (cartKey, seat) =>
    set((state) => ({
      cart: state.cart.map((i) =>
        i.cartKey === cartKey ? { ...i, seat } : i,
      ),
    })),
}));
