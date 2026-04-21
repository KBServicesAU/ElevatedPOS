import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'elevatedpos_receipt_prefs';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * How the ANZ terminal receipt should be printed relative to the POS
 * receipt produced by ElevatedPOS.
 *
 *  - `off`        — never print the ANZ receipt at all.
 *  - `attached`   — append it to the bottom of the POS receipt (default).
 *  - `standalone` — print the ANZ receipt as its own cut receipt.
 */
export type EftposAttach = 'off' | 'attached' | 'standalone';

export interface ReceiptPrefs {
  /** Print the merchant-copy POS receipt. */
  printStoreReceipt: boolean;
  /** Print the customer-copy POS receipt. */
  printCustomerReceipt: boolean;
  /** How to emit the ANZ merchant terminal receipt. */
  eftposStoreAttach: EftposAttach;
  /** How to emit the ANZ customer terminal receipt. */
  eftposCustomerAttach: EftposAttach;
}

interface ReceiptPrefsStore extends ReceiptPrefs {
  /** True once hydrate() has finished reading SecureStore. */
  ready: boolean;
  hydrate: () => Promise<void>;
  /** Patch one or more prefs and persist immediately. */
  setPrint: (patch: Partial<ReceiptPrefs>) => Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULTS: ReceiptPrefs = {
  printStoreReceipt: true,
  printCustomerReceipt: true,
  eftposStoreAttach: 'attached',
  eftposCustomerAttach: 'attached',
};

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useReceiptPrefs = create<ReceiptPrefsStore>((set, get) => ({
  ...DEFAULTS,
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ReceiptPrefs>;
        set({
          printStoreReceipt:
            typeof parsed.printStoreReceipt === 'boolean'
              ? parsed.printStoreReceipt
              : DEFAULTS.printStoreReceipt,
          printCustomerReceipt:
            typeof parsed.printCustomerReceipt === 'boolean'
              ? parsed.printCustomerReceipt
              : DEFAULTS.printCustomerReceipt,
          eftposStoreAttach: isEftposAttach(parsed.eftposStoreAttach)
            ? parsed.eftposStoreAttach
            : DEFAULTS.eftposStoreAttach,
          eftposCustomerAttach: isEftposAttach(parsed.eftposCustomerAttach)
            ? parsed.eftposCustomerAttach
            : DEFAULTS.eftposCustomerAttach,
          ready: true,
        });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  setPrint: async (patch) => {
    const current = get();
    const next: ReceiptPrefs = {
      printStoreReceipt:
        patch.printStoreReceipt ?? current.printStoreReceipt,
      printCustomerReceipt:
        patch.printCustomerReceipt ?? current.printCustomerReceipt,
      eftposStoreAttach:
        patch.eftposStoreAttach ?? current.eftposStoreAttach,
      eftposCustomerAttach:
        patch.eftposCustomerAttach ?? current.eftposCustomerAttach,
    };
    set(next);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage write failed — values are still in memory.
    }
  },
}));

function isEftposAttach(v: unknown): v is EftposAttach {
  return v === 'off' || v === 'attached' || v === 'standalone';
}
