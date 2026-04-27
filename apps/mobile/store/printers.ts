import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'elevatedpos_printer_config';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PrinterConnectionType = 'network' | 'usb' | 'bluetooth';

/** Identifies which physical printer to target. */
export type PrinterRole = 'receipt' | 'order';

/**
 * Routing tag for an order printer. Each `OrderPrinterDevice` carries a
 * destination; line items inherit a destination from their `categories.printer_destination`
 * field and the `printOrderTickets` helper groups + dispatches accordingly.
 *
 * 'kitchen' / 'bar' / 'cold_kitchen' / 'ready_station' are the common
 * built-ins; `custom` lets the merchant tag a printer with a free-form
 * label that matches the same value on a category. 'none' is reserved
 * for categories that should NOT trigger any kitchen ticket (e.g.
 * front-of-house upsells, gift cards).
 */
export type OrderPrinterDestination =
  | 'kitchen'
  | 'bar'
  | 'cold_kitchen'
  | 'ready_station'
  | 'custom'
  | string;

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

/**
 * v2.7.48 — multi-order-printer routing.
 *
 * Each OrderPrinterDevice extends PrinterDevice with:
 *  - `id`           — stable client-side UUID, used as the React list key
 *                     and to disambiguate two printers with the same name.
 *  - `destination`  — the routing tag matched against `category.printerDestination`.
 *
 * If only the legacy `config.orderPrinter` (singular) is set, the runtime
 * treats it as a single 'kitchen' destination so existing single-printer
 * shops keep working without touching the dashboard.
 */
export interface OrderPrinterDevice extends PrinterDevice {
  /** Local id (UUID/timestamp) so the More-page list can key + delete rows. */
  id: string;
  /** Routing tag; matches `category.printerDestination` from the catalog. */
  destination: OrderPrinterDestination;
}

export interface PrinterConfig extends PrinterDevice {
  /** Automatically print receipts on order placement */
  autoPrint: boolean;
  /** Also print a simplified kitchen order ticket after receipt */
  printOrderTicket: boolean;
  /**
   * Legacy single order printer (pre-v2.7.48). Kept for back-compat with
   * SecureStore configs written by older mobile builds. New deployments
   * should use `orderPrinters[]` below; when the array is empty AND
   * `orderPrinter.address` is set we treat the legacy printer as a single
   * 'kitchen' destination so existing rigs keep working unchanged.
   */
  orderPrinter: PrinterDevice;
  /**
   * v2.7.48 — list of order printers with per-printer destination tags.
   * Kitchen, bar, ready station etc. — `printOrderTickets` groups order
   * lines by `category.printerDestination` and dispatches one ticket
   * per destination to the matching printer.
   */
  orderPrinters: OrderPrinterDevice[];
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
  orderPrinters: [],
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
        const orderPrinter = { ...DEFAULT_DEVICE, ...(parsed.orderPrinter ?? {}) };
        const orderPrinters = Array.isArray(parsed.orderPrinters)
          ? parsed.orderPrinters.filter((p): p is OrderPrinterDevice =>
              p != null && typeof p === 'object' && typeof (p as OrderPrinterDevice).id === 'string',
            )
          : [];
        const merged: PrinterConfig = {
          ...DEFAULTS,
          ...parsed,
          orderPrinter,
          orderPrinters,
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
