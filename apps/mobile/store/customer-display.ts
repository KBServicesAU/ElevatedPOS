import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'elevatedpos_customer_display';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CustomerDisplaySettings {
  /** Enable the customer-facing display */
  enabled: boolean;
  /** Show the ElevatedPOS logo on idle */
  showLogo: boolean;
  /** Show individual line items on the display */
  showLineItems: boolean;
  /** Show GST breakdown */
  showGst: boolean;
  /** Custom welcome message shown when idle */
  welcomeMessage: string;
  /** Custom thank-you message shown after order */
  thankYouMessage: string;
}

/** Live transaction state pushed to the display */
export interface DisplayTransaction {
  items: { name: string; qty: number; price: number }[];
  total: number;
  gst: number;
  itemCount: number;
  customerName: string | null;
}

type DisplayPhase = 'idle' | 'transaction' | 'thankyou';

interface CustomerDisplayStore {
  settings: CustomerDisplaySettings;
  phase: DisplayPhase;
  transaction: DisplayTransaction;
  ready: boolean;

  hydrate: () => Promise<void>;
  setSettings: (updates: Partial<CustomerDisplaySettings>) => Promise<void>;

  /** Called by POS when cart changes */
  syncTransaction: (tx: DisplayTransaction) => void;
  /** Show thank-you after order placed */
  showThankYou: () => void;
  /** Return to idle */
  resetToIdle: () => void;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULTS: CustomerDisplaySettings = {
  enabled: false,
  showLogo: true,
  showLineItems: true,
  showGst: true,
  welcomeMessage: 'Welcome',
  thankYouMessage: 'Thank you for your purchase!',
};

const EMPTY_TX: DisplayTransaction = {
  items: [],
  total: 0,
  gst: 0,
  itemCount: 0,
  customerName: null,
};

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useCustomerDisplayStore = create<CustomerDisplayStore>((set, get) => ({
  settings: { ...DEFAULTS },
  phase: 'idle',
  transaction: { ...EMPTY_TX },
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CustomerDisplaySettings>;
        set({ settings: { ...DEFAULTS, ...parsed }, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  setSettings: async (updates) => {
    const next = { ...get().settings, ...updates };
    set({ settings: next });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // persist failed — in-memory only
    }
  },

  syncTransaction: (tx) => {
    if (tx.itemCount > 0) {
      set({ transaction: tx, phase: 'transaction' });
    } else {
      set({ transaction: { ...EMPTY_TX }, phase: 'idle' });
    }
  },

  showThankYou: () => {
    set({ phase: 'thankyou' });
    // Auto-return to idle after 4 seconds
    setTimeout(() => {
      if (get().phase === 'thankyou') {
        set({ phase: 'idle', transaction: { ...EMPTY_TX } });
      }
    }, 4000);
  },

  resetToIdle: () => set({ phase: 'idle', transaction: { ...EMPTY_TX } }),
}));
