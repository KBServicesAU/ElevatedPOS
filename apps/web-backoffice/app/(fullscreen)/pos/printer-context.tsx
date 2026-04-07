'use client';

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';
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
