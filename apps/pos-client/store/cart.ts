import { create } from 'zustand';

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

interface CartStore {
  items: CartItem[];
  add: (item: Omit<CartItem, 'qty'>) => void;
  remove: (id: string) => void;
  clear: () => void;
  total: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
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
  clear: () => set({ items: [] }),
  total: () => {
    const subtotal = get().items.reduce((sum, i) => sum + i.price * i.qty, 0);
    return subtotal * 1.1; // include 10% tax
  },
}));
