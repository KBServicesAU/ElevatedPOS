import { create } from 'zustand';

export interface PosCartItem {
  id: string;
  name: string;
  price: number;       // tax-inclusive price (AU GST included)
  qty: number;
  categoryColor?: string;
  note?: string;
  /** Per-item discount in dollars (applied per unit) */
  discount?: number;
  /** Discount type: '%' = percentage, '$' = flat dollar amount */
  discountType?: '%' | '$';
}

interface PosStore {
  cart: PosCartItem[];
  customerId: string | null;
  customerName: string | null;

  addItem: (item: Omit<PosCartItem, 'qty'>) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  updateItem: (id: string, updates: Partial<Pick<PosCartItem, 'note' | 'discount' | 'discountType'>>) => void;
  clearCart: () => void;
  setCustomer: (id: string | null, name: string | null) => void;
}

export const usePosStore = create<PosStore>((set) => ({
  cart: [],
  customerId: null,
  customerName: null,

  addItem: (item) =>
    set((state) => {
      const existing = state.cart.find((i) => i.id === item.id);
      if (existing) {
        return {
          cart: state.cart.map((i) =>
            i.id === item.id ? { ...i, qty: i.qty + 1 } : i,
          ),
        };
      }
      return { cart: [...state.cart, { ...item, qty: 1 }] };
    }),

  updateItem: (id, updates) =>
    set((state) => ({
      cart: state.cart.map((i) =>
        i.id === id ? { ...i, ...updates } : i,
      ),
    })),

  removeItem: (id) =>
    set((state) => {
      const item = state.cart.find((i) => i.id === id);
      if (!item) return state;
      if (item.qty === 1) return { cart: state.cart.filter((i) => i.id !== id) };
      return {
        cart: state.cart.map((i) =>
          i.id === id ? { ...i, qty: i.qty - 1 } : i,
        ),
      };
    }),

  updateQty: (id, qty) =>
    set((state) => {
      if (qty <= 0) return { cart: state.cart.filter((i) => i.id !== id) };
      return {
        cart: state.cart.map((i) => (i.id === id ? { ...i, qty } : i)),
      };
    }),

  clearCart: () => set({ cart: [], customerId: null, customerName: null }),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),
}));
