import { create } from 'zustand';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export interface LoyaltyAccount {
  phone: string;
  name: string;
  points: number;
  tier: string;
}

interface KioskState {
  // Language
  language: 'en' | 'zh';
  setLanguage: (lang: 'en' | 'zh') => void;

  // Cart
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  updateCartQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;

  // Order options
  dineIn: boolean;
  setDineIn: (dineIn: boolean) => void;
  customerName: string;
  setCustomerName: (name: string) => void;

  // Loyalty
  loyaltyAccount: LoyaltyAccount | null;
  setLoyaltyAccount: (account: LoyaltyAccount | null) => void;

  // Order result
  orderNumber: string | null;
  setOrderNumber: (num: string) => void;

  // Reset everything for next customer
  resetKiosk: () => void;
}

const initialState = {
  language: 'en' as const,
  cartItems: [] as CartItem[],
  dineIn: true,
  customerName: '',
  loyaltyAccount: null as LoyaltyAccount | null,
  orderNumber: null as string | null,
};

export const useKioskStore = create<KioskState>((set) => ({
  ...initialState,

  setLanguage: (language) => set({ language }),

  addToCart: (item) =>
    set((state) => {
      const existing = state.cartItems.find((i) => i.id === item.id);
      if (existing) {
        return {
          cartItems: state.cartItems.map((i) =>
            i.id === item.id ? { ...i, qty: i.qty + item.qty } : i,
          ),
        };
      }
      return { cartItems: [...state.cartItems, item] };
    }),

  updateCartQty: (id, qty) =>
    set((state) => ({
      cartItems: state.cartItems.map((i) => (i.id === id ? { ...i, qty } : i)),
    })),

  removeFromCart: (id) =>
    set((state) => ({ cartItems: state.cartItems.filter((i) => i.id !== id) })),

  clearCart: () => set({ cartItems: [] }),

  setDineIn: (dineIn) => set({ dineIn }),
  setCustomerName: (customerName) => set({ customerName }),

  setLoyaltyAccount: (loyaltyAccount) => set({ loyaltyAccount }),

  setOrderNumber: (orderNumber) => set({ orderNumber }),

  resetKiosk: () =>
    set({
      cartItems: [],
      dineIn: true,
      customerName: '',
      loyaltyAccount: null,
      orderNumber: null,
      language: 'en',
    }),
}));
