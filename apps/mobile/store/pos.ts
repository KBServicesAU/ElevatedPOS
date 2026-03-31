import { create } from 'zustand';

export interface PosCartItem { id: string; name: string; price: number; qty: number; emoji: string; }

interface PosStore {
  cart: PosCartItem[];
  addItem: (item: Omit<PosCartItem, 'qty'>) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
}

export const usePosStore = create<PosStore>((set) => ({
  cart: [],
  addItem: (item) => set((state) => {
    const existing = state.cart.find((i) => i.id === item.id);
    if (existing) return { cart: state.cart.map((i) => i.id === item.id ? { ...i, qty: i.qty + 1 } : i) };
    return { cart: [...state.cart, { ...item, qty: 1 }] };
  }),
  removeItem: (id) => set((state) => {
    const item = state.cart.find((i) => i.id === id);
    if (!item) return state;
    if (item.qty === 1) return { cart: state.cart.filter((i) => i.id !== id) };
    return { cart: state.cart.map((i) => i.id === id ? { ...i, qty: i.qty - 1 } : i) };
  }),
  clearCart: () => set({ cart: [] }),
}));
