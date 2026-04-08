/**
 * ESC/POS thermal printer utility for the mobile POS app.
 * Supports USB, Bluetooth, and Network printers via react-native-thermal-receipt-printer.
 */
import { Platform } from 'react-native';
import { usePrinterStore, type PrinterConnectionType } from '../store/printers';

// Lazy-load printer modules to prevent crash if native module is unavailable
let USBPrinter: any = null;
let BLEPrinter: any = null;
let NetPrinter: any = null;

function loadPrinterModules() {
  if (USBPrinter) return;
  try {
    const mod = require('react-native-thermal-receipt-printer');
    USBPrinter = mod.USBPrinter;
    BLEPrinter = mod.BLEPrinter;
    NetPrinter = mod.NetPrinter;
  } catch (err) {
    console.warn('[printer] Failed to load thermal printer module:', err);
  }
}

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

let connected = false;

export async function connectPrinter(): Promise<void> {
  loadPrinterModules();
  const { type, address } = usePrinterStore.getState().config;
  if (!type) throw new Error('No printer type configured');
  if (!USBPrinter) throw new Error('Printer module not available. Rebuild the app may be required.');

  try {
    if (type === 'usb') {
      await USBPrinter.init();
      const devices = await USBPrinter.getDeviceList();
      if (devices.length === 0) throw new Error('No USB printers found. Check the connection.');
      // Connect to first available USB printer (or match by address if set)
      const target = address
        ? devices.find((d: any) => String(d.device_id) === address || d.device_name === address) ?? devices[0]
        : devices[0];
      await USBPrinter.connectPrinter(
        String((target as any).vendor_id ?? ''),
        String((target as any).product_id ?? ''),
      );
      // Save the device info for future reconnection
      await usePrinterStore.getState().setConfig({
        address: String((target as any).device_id ?? (target as any).device_name ?? 'usb'),
        name: (target as any).device_name ?? 'USB Printer',
      });
      connected = true;
    } else if (type === 'bluetooth') {
      await BLEPrinter.init();
      const devices = await BLEPrinter.getDeviceList();
      if (devices.length === 0) throw new Error('No Bluetooth printers found. Make sure the printer is paired.');
      const target = address
        ? devices.find((d: any) => d.inner_mac_address === address || d.device_name === address) ?? devices[0]
        : devices[0];
      await BLEPrinter.connectPrinter((target as any).inner_mac_address ?? '');
      await usePrinterStore.getState().setConfig({
        address: (target as any).inner_mac_address ?? '',
        name: (target as any).device_name ?? 'BT Printer',
      });
      connected = true;
    } else if (type === 'network') {
      if (!address) throw new Error('Network address required (IP:port)');
      await NetPrinter.init();
      const [host, portStr] = address.split(':');
      await NetPrinter.connectPrinter(host!, parseInt(portStr ?? '9100'));
      connected = true;
    }
  } catch (err) {
    connected = false;
    throw err;
  }
}

export async function disconnectPrinter(): Promise<void> {
  const { type } = usePrinterStore.getState().config;
  try {
    if (type === 'usb') await USBPrinter.closeConn();
    else if (type === 'bluetooth') await BLEPrinter.closeConn();
    else if (type === 'network') await NetPrinter.closeConn();
  } catch {
    // ignore disconnect errors
  }
  connected = false;
}

export function isConnected(): boolean {
  return connected;
}

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

export interface DiscoveredPrinter {
  id: string;
  name: string;
  type: PrinterConnectionType;
  vendorId?: string;
  productId?: string;
}

export async function discoverPrinters(type: PrinterConnectionType): Promise<DiscoveredPrinter[]> {
  loadPrinterModules();
  if (!USBPrinter) throw new Error('Printer module not available.');
  if (type === 'usb') {
    await USBPrinter.init();
    const devices = await USBPrinter.getDeviceList();
    return (devices as any[]).map((d) => ({
      id: String(d.device_id ?? d.device_name ?? ''),
      name: d.device_name ?? `USB Printer (${d.vendor_id})`,
      type: 'usb' as const,
      vendorId: String(d.vendor_id ?? ''),
      productId: String(d.product_id ?? ''),
    }));
  }
  if (type === 'bluetooth') {
    await BLEPrinter.init();
    const devices = await BLEPrinter.getDeviceList();
    return (devices as any[]).map((d) => ({
      id: d.inner_mac_address ?? '',
      name: d.device_name ?? 'Bluetooth Printer',
      type: 'bluetooth' as const,
    }));
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Printing                                                            */
/* ------------------------------------------------------------------ */

function getPrinter(type: PrinterConnectionType | null) {
  if (type === 'usb') return USBPrinter;
  if (type === 'bluetooth') return BLEPrinter;
  if (type === 'network') return NetPrinter;
  return null;
}

export async function printText(text: string): Promise<void> {
  const { type } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();
  await printer.printText(text, { cut: true });
}

export async function printReceipt(opts: {
  storeName: string;
  orderNumber?: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  gst: number;
  total: number;
  paymentMethod?: string;
  cashierName?: string;
}): Promise<void> {
  const { type, paperWidth } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();

  const w = paperWidth === 58 ? 32 : 48; // characters per line
  const line = '='.repeat(w);
  const dash = '-'.repeat(w);

  function pad(left: string, right: string): string {
    const space = w - left.length - right.length;
    return left + ' '.repeat(Math.max(1, space)) + right;
  }

  const now = new Date();
  const date = now.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  let receipt = '';
  receipt += `<C>${opts.storeName}</C>\n`;
  if (opts.orderNumber) receipt += `<C>Order #${opts.orderNumber}</C>\n`;
  receipt += `<C>${date}  ${time}</C>\n`;
  if (opts.cashierName) receipt += `<C>Served by: ${opts.cashierName}</C>\n`;
  receipt += line + '\n';

  for (const item of opts.items) {
    const priceStr = `$${item.price.toFixed(2)}`;
    const nameStr = item.qty > 1 ? `${item.qty}x ${item.name}` : item.name;
    receipt += pad(nameStr.substring(0, w - priceStr.length - 1), priceStr) + '\n';
  }

  receipt += dash + '\n';
  receipt += pad('Subtotal (ex GST)', `$${opts.subtotal.toFixed(2)}`) + '\n';
  receipt += pad('GST (10%)', `$${opts.gst.toFixed(2)}`) + '\n';
  receipt += line + '\n';
  receipt += `<B>${pad('TOTAL', `$${opts.total.toFixed(2)}`)}</B>\n`;
  receipt += line + '\n';

  if (opts.paymentMethod) {
    receipt += pad('Payment', opts.paymentMethod) + '\n';
  }

  receipt += '\n<C>Thank you!</C>\n';
  receipt += '<C>Powered by ElevatedPOS</C>\n\n\n';

  await printer.printText(receipt, { cut: true });
}

export async function printTestPage(): Promise<void> {
  const { type, name, paperWidth } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();

  const w = paperWidth === 58 ? 32 : 48;
  let text = '';
  text += `<C><B>ElevatedPOS</B></C>\n`;
  text += `<C>Printer Test Page</C>\n`;
  text += '='.repeat(w) + '\n';
  text += `Printer: ${name || 'Unknown'}\n`;
  text += `Connection: ${type?.toUpperCase()}\n`;
  text += `Paper: ${paperWidth}mm\n`;
  text += `Time: ${new Date().toLocaleString('en-AU')}\n`;
  text += '='.repeat(w) + '\n';
  text += `<C>If you can read this,</C>\n`;
  text += `<C>your printer is working!</C>\n`;
  text += '\n\n\n';

  await printer.printText(text, { cut: true });
}
