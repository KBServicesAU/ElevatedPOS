import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import SecondaryDisplay from '../modules/secondary-display';

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
  secondaryAvailable: boolean;

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
/* Native display helpers                                              */
/* ------------------------------------------------------------------ */

function nativeSync(phase: DisplayPhase, settings: CustomerDisplaySettings, tx: DisplayTransaction) {
  if (!settings.enabled) return;
  try {
    if (phase === 'idle') {
      SecondaryDisplay.showIdle(settings.welcomeMessage);
    } else if (phase === 'transaction') {
      SecondaryDisplay.showTransaction(JSON.stringify({
        items: settings.showLineItems ? tx.items : [],
        total: tx.total,
        gst: settings.showGst ? tx.gst : 0,
        itemCount: tx.itemCount,
        customerName: tx.customerName ?? '',
      }));
    } else if (phase === 'thankyou') {
      SecondaryDisplay.showThankYou(
        settings.thankYouMessage,
        `$${tx.total.toFixed(2)}`,
      );
    }
  } catch {
    // Native module not available — ignore
  }
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useCustomerDisplayStore = create<CustomerDisplayStore>((set, get) => ({
  settings: { ...DEFAULTS },
  phase: 'idle',
  transaction: { ...EMPTY_TX },
  ready: false,
  secondaryAvailable: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      let settings = { ...DEFAULTS };
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CustomerDisplaySettings>;
        settings = { ...DEFAULTS, ...parsed };
      }

      // Check if secondary display is connected
      let available = false;
      try { available = SecondaryDisplay.isAvailable(); } catch { /* not available */ }

      // If enabled and available, show the presentation
      if (settings.enabled && available) {
        try {
          SecondaryDisplay.show();
          SecondaryDisplay.showIdle(settings.welcomeMessage);
        } catch { /* ignore */ }
      }

      set({ settings, ready: true, secondaryAvailable: available });
    } catch {
      set({ ready: true });
    }
  },

  setSettings: async (updates) => {
    const prev = get().settings;
    const next = { ...prev, ...updates };
    set({ settings: next });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // persist failed — in-memory only
    }

    // Handle enable/disable toggle
    if (next.enabled && !prev.enabled) {
      try {
        SecondaryDisplay.show();
        SecondaryDisplay.showIdle(next.welcomeMessage);
      } catch { /* ignore */ }
    } else if (!next.enabled && prev.enabled) {
      try { SecondaryDisplay.hide(); } catch { /* ignore */ }
    }
  },

  syncTransaction: (tx) => {
    if (tx.itemCount > 0) {
      set({ transaction: tx, phase: 'transaction' });
      nativeSync('transaction', get().settings, tx);
    } else {
      set({ transaction: { ...EMPTY_TX }, phase: 'idle' });
      nativeSync('idle', get().settings, EMPTY_TX);
    }
  },

  showThankYou: () => {
    set({ phase: 'thankyou' });
    const { settings, transaction } = get();
    nativeSync('thankyou', settings, transaction);
    // Auto-return to idle after 4 seconds
    setTimeout(() => {
      if (get().phase === 'thankyou') {
        set({ phase: 'idle', transaction: { ...EMPTY_TX } });
        nativeSync('idle', get().settings, EMPTY_TX);
      }
    }, 4000);
  },

  resetToIdle: () => {
    set({ phase: 'idle', transaction: { ...EMPTY_TX } });
    nativeSync('idle', get().settings, EMPTY_TX);
  },
}));
