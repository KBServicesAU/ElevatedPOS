import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'elevatedpos_printer_config';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PrinterConnectionType = 'network' | 'usb' | 'bluetooth';

export interface PrinterConfig {
  type: PrinterConnectionType | null;
  /** IP:port for network, path for USB, address for BT */
  address: string;
  /** Friendly printer name */
  name: string;
  /** Automatically print receipts on order placement */
  autoPrint: boolean;
  /** Paper width in mm (58 or 80) */
  paperWidth: 58 | 80;
  /** Also print a simplified kitchen order ticket after receipt */
  printOrderTicket: boolean;
}

interface PrinterStore {
  config: PrinterConfig;
  ready: boolean;

  /** Load saved config from SecureStore */
  hydrate: () => Promise<void>;
  /** Update one or more config fields and persist */
  setConfig: (updates: Partial<PrinterConfig>) => Promise<void>;
  /** Reset to defaults */
  clearConfig: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULTS: PrinterConfig = {
  type: null,
  address: '',
  name: '',
  autoPrint: false,
  paperWidth: 80,
  printOrderTicket: false,
};

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const usePrinterStore = create<PrinterStore>((set, get) => ({
  config: { ...DEFAULTS },
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PrinterConfig>;
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
