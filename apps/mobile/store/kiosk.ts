import { create } from 'zustand';

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

export interface CartItem {
  id: string;
  cartKey: string;
  name: string;
  price: number;
  qty: number;
  modifiers: SelectedModifier[];
  specialNote?: string;
}

export interface LoyaltyAccount {
  phone: string;
  name: string;
  points: number;
  tier: string;
}

export interface AppliedDiscount {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  label: string;
}

type OrderType = 'dine_in' | 'takeaway';

interface KioskState {
  language: 'en' | 'zh' | 'ar';
  setLanguage: (lang: 'en' | 'zh' | 'ar') => void;
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  updateCartQty: (cartKey: string, qty: number) => void;
  removeFromCart: (cartKey: string) => void;
  clearCart: () => void;
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
  tableNumber: string;
  setTableNumber: (num: string) => void;
  specialInstructions: string;
  setSpecialInstructions: (text: string) => void;
  dineIn: boolean;
  setDineIn: (dineIn: boolean) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  ageVerified: boolean;
  setAgeVerified: (verified: boolean) => void;
  pendingAgeRestrictedProductId: string | null;
  setPendingAgeRestrictedProductId: (id: string | null) => void;
  loyaltyAccount: LoyaltyAccount | null;
  setLoyaltyAccount: (account: LoyaltyAccount | null) => void;
  earnedPoints: number | null;
  setEarnedPoints: (pts: number | null) => void;
  appliedDiscount: AppliedDiscount | null;
  setAppliedDiscount: (discount: AppliedDiscount | null) => void;
  orderNumber: string | null;
  setOrderNumber: (num: string) => void;
  resetOrder: () => void;
  resetKiosk: () => void;
}

const initialOrderState = {
  cartItems: [] as CartItem[],
  orderType: 'dine_in' as OrderType,
  tableNumber: '',
  specialInstructions: '',
  dineIn: true,
  customerName: '',
  ageVerified: false,
  pendingAgeRestrictedProductId: null as string | null,
  loyaltyAccount: null as LoyaltyAccount | null,
  earnedPoints: null as number | null,
  appliedDiscount: null as AppliedDiscount | null,
  orderNumber: null as string | null,
};

const initialState = {
  language: 'en' as const,
  ...initialOrderState,
};

export const useKioskStore = create<KioskState>((set) => ({
  ...initialState,
  setLanguage: (language) => set({ language }),
  addToCart: (item) =>
    set((state) => {
      const existing = state.cartItems.find((i) => i.cartKey === item.cartKey);
      if (existing) {
        return { cartItems: state.cartItems.map((i) => i.cartKey === item.cartKey ? { ...i, qty: i.qty + item.qty } : i) };
      }
      return { cartItems: [...state.cartItems, item] };
    }),
  updateCartQty: (cartKey, qty) =>
    set((state) => ({ cartItems: state.cartItems.map((i) => (i.cartKey === cartKey ? { ...i, qty } : i)) })),
  removeFromCart: (cartKey) =>
    set((state) => ({ cartItems: state.cartItems.filter((i) => i.cartKey !== cartKey) })),
  clearCart: () =>
    set({ cartItems: [], orderType: 'dine_in', tableNumber: '', ageVerified: false, pendingAgeRestrictedProductId: null }),
  setOrderType: (orderType) => set({ orderType, dineIn: orderType === 'dine_in' }),
  setTableNumber: (tableNumber) => set({ tableNumber }),
  setSpecialInstructions: (specialInstructions) => set({ specialInstructions }),
  setDineIn: (dineIn) => set({ dineIn, orderType: dineIn ? 'dine_in' : 'takeaway' }),
  setCustomerName: (customerName) => set({ customerName }),
  setAgeVerified: (ageVerified) => set({ ageVerified }),
  setPendingAgeRestrictedProductId: (pendingAgeRestrictedProductId) => set({ pendingAgeRestrictedProductId }),
  setLoyaltyAccount: (loyaltyAccount) => set({ loyaltyAccount }),
  setEarnedPoints: (earnedPoints) => set({ earnedPoints }),
  setAppliedDiscount: (appliedDiscount) => set({ appliedDiscount }),
  setOrderNumber: (orderNumber) => set({ orderNumber }),
  resetOrder: () => set((state) => ({ ...initialOrderState, language: state.language })),
  resetKiosk: () => set({ ...initialState }),
}));
