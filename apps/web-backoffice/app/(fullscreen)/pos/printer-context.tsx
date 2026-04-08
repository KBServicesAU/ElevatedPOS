'use client';

import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  printReceipt as doPrintReceipt,
  openCashDrawer as doOpenCashDrawer,
  printReceiptUsb as doPrintReceiptUsb,
  openCashDrawerUsb as doOpenCashDrawerUsb,
  USB_PRINTER_FILTERS,
  type ReceiptData,
} from './receipt-printer';

type ConnectionMethod = 'serial' | 'usb' | 'bluetooth';

interface PrinterConnection {
  method: ConnectionMethod;
  serialPort?: SerialPort;
  usbDevice?: USBDevice;
}

interface SavedPrinterConfig {
  receiptMethod: ConnectionMethod | null;
  orderMethod: ConnectionMethod | null;
}

const STORAGE_KEY = 'elevatedpos_printer_config';

function loadConfig(): SavedPrinterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SavedPrinterConfig;
  } catch { /* ignore */ }
  return { receiptMethod: null, orderMethod: null };
}

function saveConfig(config: SavedPrinterConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

interface PrinterContextValue {
  receiptConnected: boolean;
  orderConnected: boolean;
  receiptMethod: ConnectionMethod | null;
  orderMethod: ConnectionMethod | null;
  connectPrinter: (type: 'receipt' | 'order', method: ConnectionMethod) => Promise<void>;
  disconnectPrinter: (type: 'receipt' | 'order') => void;
  /** Print a receipt to the connected receipt printer. No-ops if not connected. */
  printReceipt: (data: ReceiptData) => Promise<void>;
  /** Open the cash drawer via the receipt printer port. No-ops if not connected. */
  openCashDrawer: () => Promise<void>;
}

const PrinterContext = createContext<PrinterContextValue | null>(null);

export function PrinterProvider({ children }: { children: ReactNode }) {
  const receiptRef = useRef<PrinterConnection | null>(null);
  const orderRef   = useRef<PrinterConnection | null>(null);

  const [receiptConnected, setReceiptConnected] = useState(false);
  const [orderConnected,   setOrderConnected]   = useState(false);
  const [receiptMethod,    setReceiptMethod]     = useState<ConnectionMethod | null>(null);
  const [orderMethod,      setOrderMethod]       = useState<ConnectionMethod | null>(null);

  /* ── Auto-reconnect on mount from saved config ────────────────────── */
  useEffect(() => {
    const config = loadConfig();

    async function reconnect(type: 'receipt' | 'order', method: ConnectionMethod | null) {
      if (!method) return;
      try {
        if (method === 'usb' && 'usb' in navigator) {
          // WebUSB remembers previously granted devices
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const devices = await (navigator as any).usb.getDevices() as USBDevice[];
          if (devices.length > 0) {
            const device = devices[0]!;
            const conn: PrinterConnection = { method: 'usb', usbDevice: device };
            if (type === 'receipt') {
              receiptRef.current = conn;
              setReceiptConnected(true);
              setReceiptMethod('usb');
            } else {
              orderRef.current = conn;
              setOrderConnected(true);
              setOrderMethod('usb');
            }
          }
        } else if (method === 'serial' && 'serial' in navigator) {
          // Web Serial remembers previously granted ports
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ports = await (navigator as any).serial.getPorts() as SerialPort[];
          if (ports.length > 0) {
            const port = ports[0]!;
            const conn: PrinterConnection = { method: 'serial', serialPort: port };
            if (type === 'receipt') {
              receiptRef.current = conn;
              setReceiptConnected(true);
              setReceiptMethod('serial');
            } else {
              orderRef.current = conn;
              setOrderConnected(true);
              setOrderMethod('serial');
            }
          }
        }
      } catch {
        // Auto-reconnect failed — user will need to manually connect
      }
    }

    reconnect('receipt', config.receiptMethod);
    reconnect('order', config.orderMethod);
  }, []);

  const connectPrinter = useCallback(async (type: 'receipt' | 'order', method: ConnectionMethod) => {
    if (method === 'bluetooth') {
      throw new Error('Bluetooth printing is not yet supported. Use USB or Serial.');
    }

    if (method === 'serial') {
      if (!('serial' in navigator)) {
        throw new Error('Web Serial is not supported in this browser. Use Chrome or Edge.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = await (navigator as any).serial.requestPort({ filters: [] }) as SerialPort;
      const conn: PrinterConnection = { method: 'serial', serialPort: port };

      if (type === 'receipt') {
        receiptRef.current = conn;
        setReceiptConnected(true);
        setReceiptMethod('serial');
      } else {
        orderRef.current = conn;
        setOrderConnected(true);
        setOrderMethod('serial');
      }
    }

    if (method === 'usb') {
      if (!('usb' in navigator)) {
        throw new Error('WebUSB is not supported in this browser. Use Chrome or Edge.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const device = await (navigator as any).usb.requestDevice({
        filters: USB_PRINTER_FILTERS,
      }) as USBDevice;
      const conn: PrinterConnection = { method: 'usb', usbDevice: device };

      if (type === 'receipt') {
        receiptRef.current = conn;
        setReceiptConnected(true);
        setReceiptMethod('usb');
      } else {
        orderRef.current = conn;
        setOrderConnected(true);
        setOrderMethod('usb');
      }
    }

    // Persist the selection
    const config = loadConfig();
    if (type === 'receipt') config.receiptMethod = method;
    else config.orderMethod = method;
    saveConfig(config);
  }, []);

  const disconnectPrinter = useCallback((type: 'receipt' | 'order') => {
    if (type === 'receipt') {
      receiptRef.current = null;
      setReceiptConnected(false);
      setReceiptMethod(null);
    } else {
      orderRef.current = null;
      setOrderConnected(false);
      setOrderMethod(null);
    }

    // Update saved config
    const config = loadConfig();
    if (type === 'receipt') config.receiptMethod = null;
    else config.orderMethod = null;
    saveConfig(config);
  }, []);

  const printReceipt = useCallback(async (data: ReceiptData): Promise<void> => {
    const conn = receiptRef.current;
    if (!conn) return;

    if (conn.method === 'serial' && conn.serialPort) {
      await doPrintReceipt(conn.serialPort, data);
    } else if (conn.method === 'usb' && conn.usbDevice) {
      await doPrintReceiptUsb(conn.usbDevice, data);
    }
  }, []);

  const openCashDrawer = useCallback(async (): Promise<void> => {
    const conn = receiptRef.current;
    if (!conn) return;

    if (conn.method === 'serial' && conn.serialPort) {
      await doOpenCashDrawer(conn.serialPort);
    } else if (conn.method === 'usb' && conn.usbDevice) {
      await doOpenCashDrawerUsb(conn.usbDevice);
    }
  }, []);

  return (
    <PrinterContext.Provider value={{
      receiptConnected,
      orderConnected,
      receiptMethod,
      orderMethod,
      connectPrinter,
      disconnectPrinter,
      printReceipt,
      openCashDrawer,
    }}>
      {children}
    </PrinterContext.Provider>
  );
}

export function usePrinter() {
  const ctx = useContext(PrinterContext);
  if (!ctx) throw new Error('usePrinter must be used inside PrinterProvider');
  return ctx;
}
