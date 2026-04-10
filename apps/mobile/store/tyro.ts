import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { TyroEnvironment } from '../modules/tyro-tta';

/**
 * Persistent Tyro configuration.
 *
 * Stored in SecureStore because it contains an API key. The key is
 * issued by Tyro during on-boarding (Browser/iOS cert).
 *
 * NOTE: The Tyro iClient SDK itself stores the terminal integration
 * key in localStorage within its own WebView, so we do not persist
 * that here — losing this config does not unpair the terminal.
 */

const STORAGE_KEY = 'elevatedpos_tyro_config';

export interface TyroConfig {
  /** Tyro-issued API key (from Portal → integrations). */
  apiKey: string;
  /** Simulator / test / production. */
  environment: TyroEnvironment;

  /** Last-known pairing identifiers. Populated after a successful pair. */
  mid: string;
  tid: string;
  /** Populated on successful pair (masked for display). */
  integrationKeyMask: string | null;

  /** If true, use integrated receipts (merchant receipt rendered by POS). */
  integratedReceipts: boolean;
  /** If true, POS will send enableSurcharge=true on purchases. */
  enableSurcharge: boolean;
  /** If true, POS will prompt for a tip amount at the terminal. */
  tippingEnabled: boolean;
  /** If true, POS will offer cashout on purchases. */
  cashoutEnabled: boolean;

  /** Whether to auto-init on app start. */
  autoInit: boolean;
}

interface TyroStore {
  config: TyroConfig;
  ready: boolean;
  hydrate: () => Promise<void>;
  setConfig: (updates: Partial<TyroConfig>) => Promise<void>;
  clearConfig: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULTS: TyroConfig = {
  apiKey: '',
  environment: 'simulator',
  mid: '',
  tid: '',
  integrationKeyMask: null,
  integratedReceipts: true,
  enableSurcharge: false,
  tippingEnabled: false,
  cashoutEnabled: false,
  autoInit: true,
};

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useTyroStore = create<TyroStore>((set, get) => ({
  config: { ...DEFAULTS },
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TyroConfig>;
        set({ config: { ...DEFAULTS, ...parsed }, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  setConfig: async (updates) => {
    const next = { ...get().config, ...updates };
    set({ config: next });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage write failed — config is still in memory
    }
  },

  clearConfig: async () => {
    set({ config: { ...DEFAULTS } });
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
}));
