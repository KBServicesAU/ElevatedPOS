'use client';

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';
import {
  printReceipt as doPrintReceipt,
  openCashDrawer as doOpenCashDrawer,
  type ReceiptData,
} from './receipt-printer';

interface PrinterContextValue {
  receiptConnected: boolean;
  orderConnected: boolean;
  connectPrinter: (type: 'receipt' | 'order', method: 'serial' | 'bluetooth') => Promise<void>;
  disconnectPrinter: (type: 'receipt' | 'order') => void;
  /** Print a receipt to the connected receipt printer. No-ops if not connected. */
  printReceipt: (data: ReceiptData) => Promise<void>;
  /** Open the cash drawer via the receipt printer port. No-ops if not connected. */
  openCashDrawer: () => Promise<void>;
}

const PrinterContext = createContext<PrinterContextValue | null>(null);

export function PrinterProvider({ children }: { children: ReactNode }) {
  // Refs hold the live port objects; they are NOT exposed in context because
  // ref.current is not tracked by React and reading it from context always
  // returns the stale value captured at render time.
  const receiptPortRef = useRef<SerialPort | null>(null);
  const orderPortRef   = useRef<SerialPort | null>(null);

  const [receiptConnected, setReceiptConnected] = useState(false);
  const [orderConnected,   setOrderConnected]   = useState(false);

  const connectPrinter = useCallback(async (type: 'receipt' | 'order', method: 'serial' | 'bluetooth') => {
    if (method === 'bluetooth') {
      throw new Error('Bluetooth printing is not yet supported. Use USB/Serial.');
    }
    if (method === 'serial') {
      if (!('serial' in navigator)) {
        throw new Error('Web Serial is not supported in this browser. Use Chrome or Edge.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = await (navigator as any).serial.requestPort({ filters: [] }) as SerialPort;
      if (type === 'receipt') {
        receiptPortRef.current = port;
        setReceiptConnected(true);
      } else {
        orderPortRef.current = port;
        setOrderConnected(true);
      }
    }
  }, []);

  const disconnectPrinter = useCallback((type: 'receipt' | 'order') => {
    if (type === 'receipt') {
      receiptPortRef.current = null;
      setReceiptConnected(false);
    } else {
      orderPortRef.current = null;
      setOrderConnected(false);
    }
  }, []);

  const printReceipt = useCallback(async (data: ReceiptData): Promise<void> => {
    const port = receiptPortRef.current;
    if (!port) return;
    await doPrintReceipt(port, data);
  }, []);

  const openCashDrawer = useCallback(async (): Promise<void> => {
    const port = receiptPortRef.current;
    if (!port) return;
    await doOpenCashDrawer(port);
  }, []);

  return (
    <PrinterContext.Provider value={{
      receiptConnected,
      orderConnected,
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
