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

/** v2.7.77 — QR-pay payload for the customer-facing display.
 *  Mirrors what the staff-side QR modal shows so the customer can
 *  scan from the larger secondary screen rather than reaching across
 *  the counter. */
export interface DisplayQrPay {
  /** Stripe Checkout Session URL (the QR encodes this). */
  url: string;
  /** Amount in cents the customer is paying (subtotal + tip). */
  amountCents: number;
  /** Optional tip amount, broken out for display. */
  tipCents: number;
}

type DisplayPhase = 'idle' | 'transaction' | 'thankyou' | 'qr_pay';

interface CustomerDisplayStore {
  settings: CustomerDisplaySettings;
  phase: DisplayPhase;
  transaction: DisplayTransaction;
  qrPay: DisplayQrPay | null;
  ready: boolean;
  secondaryAvailable: boolean;

  hydrate: () => Promise<void>;
  setSettings: (updates: Partial<CustomerDisplaySettings>) => Promise<void>;

  /** Called by POS when cart changes */
  syncTransaction: (tx: DisplayTransaction) => void;
  /** v2.7.77 — Show a QR-pay screen on the customer display while the
   *  staff modal is up. The QR encodes the same URL the staff screen
   *  shows; the customer can scan from whichever surface is closer. */
  showQrPay: (qr: DisplayQrPay) => void;
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

function nativeSync(
  phase: DisplayPhase,
  settings: CustomerDisplaySettings,
  tx: DisplayTransaction,
  qr: DisplayQrPay | null,
) {
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
    } else if (phase === 'qr_pay' && qr) {
      // v2.7.77 — QR-pay phase. v2.7.84 promoted showQrPay to a
      // first-class native function (renders the QR via ZXing on the
      // customer-facing screen). Older APKs that pre-date that build
      // would no-op here, so the staff-side modal still shows the QR.
      const payload = JSON.stringify({
        url: qr.url,
        amount: (qr.amountCents / 100).toFixed(2),
        tip: qr.tipCents > 0 ? (qr.tipCents / 100).toFixed(2) : null,
      });
      try {
        SecondaryDisplay.showQrPay(payload);
      } catch {
        // Pre-v2.7.84 APK without showQrPay — fall back to the
        // transaction screen so the customer sees something.
        SecondaryDisplay.showTransaction(
          JSON.stringify({
            items: [
              {
                name: 'Scan the QR code on the staff screen',
                qty: 1,
                price: qr.amountCents / 100,
              },
            ],
            total: (qr.amountCents + qr.tipCents) / 100,
            gst: 0,
            itemCount: 1,
            customerName: '',
          }),
        );
      }
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
  qrPay: null,
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
      set({ transaction: tx, phase: 'transaction', qrPay: null });
      nativeSync('transaction', get().settings, tx, null);
    } else {
      set({ transaction: { ...EMPTY_TX }, phase: 'idle', qrPay: null });
      nativeSync('idle', get().settings, EMPTY_TX, null);
    }
  },

  showQrPay: (qr) => {
    set({ phase: 'qr_pay', qrPay: qr });
    nativeSync('qr_pay', get().settings, get().transaction, qr);
  },

  showThankYou: () => {
    set({ phase: 'thankyou', qrPay: null });
    const { settings, transaction } = get();
    nativeSync('thankyou', settings, transaction, null);
    // Auto-return to idle after 4 seconds
    setTimeout(() => {
      if (get().phase === 'thankyou') {
        set({ phase: 'idle', transaction: { ...EMPTY_TX } });
        nativeSync('idle', get().settings, EMPTY_TX, null);
      }
    }, 4000);
  },

  resetToIdle: () => {
    set({ phase: 'idle', transaction: { ...EMPTY_TX }, qrPay: null });
    nativeSync('idle', get().settings, EMPTY_TX, null);
  },
}));
