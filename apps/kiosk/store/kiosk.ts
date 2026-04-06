import { create } from 'zustand';

export interface ModifierOption {
  name: string;
  price: number;
}

export interface ModifierGroup {
  name: string;
  required: boolean;
  maxSelections: number;
  options: ModifierOption[];
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

export interface CartItem {
  id: string;
  /** Unique key for each cart line (id + modifier combo) */
  cartKey: string;
  name: string;
  price: number;
  qty: number;
  modifiers: SelectedModifier[];
  specialNote?: string;
  imageUrl?: string;
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
  // Language
  language: 'en' | 'zh' | 'ar';
  setLanguage: (lang: 'en' | 'zh' | 'ar') => void;

  // Cart
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  updateCartQty: (cartKey: string, qty: number) => void;
  removeFromCart: (cartKey: string) => void;
  clearCart: () => void;

  // Order options
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
  tableNumber: string;
  setTableNumber: (num: string) => void;
  specialInstructions: string;
  setSpecialInstructions: (text: string) => void;

  // Legacy (kept for loyalty screen compatibility)
  dineIn: boolean;
  setDineIn: (dineIn: boolean) => void;
  customerName: string;
  setCustomerName: (name: string) => void;

  // Age verification
  ageVerified: boolean;
  setAgeVerified: (verified: boolean) => void;
  /** ID of the last age-restricted product that triggered the verification flow */
  pendingAgeRestrictedProductId: string | null;
  setPendingAgeRestrictedProductId: (id: string | null) => void;

  // Loyalty
  loyaltyAccount: LoyaltyAccount | null;
  setLoyaltyAccount: (account: LoyaltyAccount | null) => void;

  // Discount
  appliedDiscount: AppliedDiscount | null;
  setAppliedDiscount: (discount: AppliedDiscount | null) => void;

  // Order result
  orderNumber: string | null;
  setOrderNumber: (num: string) => void;

  // Reset order for next customer (preserves language)
  resetOrder: () => void;

  // Full kiosk reset (language too)
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
        return {
          cartItems: state.cartItems.map((i) =>
            i.cartKey === item.cartKey ? { ...i, qty: i.qty + item.qty } : i,
          ),
        };
      }
      return { cartItems: [...state.cartItems, item] };
    }),

  updateCartQty: (cartKey, qty) =>
    set((state) => ({
      cartItems: state.cartItems.map((i) => (i.cartKey === cartKey ? { ...i, qty } : i)),
    })),

  removeFromCart: (cartKey) =>
    set((state) => ({ cartItems: state.cartItems.filter((i) => i.cartKey !== cartKey) })),

  clearCart: () =>
    set({
      cartItems: [],
      orderType: 'dine_in',
      tableNumber: '',
      ageVerified: false,
      pendingAgeRestrictedProductId: null,
    }),

  setOrderType: (orderType) => set({ orderType, dineIn: orderType === 'dine_in' }),
  setTableNumber: (tableNumber) => set({ tableNumber }),
  setSpecialInstructions: (specialInstructions) => set({ specialInstructions }),

  setDineIn: (dineIn) => set({ dineIn, orderType: dineIn ? 'dine_in' : 'takeaway' }),
  setCustomerName: (customerName) => set({ customerName }),

  setAgeVerified: (ageVerified) => set({ ageVerified }),
  setPendingAgeRestrictedProductId: (pendingAgeRestrictedProductId) => set({ pendingAgeRestrictedProductId }),

  setLoyaltyAccount: (loyaltyAccount) => set({ loyaltyAccount }),

  setAppliedDiscount: (appliedDiscount) => set({ appliedDiscount }),

  setOrderNumber: (orderNumber) => set({ orderNumber }),

  resetOrder: () =>
    set((state) => ({
      ...initialOrderState,
      language: state.language,
    })),

  resetKiosk: () => set({ ...initialState }),
}));
