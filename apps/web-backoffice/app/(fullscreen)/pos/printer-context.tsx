'use client';

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';

interface PrinterContextValue {
  receiptPort: SerialPort | null;
  orderPort: SerialPort | null;
  receiptConnected: boolean;
  orderConnected: boolean;
  connectPrinter: (type: 'receipt' | 'order', method: 'serial' | 'bluetooth') => Promise<void>;
  disconnectPrinter: (type: 'receipt' | 'order') => void;
}

const PrinterContext = createContext<PrinterContextValue | null>(null);

export function PrinterProvider({ children }: { children: ReactNode }) {
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

  return (
    <PrinterContext.Provider value={{
      receiptPort: receiptPortRef.current,
      orderPort: orderPortRef.current,
      receiptConnected,
      orderConnected,
      connectPrinter,
      disconnectPrinter,
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
