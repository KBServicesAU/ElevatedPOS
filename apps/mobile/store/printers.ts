import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'elevatedpos_printer_config';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PrinterConnectionType = 'network' | 'usb' | 'bluetooth';

/** Identifies which physical printer to target. */
export type PrinterRole = 'receipt' | 'order';

/** A single physical printer's connection details. */
export interface PrinterDevice {
  type: PrinterConnectionType | null;
  /** IP:port for network, path for USB, address for BT */
  address: string;
  /** Friendly printer name */
  name: string;
  /** Paper width in mm (58 or 80) */
  paperWidth: 58 | 80;
}

export interface PrinterConfig extends PrinterDevice {
  /** Automatically print receipts on order placement */
  autoPrint: boolean;
  /** Also print a simplified kitchen order ticket after receipt */
  printOrderTicket: boolean;
  /**
   * Optional second physical printer for kitchen / bar order tickets.
   * If set, `printOrderTicket` will be sent to this printer instead of
   * the receipt printer.
   */
  orderPrinter: PrinterDevice;
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

const DEFAULT_DEVICE: PrinterDevice = {
  type: null,
  address: '',
  name: '',
  paperWidth: 80,
};

const DEFAULTS: PrinterConfig = {
  ...DEFAULT_DEVICE,
  autoPrint: false,
  printOrderTicket: false,
  orderPrinter: { ...DEFAULT_DEVICE },
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
        // Ensure orderPrinter is always a valid PrinterDevice object even if
        // older saved configs predate this field.
        const merged: PrinterConfig = {
          ...DEFAULTS,
          ...parsed,
          orderPrinter: { ...DEFAULT_DEVICE, ...(parsed.orderPrinter ?? {}) },
        };
        set({ config: merged, ready: true });
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
