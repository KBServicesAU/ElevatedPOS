/**
 * ESC/POS thermal printer utility for the mobile POS app.
 * Supports USB, Bluetooth, and Network printers via react-native-thermal-receipt-printer.
 */
import { Platform, Alert } from 'react-native';
import { usePrinterStore, type PrinterConnectionType } from '../store/printers';

// ── Android Bluetooth runtime permissions ────────────────────────────────────
// Android 12+ (API 31+) introduced BLUETOOTH_SCAN and BLUETOOTH_CONNECT as
// "dangerous" permissions that must be requested at runtime. Calling
// BLEPrinter.init() without them throws a SecurityException and crashes the app.
// This guard requests them before any BLE operation; it is a no-op on iOS and
// on Android 11 and below (where the legacy BLUETOOTH/BLUETOOTH_ADMIN manifest
// permissions are sufficient).
async function ensureBluetoothPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PermissionsAndroid } = require('react-native') as typeof import('react-native');
    const results = await PermissionsAndroid.requestMultiple([
      'android.permission.BLUETOOTH_SCAN' as any,
      'android.permission.BLUETOOTH_CONNECT' as any,
    ]);
    const r = results as any;
    const scan = r['android.permission.BLUETOOTH_SCAN'];
    const connect = r['android.permission.BLUETOOTH_CONNECT'];
    if (scan === 'denied' || connect === 'denied') {
      throw new Error(
        'Bluetooth permission denied. Go to Settings → Apps → ElevatedPOS → Permissions and allow Nearby devices.',
      );
    }
    if (scan === 'never_ask_again' || connect === 'never_ask_again') {
      throw new Error(
        'Bluetooth permission permanently denied. Please enable it in Android Settings → Apps.',
      );
    }
  } catch (err: any) {
    // Re-throw our own friendly errors; swallow internal PermissionsAndroid
    // errors (e.g. on old API levels where the permission doesn't exist).
    if (err?.message?.toLowerCase().includes('bluetooth') || err?.message?.toLowerCase().includes('permission')) {
      throw err;
    }
    // On Android ≤11 requestMultiple may throw for unrecognised permission
    // strings — that is fine, the legacy manifest permissions are enough.
  }
}

// Lazy-load printer modules to prevent crash if native module is unavailable
let USBPrinter: any = null;
let BLEPrinter: any = null;
let NetPrinter: any = null;
let modulesLoaded = false;

function loadPrinterModules(): boolean {
  if (modulesLoaded) return !!USBPrinter;
  modulesLoaded = true;
  try {
    const mod = require('react-native-thermal-receipt-printer');
    USBPrinter = mod.USBPrinter;
    BLEPrinter = mod.BLEPrinter;
    NetPrinter = mod.NetPrinter;
    return true;
  } catch (err) {
    console.warn('[printer] Failed to load thermal printer module:', err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

let connected = false;

export async function connectPrinter(): Promise<void> {
  if (!loadPrinterModules()) {
    throw new Error('Printer module not available. The app may need to be rebuilt.');
  }

  const { type, address } = usePrinterStore.getState().config;
  if (!type) throw new Error('No printer type configured');

  if (type === 'usb') {
    try { await USBPrinter.init(); } catch (e: any) {
      throw new Error('USB init failed: ' + (e?.message ?? 'unknown'));
    }
    let devices: any[] = [];
    try { devices = await USBPrinter.getDeviceList(); } catch (e: any) {
      throw new Error('USB device scan failed: ' + (e?.message ?? 'unknown'));
    }
    if (!devices || devices.length === 0) {
      throw new Error('No USB printers found. Check the cable and try again.');
    }
    const target = address
      ? devices.find((d: any) => String(d.device_id) === address || d.device_name === address) ?? devices[0]
      : devices[0];
    if (!target) throw new Error('Could not find target USB printer');
    try {
      await USBPrinter.connectPrinter(
        String(target.vendor_id ?? ''),
        String(target.product_id ?? ''),
      );
    } catch (e: any) {
      throw new Error('USB connect failed: ' + (e?.message ?? 'unknown'));
    }
    await usePrinterStore.getState().setConfig({
      address: String(target.device_id ?? target.device_name ?? 'usb'),
      name: target.device_name ?? 'USB Printer',
    });
    connected = true;
  } else if (type === 'bluetooth') {
    // Request Android 12+ runtime permissions before any BLE operation.
    await ensureBluetoothPermissions();
    try { await BLEPrinter.init(); } catch (e: any) {
      throw new Error('Bluetooth init failed: ' + (e?.message ?? 'unknown'));
    }
    let devices: any[] = [];
    try { devices = await BLEPrinter.getDeviceList(); } catch (e: any) {
      throw new Error('Bluetooth scan failed: ' + (e?.message ?? 'unknown'));
    }
    if (!devices || devices.length === 0) {
      throw new Error('No Bluetooth printers found. Make sure the printer is paired.');
    }
    const target = address
      ? devices.find((d: any) => d.inner_mac_address === address || d.device_name === address) ?? devices[0]
      : devices[0];
    try {
      await BLEPrinter.connectPrinter(target.inner_mac_address ?? '');
    } catch (e: any) {
      throw new Error('Bluetooth connect failed: ' + (e?.message ?? 'unknown'));
    }
    await usePrinterStore.getState().setConfig({
      address: target.inner_mac_address ?? '',
      name: target.device_name ?? 'BT Printer',
    });
    connected = true;
  } else if (type === 'network') {
    if (!address) throw new Error('Network address required (IP:port)');
    try { await NetPrinter.init(); } catch (e: any) {
      throw new Error('Network init failed: ' + (e?.message ?? 'unknown'));
    }
    const [host, portStr] = address.split(':');
    try {
      await NetPrinter.connectPrinter(host!, parseInt(portStr ?? '9100'));
    } catch (e: any) {
      throw new Error('Network connect failed: ' + (e?.message ?? 'unknown'));
    }
    connected = true;
  }
}

export async function disconnectPrinter(): Promise<void> {
  if (!connected) return; // Nothing to disconnect — avoid crashing native modules
  const { type } = usePrinterStore.getState().config;
  try {
    if (type === 'usb' && USBPrinter) await USBPrinter.closeConn();
    else if (type === 'bluetooth' && BLEPrinter) await BLEPrinter.closeConn();
    else if (type === 'network' && NetPrinter) await NetPrinter.closeConn();
  } catch { /* ignore */ }
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
  if (!loadPrinterModules()) throw new Error('Printer module not available.');

  if (type === 'usb') {
    try { await USBPrinter.init(); } catch { /* ignore */ }
    let devices: any[] = [];
    try { devices = await USBPrinter.getDeviceList(); } catch (e: any) {
      throw new Error('USB scan failed: ' + (e?.message ?? 'unknown'));
    }
    return (devices ?? []).map((d: any) => ({
      id: String(d.device_id ?? d.device_name ?? ''),
      name: d.device_name ?? `USB Printer (${d.vendor_id})`,
      type: 'usb' as const,
      vendorId: String(d.vendor_id ?? ''),
      productId: String(d.product_id ?? ''),
    }));
  }
  if (type === 'bluetooth') {
    // Request Android 12+ runtime permissions before any BLE operation.
    await ensureBluetoothPermissions();
    try { await BLEPrinter.init(); } catch { /* ignore */ }
    let devices: any[] = [];
    try { devices = await BLEPrinter.getDeviceList(); } catch (e: any) {
      throw new Error('Bluetooth scan failed: ' + (e?.message ?? 'unknown'));
    }
    return (devices ?? []).map((d: any) => ({
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
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const { type } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();
  try {
    await printer.printText(text, { cut: true });
  } catch (e: any) {
    throw new Error('Print failed: ' + (e?.message ?? 'unknown'));
  }
}

/**
 * Print the integrated Tyro merchant receipt verbatim.
 *
 * Tyro returns `merchantReceipt` as a pre-formatted monospaced text
 * block. POS-integrated mode (iClient.Retail.Signature-verified) requires
 * the merchant to add a signature line when `signatureRequired` is true.
 */
export async function printTyroMerchantReceipt(opts: {
  merchantReceipt: string;
  signatureRequired?: boolean;
}): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const { type, paperWidth } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();

  const w = paperWidth === 58 ? 32 : 48;
  const line = '-'.repeat(w);

  let body = opts.merchantReceipt.trim() + '\n';
  if (opts.signatureRequired) {
    body += '\n';
    body += 'X' + line.slice(1) + '\n';
    body += '<C>Cardholder Signature</C>\n';
    body += line + '\n';
    body += '<C>I agree to pay the above amount</C>\n';
    body += '<C>as per my card issuer agreement</C>\n';
  }
  body += '\n\n\n';

  try {
    await printer.printText(body, { cut: true });
  } catch (e: any) {
    throw new Error('Tyro receipt print failed: ' + (e?.message ?? 'unknown'));
  }
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
  surchargeAmount?: number;
  tipAmount?: number;
}): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const { type, paperWidth } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();

  const w = paperWidth === 58 ? 32 : 48;
  const line = '='.repeat(w);
  const dash = '-'.repeat(w);

  function pad(left: string, right: string): string {
    const space = w - left.length - right.length;
    return left + ' '.repeat(Math.max(1, space)) + right;
  }

  const now = new Date();
  const date = now.toLocaleDateString('en-AU');
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
  if (opts.surchargeAmount && opts.surchargeAmount > 0) {
    receipt += pad('Surcharge', `$${opts.surchargeAmount.toFixed(2)}`) + '\n';
  }
  if (opts.tipAmount && opts.tipAmount > 0) {
    receipt += pad('Tip', `$${opts.tipAmount.toFixed(2)}`) + '\n';
  }
  receipt += line + '\n';
  receipt += `<B>${pad('TOTAL', `$${opts.total.toFixed(2)}`)}</B>\n`;
  receipt += line + '\n';
  if (opts.paymentMethod) receipt += pad('Payment', opts.paymentMethod) + '\n';
  receipt += '\n<C>Thank you!</C>\n';
  receipt += '<C>Powered by ElevatedPOS</C>\n\n\n';

  try {
    await printer.printText(receipt, { cut: true });
  } catch (e: any) {
    throw new Error('Print failed: ' + (e?.message ?? 'unknown'));
  }
}

export async function printOrderTicket(opts: {
  orderNumber?: string;
  items: { name: string; qty: number }[];
}): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const cfg = usePrinterStore.getState().config;
  // Prefer the dedicated order printer if it has been configured. The library
  // only supports one active connection per transport, so we may need to
  // disconnect from the receipt printer and reconnect to the order printer.
  const useOrderPrinter = !!(cfg.orderPrinter?.type && cfg.orderPrinter.address);
  const targetType = useOrderPrinter ? cfg.orderPrinter.type : cfg.type;
  const targetAddress = useOrderPrinter ? cfg.orderPrinter.address : cfg.address;
  const paperWidth = useOrderPrinter ? cfg.orderPrinter.paperWidth : cfg.paperWidth;
  const printer = getPrinter(targetType);
  if (!printer) throw new Error('No printer configured');

  // If we're switching to a different physical printer, drop the existing
  // connection and reconnect to the new device.
  if (useOrderPrinter && (cfg.type !== targetType || cfg.address !== targetAddress)) {
    if (connected) { try { await disconnectPrinter(); } catch { /* ignore */ } }
    if (targetType === 'network') {
      try { await NetPrinter?.init(); } catch { /* ignore */ }
      const [host, portStr] = (targetAddress || '').split(':');
      try { await NetPrinter?.connectPrinter(host!, parseInt(portStr ?? '9100')); }
      catch (e: any) { throw new Error('Order printer connect failed: ' + (e?.message ?? 'unknown')); }
    } else if (targetType === 'usb') {
      try { await USBPrinter?.init(); } catch { /* ignore */ }
      let devices: any[] = [];
      try { devices = await USBPrinter.getDeviceList(); }
      catch { devices = []; }
      const target = devices.find((d: any) => String(d.device_id) === targetAddress) ?? devices[0];
      if (target) {
        try {
          await USBPrinter.connectPrinter(
            String(target.vendor_id ?? ''),
            String(target.product_id ?? ''),
          );
        } catch (e: any) { throw new Error('Order printer USB connect failed: ' + (e?.message ?? 'unknown')); }
      }
    } else if (targetType === 'bluetooth') {
      try { await BLEPrinter?.init(); } catch { /* ignore */ }
      try { await BLEPrinter?.connectPrinter(targetAddress); }
      catch (e: any) { throw new Error('Order printer BT connect failed: ' + (e?.message ?? 'unknown')); }
    }
    connected = true;
  } else if (!connected) {
    await connectPrinter();
  }

  const w = paperWidth === 58 ? 32 : 48;
  const line = '='.repeat(w);
  const dash = '-'.repeat(w);

  const now = new Date();
  const time = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  let ticket = '';
  ticket += `<C><B>ORDER TICKET</B></C>\n`;
  if (opts.orderNumber) ticket += `<C>Order #${opts.orderNumber}</C>\n`;
  ticket += `<C>${time}</C>\n`;
  ticket += line + '\n';

  for (const item of opts.items) {
    const qtyStr = `x${item.qty}`;
    const nameStr = item.name.substring(0, w - qtyStr.length - 2);
    const space = w - nameStr.length - qtyStr.length;
    ticket += nameStr + ' '.repeat(Math.max(1, space)) + qtyStr + '\n';
  }

  ticket += line + '\n\n\n';

  try {
    await printer.printText(ticket, { cut: true });
  } catch (e: any) {
    throw new Error('Order ticket print failed: ' + (e?.message ?? 'unknown'));
  }
}

export async function printOrderPrinterTestPage(): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const cfg = usePrinterStore.getState().config;
  const op = cfg.orderPrinter;
  if (!op?.type || !op.address) {
    throw new Error('Order printer not configured');
  }

  // Disconnect any current printer and connect to the order printer.
  // Guard: only disconnect if currently connected to avoid crashing USB module.
  if (connected) {
    try { await disconnectPrinter(); } catch { /* ignore */ }
  }
  if (op.type === 'network') {
    try { await NetPrinter?.init(); } catch { /* ignore */ }
    const [host, portStr] = op.address.split(':');
    try { await NetPrinter?.connectPrinter(host!, parseInt(portStr ?? '9100')); }
    catch (e: any) { throw new Error('Order printer connect failed: ' + (e?.message ?? 'unknown')); }
  } else if (op.type === 'usb') {
    try { await USBPrinter?.init(); } catch { /* ignore */ }
    let devices: any[] = [];
    try { devices = await USBPrinter.getDeviceList(); } catch { devices = []; }
    const target = devices.find((d: any) => String(d.device_id) === op.address) ?? devices[0];
    if (!target) throw new Error('Order printer not found on USB bus');
    try {
      await USBPrinter.connectPrinter(
        String(target.vendor_id ?? ''),
        String(target.product_id ?? ''),
      );
    } catch (e: any) { throw new Error('Order printer USB connect failed: ' + (e?.message ?? 'unknown')); }
  } else if (op.type === 'bluetooth') {
    try { await BLEPrinter?.init(); } catch { /* ignore */ }
    try { await BLEPrinter?.connectPrinter(op.address); }
    catch (e: any) { throw new Error('Order printer BT connect failed: ' + (e?.message ?? 'unknown')); }
  }
  connected = true;

  const printer = getPrinter(op.type);
  if (!printer) throw new Error('Order printer not initialised');
  const w = op.paperWidth === 58 ? 32 : 48;
  let text = '';
  text += `<C><B>ElevatedPOS</B></C>\n`;
  text += `<C>Order Printer Test</C>\n`;
  text += '='.repeat(w) + '\n';
  text += `Printer: ${op.name || 'Unknown'}\n`;
  text += `Connection: ${op.type?.toUpperCase()}\n`;
  text += `Paper: ${op.paperWidth}mm\n`;
  text += `Time: ${new Date().toLocaleString('en-AU')}\n`;
  text += '='.repeat(w) + '\n';
  text += `<C>Order printer ready</C>\n\n\n`;
  try {
    await printer.printText(text, { cut: true });
  } catch (e: any) {
    throw new Error('Order printer print failed: ' + (e?.message ?? 'unknown'));
  }
}

export async function printTestPage(): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
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
  text += `<C>your printer is working!</C>\n\n\n`;

  try {
    await printer.printText(text, { cut: true });
  } catch (e: any) {
    throw new Error('Print failed: ' + (e?.message ?? 'unknown'));
  }
}
