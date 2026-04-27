/**
 * ESC/POS thermal printer utility for the mobile POS app.
 * Supports USB, Bluetooth, and Network printers via react-native-thermal-receipt-printer.
 */
import { Platform, Alert } from 'react-native';
import {
  usePrinterStore,
  type PrinterConnectionType,
  type OrderPrinterDevice,
} from '../store/printers';
import { useReceiptPrefs } from '../store/receipt-prefs';
import { ensureFreshSettings, getReceiptSettings, type ServerReceiptSettings } from '../store/device-settings';

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

/**
 * v2.7.48 — track which physical order printer the library is currently
 * connected to (the underlying lib only allows one active connection per
 * transport, so when `printOrderTickets` switches between printers we
 * have to re-connect each time). `null` means the library is either
 * disconnected or connected to the receipt printer instead.
 *
 * Used by `isOrderPrinterConnected()` to short-circuit kitchen-ticket
 * prints when the current order printer is unreachable.
 */
let connectedOrderPrinterAddress: string | null = null;

export async function connectPrinter(): Promise<void> {
  if (!loadPrinterModules()) {
    throw new Error('Printer module not available. The app may need to be rebuilt.');
  }

  const { type, address } = usePrinterStore.getState().config;
  if (!type) throw new Error('No printer type configured');
  // Connecting the receipt printer detaches us from any previously held
  // order-printer connection — make sure the tracker reflects that.
  connectedOrderPrinterAddress = null;

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
        target.vendor_id,
        target.product_id,
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
  // Best-effort: try every transport. We only know which one is actually
  // open from `connectedOrderPrinterAddress` + the receipt config, but
  // calling closeConn() on an idle module is harmless.
  const { type } = usePrinterStore.getState().config;
  try {
    if (type === 'usb' && USBPrinter) await USBPrinter.closeConn();
    else if (type === 'bluetooth' && BLEPrinter) await BLEPrinter.closeConn();
    else if (type === 'network' && NetPrinter) await NetPrinter.closeConn();
  } catch { /* ignore */ }
  // Cover the order-printer transport too in case it differs from the
  // receipt printer's transport (e.g. USB receipt + network kitchen).
  if (connectedOrderPrinterAddress) {
    const orderPrinters = usePrinterStore.getState().config.orderPrinters;
    const op = orderPrinters.find((p) => p.address === connectedOrderPrinterAddress);
    const orderType = op?.type ?? usePrinterStore.getState().config.orderPrinter?.type;
    if (orderType && orderType !== type) {
      try {
        if (orderType === 'usb' && USBPrinter) await USBPrinter.closeConn();
        else if (orderType === 'bluetooth' && BLEPrinter) await BLEPrinter.closeConn();
        else if (orderType === 'network' && NetPrinter) await NetPrinter.closeConn();
      } catch { /* ignore */ }
    }
  }
  connected = false;
  connectedOrderPrinterAddress = null;
}

export function isConnected(): boolean {
  return connected;
}

/**
 * v2.7.48 — true when the library is currently connected to AN order
 * printer (any destination). Use this from call sites that only care
 * "can we fire a kitchen ticket right now?" without picking a specific
 * destination — `printOrderTickets` does its own per-destination
 * connect/disconnect dance.
 *
 * Returns `false` if no order printer is configured at all, or if the
 * last connection attempt failed and we haven't reconnected since.
 */
export function isOrderPrinterConnected(): boolean {
  const cfg = usePrinterStore.getState().config;
  // Multi-printer mode: connected if we're currently attached to one of them.
  if (cfg.orderPrinters.length > 0) {
    return connected && connectedOrderPrinterAddress !== null
      && cfg.orderPrinters.some((p) => p.address === connectedOrderPrinterAddress);
  }
  // Legacy single-printer mode: must have an address AND be connected to it.
  const legacyAddress = cfg.orderPrinter?.address;
  if (!legacyAddress) return false;
  return connected && connectedOrderPrinterAddress === legacyAddress;
}

/**
 * Try to connect to a specific order printer. Updates the
 * `connectedOrderPrinterAddress` tracker on success. Used by
 * `printOrderTickets` to switch between bar / kitchen / etc. printers.
 *
 * Throws on failure — caller is expected to wrap in try/catch and
 * surface a toast without breaking the sale.
 */
async function connectOrderPrinter(target: OrderPrinterDevice): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  if (!target.type || !target.address) throw new Error('Order printer not configured');

  // The native printer library only holds one active connection per transport,
  // so we must drop whatever's currently held before connecting to a new device.
  if (connected) {
    try { await disconnectPrinter(); } catch { /* ignore */ }
  }

  if (target.type === 'network') {
    try { await NetPrinter?.init(); } catch { /* ignore */ }
    const [host, portStr] = target.address.split(':');
    await NetPrinter?.connectPrinter(host!, parseInt(portStr ?? '9100'));
  } else if (target.type === 'usb') {
    try { await USBPrinter?.init(); } catch { /* ignore */ }
    let devices: any[] = [];
    try { devices = await USBPrinter.getDeviceList(); } catch { devices = []; }
    const found = devices.find((d: any) => String(d.device_id) === target.address) ?? devices[0];
    if (!found) throw new Error('Order printer not found on USB bus');
    await USBPrinter.connectPrinter(found.vendor_id, found.product_id);
  } else if (target.type === 'bluetooth') {
    await ensureBluetoothPermissions();
    try { await BLEPrinter?.init(); } catch { /* ignore */ }
    await BLEPrinter?.connectPrinter(target.address);
  }
  connected = true;
  connectedOrderPrinterAddress = target.address;
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

/* ------------------------------------------------------------------ */
/* ESC/POS raw-byte helpers                                            */
/* ------------------------------------------------------------------ */
/*
 * The printer library (react-native-thermal-receipt-printer@1.2) only
 * exposes `printText` and `printBill`. `printText` feeds the string
 * through an EPToolkit pre-processor that handles `<C>/<B>` tags and
 * then iconv-encodes the remaining characters. iconv-UTF-8 preserves
 * ASCII bytes 0-127 as single bytes, so we CAN embed raw ESC/POS
 * commands as a string of char-codes, provided:
 *   1. No byte is 0x3C (the '<' — would be interpreted as a tag).
 *   2. No byte is 0x0A (the '\n' — would trigger a reset flush).
 * Barcode + QR commands use bytes like 0x1D, 0x6B, 0x49, etc. — all
 * below 128 and neither 0x3C nor 0x0A. The payloads we pass in
 * (order numbers / URLs) are restricted to alphanumerics + dashes
 * below so the reserved chars never appear.
 */

const ESC = '\x1B';
const GS  = '\x1D';

/** Strip reserved ESC/POS chars to keep the command stream safe. */
function sanitiseAscii(s: string): string {
  // Printable ASCII only (32-126). '<' and '\n' removed implicitly.
  return s.replace(/[^\x20-\x7E]/g, '').replace(/</g, '');
}

/**
 * Build an ESC/POS block that prints a Code128 barcode centred on the
 * paper, with the HRI (human-readable interpretation) rendered below.
 * Called from `buildReceiptText` — the result is a string that slots
 * into the normal receipt body.
 *
 * NOTE — the barcode bytes must NOT be interrupted by a newline in the
 * receipt text (the printer lib flushes + resets on `\n`), so the whole
 * command sequence is emitted as a SINGLE line then a trailing '\n' for
 * the reset.
 */
function escPosBarcode128(data: string): string {
  const clean = sanitiseAscii(data);
  if (!clean) return '';
  const len = Math.min(clean.length, 255);
  const payload = clean.slice(0, len);
  // Module width 2 (narrow), height 80 dots, HRI below, font A.
  // GS w 2 / GS h 80 / GS H 2 / GS f 0
  const config =
    GS + 'w' + String.fromCharCode(2) +
    GS + 'h' + String.fromCharCode(80) +
    GS + 'H' + String.fromCharCode(2) +
    GS + 'f' + String.fromCharCode(0);
  // GS k 73 n d1..dn   (Code128)
  const barcode =
    GS + 'k' + String.fromCharCode(73, len) + payload;
  // ESC a 1 = centre alignment; ESC a 0 = left (applied by the printer lib's
  // reset_bytes on the trailing \n we append in buildReceiptText anyway).
  return ESC + 'a' + String.fromCharCode(1) + config + barcode;
}

/**
 * Build an ESC/POS QR Code block. See ESC/POS programming guide § GS ( k.
 * `size` is the module size 1..16 (default 5, larger = bigger code).
 */
function escPosQrCode(data: string, size = 6): string {
  const clean = sanitiseAscii(data);
  if (!clean) return '';
  const lenPlus3 = clean.length + 3;
  const pL = lenPlus3 & 0xFF;
  const pH = (lenPlus3 >> 8) & 0xFF;
  // Select model 2: GS ( k 4 0 49 65 50 0
  const model =
    GS + '(' + 'k' + String.fromCharCode(4, 0, 49, 65, 50, 0);
  // Module size: GS ( k 3 0 49 67 n
  const moduleSize =
    GS + '(' + 'k' + String.fromCharCode(3, 0, 49, 67, Math.max(1, Math.min(16, size)));
  // Error correction level M (49): GS ( k 3 0 49 69 49
  const ecc =
    GS + '(' + 'k' + String.fromCharCode(3, 0, 49, 69, 49);
  // Store data: GS ( k pL pH 49 80 48 <data>
  const storeData =
    GS + '(' + 'k' + String.fromCharCode(pL, pH, 49, 80, 48) + clean;
  // Print: GS ( k 3 0 49 81 48
  const print =
    GS + '(' + 'k' + String.fromCharCode(3, 0, 49, 81, 48);
  return ESC + 'a' + String.fromCharCode(1) + model + moduleSize + ecc + storeData + print;
}

/* ------------------------------------------------------------------ */
/* Raster image printing (logo) — v2.7.48                              */
/* ------------------------------------------------------------------ */
/*
 * The receipt-printer library only exposes `printText` / `printBill`,
 * which run the input through an EPToolkit pre-processor that handles
 * `<C>/<B>` markup and iconv-encodes the rest. That mangles raw image
 * bytes (any 0x00 / 0x0A / 0x3C in the bitmap data gets corrupted).
 *
 * The native modules expose an undocumented `printRawData(b64)` JNI
 * method, however, that streams arbitrary bytes straight to the
 * printer — no markup pass, no iconv. We use it for the GS v 0
 * raster-bit-image command so the dashboard-uploaded logo prints at
 * full fidelity. The bitmap is pre-rasterised by the dashboard at
 * upload time so the mobile app never has to decode PNG / SVG.
 *
 * Caller MUST wrap in try/catch — bad bitmap bytes / unsupported
 * firmware must NEVER block the receipt body from printing.
 */

/** Convert an array of byte values to a base64 string without Node's Buffer. */
function bytesToBase64(bytes: Uint8Array): string {
  // RN ships its own base64 polyfill via `buffer`. Trying to use it via
  // require('buffer').Buffer.from(bytes).toString('base64') would work, but
  // we keep the dependency surface narrow — implement a tiny base64 encoder.
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1]!, c = bytes[i + 2]!;
    out += ALPHA[a >> 2]!;
    out += ALPHA[((a & 0x03) << 4) | (b >> 4)]!;
    out += ALPHA[((b & 0x0F) << 2) | (c >> 6)]!;
    out += ALPHA[c & 0x3F]!;
  }
  if (i < bytes.length) {
    const a = bytes[i]!;
    out += ALPHA[a >> 2]!;
    if (i + 1 < bytes.length) {
      const b = bytes[i + 1]!;
      out += ALPHA[((a & 0x03) << 4) | (b >> 4)]!;
      out += ALPHA[(b & 0x0F) << 2]!;
      out += '=';
    } else {
      out += ALPHA[(a & 0x03) << 4]!;
      out += '==';
    }
  }
  return out;
}

/** Decode a base64 string back to a byte array. */
function base64ToBytes(b64: string): Uint8Array {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(256).fill(-1);
  for (let i = 0; i < ALPHA.length; i++) lookup[ALPHA.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padIdx = clean.indexOf('=');
  const usable = padIdx === -1 ? clean.length : padIdx;
  const outLen = Math.floor((clean.length / 4) * 3) - (clean.length - usable);
  const out = new Uint8Array(outLen);
  let oi = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)] ?? 0;
    const b = lookup[clean.charCodeAt(i + 1)] ?? 0;
    const c = lookup[clean.charCodeAt(i + 2)] ?? 0;
    const d = lookup[clean.charCodeAt(i + 3)] ?? 0;
    if (oi < outLen) out[oi++] = (a << 2) | (b >> 4);
    if (oi < outLen) out[oi++] = ((b & 0x0F) << 4) | (c >> 2);
    if (oi < outLen) out[oi++] = ((c & 0x03) << 6) | d;
  }
  return out;
}

/**
 * Stream a raw byte buffer to the currently-connected printer.
 *
 * Goes through the native module's undocumented `printRawData(b64,errCb)`
 * method — the EPToolkit text path can't carry arbitrary bytes (see the
 * comment block at the top of the raster section).
 */
async function printRawBytes(rawBytes: Uint8Array): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const { type } = usePrinterStore.getState().config;
  // The same native module that backs the chosen connection type also
  // owns the printRawData call. We grab it from NativeModules so this
  // works even though the JS shim doesn't expose it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NativeModules } = require('react-native') as typeof import('react-native');
  const native: any = type === 'usb'      ? NativeModules['RNUSBPrinter']
                    : type === 'bluetooth' ? NativeModules['RNBLEPrinter']
                    : type === 'network'  ? NativeModules['RNNetPrinter']
                    : null;
  // When called from `printOrderTickets` we may be connected to an order
  // printer of a *different* transport than the receipt-config `type`.
  // Fall back to whichever native module is actually loaded.
  const target = native ?? NativeModules['RNUSBPrinter'] ?? NativeModules['RNBLEPrinter'] ?? NativeModules['RNNetPrinter'];
  if (!target?.printRawData) throw new Error('Raw printing not supported by this printer module');

  const b64 = bytesToBase64(rawBytes);
  await new Promise<void>((resolve, reject) => {
    target.printRawData(b64, (err: any) => {
      if (err) reject(new Error(typeof err === 'string' ? err : (err?.message ?? 'printRawData failed')));
      else resolve();
    });
  });
}

/**
 * Build a complete ESC/POS command stream that prints a 1-bit raster
 * image centred on the paper.
 *
 * Format reference — GS v 0:
 *   1D 76 30 m xL xH yL yH d1...dk
 *     m  = 0 (normal width, normal height)
 *     xL = (width / 8) & 0xFF                xH = ((width / 8) >> 8) & 0xFF
 *     yL = height & 0xFF                     yH = (height >> 8) & 0xFF
 *     d1...dk = 1-bit pixel data (MSB = leftmost pixel), one byte per
 *               eight horizontal pixels, rows packed top-to-bottom.
 *
 * Width MUST be a multiple of 8. Caller is responsible for padding.
 * Output bytes also include:
 *   - centre alignment (ESC a 1) before the image
 *   - left alignment   (ESC a 0) after the image
 *   - LF + reset bytes so the next text the receipt printer prints
 *     starts cleanly.
 */
function buildEscPosRasterImage(bitmap: Uint8Array, width: number, height: number): Uint8Array {
  if (width % 8 !== 0) throw new Error('raster width must be a multiple of 8');
  const bytesPerRow = width / 8;
  if (bitmap.length < bytesPerRow * height) {
    throw new Error('raster bitmap shorter than width × height implies');
  }
  const xL = bytesPerRow & 0xFF;
  const xH = (bytesPerRow >> 8) & 0xFF;
  const yL = height & 0xFF;
  const yH = (height >> 8) & 0xFF;
  // Header: ESC @ (init), ESC a 1 (centre), GS v 0 m xL xH yL yH
  // Trailer: LF, ESC a 0 (left)
  const header = new Uint8Array([
    0x1B, 0x40,                   // ESC @ — reset
    0x1B, 0x61, 0x01,             // ESC a 1 — centre
    0x1D, 0x76, 0x30, 0x00,       // GS v 0  m=0
    xL, xH, yL, yH,
  ]);
  const trailer = new Uint8Array([
    0x0A,                          // LF — flush row
    0x1B, 0x61, 0x00,             // ESC a 0 — left align
  ]);
  const out = new Uint8Array(header.length + bytesPerRow * height + trailer.length);
  out.set(header, 0);
  out.set(bitmap.subarray(0, bytesPerRow * height), header.length);
  out.set(trailer, header.length + bytesPerRow * height);
  return out;
}

/**
 * Print the merchant logo (if any) ahead of `nextText`. Best-effort: any
 * decoding / streaming failure is logged and swallowed so the receipt
 * body still prints.
 *
 * Returns `true` when the logo was actually pushed to the printer.
 */
async function printLogoIfAny(rs: ServerReceiptSettings): Promise<boolean> {
  if (!rs.logoBase64 || !rs.logoWidth || !rs.logoHeight) return false;
  if (rs.logoWidth % 8 !== 0) {
    console.warn('[printer] logo width', rs.logoWidth, 'not multiple of 8 — skipping');
    return false;
  }
  try {
    const bytes = base64ToBytes(rs.logoBase64);
    const cmd = buildEscPosRasterImage(bytes, rs.logoWidth, rs.logoHeight);
    await printRawBytes(cmd);
    return true;
  } catch (err) {
    console.warn('[printer] logo render failed — continuing without logo:', err);
    return false;
  }
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

/* ------------------------------------------------------------------ */
/* Rich POS receipt (v2.7.17)                                          */
/* ------------------------------------------------------------------ */

export interface ReceiptLine {
  name: string;
  qty: number;
  /** Tax-inclusive unit price (pre-discount). */
  unitPrice: number;
  /** qty * unitPrice - discount (tax-inclusive). */
  lineTotal: number;
  /** Dollar amount of discount applied to this line (not per-unit). */
  discountAmount?: number;
  note?: string;
  modifiers?: { name: string; priceAdjustment: number }[];
  seat?: number;
}

export type ReceiptCopy = 'customer' | 'merchant';

export interface PrintReceiptOpts {
  /** Which copy is this? Defaults to 'customer'. */
  copy?: ReceiptCopy;
  store: {
    name: string;
    address1?: string;
    address2?: string;
    phone?: string;
    /** Contact email printed under phone. */
    email?: string;
    abn?: string;
    website?: string;
    /** Branch label for multi-venue deployments, e.g. "Downtown". */
    branch?: string;
    /** Device / register label, e.g. "POS-1". */
    device?: string;
    /** URL or text encoded into the feedback QR placeholder line. */
    qrPayload?: string;
    /** Caption printed below the QR (e.g. "Share your feedback"). */
    qrMessage?: string;
  };
  order: {
    orderNumber?: string;
    /**
     * Optional short reset-sequence number printed large at the top of the
     * receipt when `orderNumberMode === 'short'`. Callers (typically the
     * order store) supply this — the printer library does not compute it.
     */
    shortOrderNumber?: string;
    /**
     * How prominently to render the order number. 'short' prints the
     * caller-supplied shortOrderNumber in the big centred header;
     * 'full' prints the long orderNumber as a normal line. Defaults to
     * 'full'.
     */
    orderNumberMode?: 'full' | 'short';
    /**
     * v2.7.44 — hospitality order type label (e.g. "Dine In", "Takeaway",
     * "Delivery"). Rendered next to the order number in the receipt
     * header so customers and staff can tell the channel at a glance.
     * Omitted entirely for retail orders.
     */
    orderTypeLabel?: string;
    registerLabel?: string;
    cashierName?: string;
    customerName?: string;
    tableNumber?: string | number;
    covers?: number;
    orderedAt: Date;
    /**
     * When true, print "*** REPRINT ***" centred below the date row so
     * staff and customers can see the receipt has already been issued
     * at least once. Does not change totals, refund eligibility, or
     * anything else — purely a visual marker on the POS receipt.
     */
    reprint?: boolean;
    /**
     * v2.7.44 — merchant-controlled toggle from
     * `getReceiptSettings().showOrderNumber`. When `false`, suppresses
     * BOTH the textual "Order #..." line under the header AND the
     * scannable Code128 barcode + ref block at the foot of the
     * receipt. Defaults to `true` (legacy behaviour) so any caller
     * that hasn't been updated yet still prints the order number.
     */
    showOrderNumber?: boolean;
  };
  items: ReceiptLine[];
  totals: {
    /** Subtotal excluding GST (tax-exclusive sum after discounts). */
    subtotalExGst: number;
    itemDiscount?: number;
    orderDiscount?: number;
    gst: number;
    surcharge?: number;
    tip?: number;
    /** Tax-inclusive grand total charged. */
    total: number;
  };
  payment?: {
    /** "Cash", "Card", "Split", etc. */
    method: string;
    tendered?: number;
    changeGiven?: number;
    cardType?: string;
    cardLast4?: string;
    authCode?: string;
    rrn?: string;
  };
  loyalty?: {
    pointsEarned?: number;
    pointsBalance?: number;
  };
  /** Raw ANZ terminal receipt text to append verbatim. */
  anzReceiptText?: string;
  /** Trace id for support. Usually the orderNumber if absent. */
  traceId?: string;
}

/**
 * Build the receipt text. Extracted so callers (and tests) can format
 * without touching the printer hardware.
 *
 * v2.7.20 — redesigned layout:
 *   - Large bold store name + optional address / phone / email / ABN
 *   - Branch + device line
 *   - Optional large centred short order number
 *   - Date LEFT, time RIGHT on one line
 *   - Items with per-unit price when qty > 1
 *   - Totals block with tax-exclusive subtotal + GST breakdown
 *   - Payment block with card auth / rrn or cash tendered / change
 *   - Loyalty line when available
 *   - Copy marker (CUSTOMER or MERCHANT)
 *   - Verbatim ANZ terminal receipt block
 *   - Feedback QR placeholder line (proper QR rendering needs raw
 *     ESC/POS bytes — TODO for v2.7.21)
 *   - Order ref for refunds + footer with ISO timestamp + trace
 */
function buildReceiptText(opts: PrintReceiptOpts, paperWidth: 58 | 80): string {
  const w = paperWidth === 58 ? 32 : 48;
  // Double-width ESC/POS tags (<CM>, <M>, <D>) render each glyph as 2
  // physical columns. Any string wrapped in these tags therefore has to be
  // clipped to `bigW` = floor(w/2) or the line wraps. See v2.7.22 notes.
  const bigW = Math.floor(w / 2);
  const line = '='.repeat(w);
  const dash = '-'.repeat(w);
  // v2.7.44 — separators emitted *immediately* after a `</CM>...\n` line
  // sometimes still print at 2× width on cheap printer firmware that
  // ignores the implicit reset bytes EPToolkit emits on '\n'. Using the
  // half-width version guarantees the bar fits either way: bigW × 2 = w
  // (full 80mm paper) when leaked, or bigW cols normal otherwise. Only
  // `===` separators have this risk currently — no `---` immediately
  // follows a `<CM>` line.
  const bigLine = '='.repeat(bigW);

  function pad(left: string, right: string): string {
    const space = w - left.length - right.length;
    return left + ' '.repeat(Math.max(1, space)) + right;
  }

  function clip(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) : s;
  }

  function moneyCol(n: number): string {
    const abs = Math.abs(n).toFixed(2);
    return n < 0 ? `-$${abs}` : `$${abs}`;
  }

  function centre(s: string): string {
    // Let the native printer center if the control tags are honoured; also
    // fall back to manual padding so the layout is stable on cheap drivers.
    // Caller is responsible for clipping `s` to `w` first.
    return `<C>${clip(s, w)}</C>`;
  }

  const copy: ReceiptCopy = opts.copy ?? 'customer';
  const now = opts.order.orderedAt ?? new Date();
  const date = now.toLocaleDateString('en-AU');
  const time = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  const iso = now.toISOString();

  let r = '';

  // ── Header ────────────────────────────────────────────────────────
  // Store name — large (CM = centred + medium). <CM> is honoured by the
  // react-native-thermal-receipt-printer tag dialect; cheap drivers fall
  // back to normal text, which is still readable.
  // NOTE: <CM> prints at 2× width so clip to bigW, not w.
  r += line + '\n';
  r += `<CM>${clip(opts.store.name, bigW)}</CM>\n`;
  const hasContact = !!(opts.store.address1 || opts.store.address2 ||
    opts.store.phone || opts.store.email || opts.store.abn);
  if (opts.store.address1) r += centre(opts.store.address1) + '\n';
  if (opts.store.address2) r += centre(opts.store.address2) + '\n';
  if (opts.store.phone)    r += centre(opts.store.phone) + '\n';
  if (opts.store.email)    r += centre(opts.store.email) + '\n';
  if (opts.store.abn)      r += centre(`ABN ${opts.store.abn}`) + '\n';
  // If no address/contact lines were emitted, the next `===` separator
  // sits directly after `</CM>` and can wrap on cheap firmware. Fall back
  // to bigLine in that case (bigW × 2 ≤ w, so it fits either way).
  // See v2.7.44 notes.
  r += (hasContact ? line : `<C>${bigLine}</C>`) + '\n';

  // ── Branch + device line ─────────────────────────────────────────
  if (opts.store.branch || opts.store.device) {
    // Defensive clip — the combined length of branch + device could
    // otherwise exceed `w` and wrap. Give each side half the paper.
    const half = Math.max(1, Math.floor(w / 2) - 2);
    const branchStr = opts.store.branch
      ? clip(`  Branch: ${opts.store.branch}`, half)
      : '';
    const deviceStr = opts.store.device
      ? clip(`Device: ${opts.store.device}  `, half)
      : '';
    r += pad(branchStr, deviceStr) + '\n';
    r += line + '\n';
  }

  // ── Big order number (short mode) ────────────────────────────────
  // v2.7.44 — merchant can hide the order number entirely via the
  // dashboard receipt-settings toggle. Default true to preserve
  // pre-v2.7.44 behaviour for callers that don't pass the field.
  const showOrderNumber = opts.order.showOrderNumber ?? true;
  // v2.7.48 — diagnostic log so a future "the order number isn't showing"
  // bug report can be triaged from logs without repro. Tracks the actual
  // value reaching the rendering branch (default-applied or explicit).
  if (opts.order.orderNumber) {
    console.log(
      '[printer] buildReceiptText showOrderNumber=',
      showOrderNumber,
      ' (raw=', opts.order.showOrderNumber, ') orderNumber=', opts.order.orderNumber,
    );
  }
  const mode = opts.order.orderNumberMode ?? 'full';
  // v2.7.44 — hospitality merchants pass `orderTypeLabel` ("Dine In" /
  // "Takeaway" / "Delivery") so we can suffix the order header with the
  // channel. Retail orders pass nothing and the line stays unchanged.
  const typeSuffix = opts.order.orderTypeLabel
    ? ` · ${opts.order.orderTypeLabel}`
    : '';
  if (showOrderNumber) {
    if (mode === 'short' && opts.order.shortOrderNumber) {
      // <CM> = 2× width, so clip to bigW minus the length of the "ORDER #" prefix.
      const label = `ORDER #${opts.order.shortOrderNumber}${typeSuffix}`;
      r += `<CM>${clip(label, bigW)}</CM>\n`;
      // bigLine instead of `line` here: the `===` separator immediately
      // follows a `</CM>` line, where cheap firmware can leak the 2×
      // width state past the implicit reset on '\n'. bigW × 2 = w, so
      // this fills the paper either way (v2.7.44 Agent S notes).
      r += `<C>${bigLine}</C>\n`;
    } else if (opts.order.orderNumber) {
      r += centre(`Order #${opts.order.orderNumber}${typeSuffix}`) + '\n';
      r += line + '\n';
    }
  } else if (typeSuffix) {
    // Order number is hidden by merchant config but the order-type tag
    // (Dine In / Takeaway / Delivery) is still useful — kitchen staff
    // glancing at the receipt need to know the channel.
    r += centre(opts.order.orderTypeLabel!) + '\n';
    r += line + '\n';
  }

  // ── Date left, time right ────────────────────────────────────────
  r += pad(`  ${date}`, `${time}  `) + '\n';
  if (opts.order.reprint) {
    r += `<C><B>*** REPRINT ***</B></C>\n`;
  }
  if (opts.order.cashierName) {
    r += clip(`  Staff: ${opts.order.cashierName}`, w) + '\n';
  }
  if (opts.order.customerName) {
    r += clip(`  Customer: ${opts.order.customerName}`, w) + '\n';
  }
  if (opts.order.tableNumber !== undefined && opts.order.tableNumber !== null && opts.order.tableNumber !== '') {
    const seatsStr = opts.order.covers ? `Covers ${opts.order.covers}  ` : '';
    r += pad(`  Table ${opts.order.tableNumber}`, seatsStr) + '\n';
  }
  r += line + '\n';

  // ── Items ─────────────────────────────────────────────────────────
  for (const item of opts.items) {
    const qty = item.qty ?? 1;
    const lineTotalStr = moneyCol(item.lineTotal);
    const prefix = `  ${qty} x `;
    const nameLine = prefix + clip(item.name, Math.max(1, w - prefix.length - lineTotalStr.length - 1));
    r += pad(nameLine, lineTotalStr) + '\n';
    // Per-unit price when qty > 1 so the customer can see the per-item price.
    if (qty > 1) {
      r += `       @ $${item.unitPrice.toFixed(2)} ea\n`;
    }
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        const modStr = mod.priceAdjustment
          ? `       - ${mod.name} (${mod.priceAdjustment >= 0 ? '+' : ''}$${mod.priceAdjustment.toFixed(2)})`
          : `       - ${mod.name}`;
        r += clip(modStr, w) + '\n';
      }
    }
    if (item.discountAmount && item.discountAmount > 0) {
      r += clip(`       Discount -$${item.discountAmount.toFixed(2)}`, w) + '\n';
    }
    if (item.note) {
      r += clip(`       Note: ${item.note}`, w) + '\n';
    }
    if (item.seat !== undefined && item.seat !== null) {
      r += clip(`       Seat ${item.seat}`, w) + '\n';
    }
  }
  r += dash + '\n';

  // ── Totals ────────────────────────────────────────────────────────
  r += pad('  Subtotal (ex GST)', moneyCol(opts.totals.subtotalExGst)) + '\n';
  if (opts.totals.itemDiscount && opts.totals.itemDiscount > 0) {
    r += pad('  Item Discount', `-${moneyCol(opts.totals.itemDiscount)}`) + '\n';
  }
  if (opts.totals.orderDiscount && opts.totals.orderDiscount > 0) {
    r += pad('  Order Discount', `-${moneyCol(opts.totals.orderDiscount)}`) + '\n';
  }
  r += pad('  GST (10%)', moneyCol(opts.totals.gst)) + '\n';
  if (opts.totals.surcharge && opts.totals.surcharge > 0) {
    r += pad('  Surcharge', moneyCol(opts.totals.surcharge)) + '\n';
  }
  if (opts.totals.tip && opts.totals.tip > 0) {
    r += pad('  Tip', moneyCol(opts.totals.tip)) + '\n';
  }
  r += line + '\n';
  r += `<B>${pad('  TOTAL', moneyCol(opts.totals.total))}</B>\n`;
  r += line + '\n';

  // ── Payment ───────────────────────────────────────────────────────
  if (opts.payment) {
    const method = opts.payment.method;
    const paid = opts.totals.total;
    r += pad(`  Payment: ${clip(method, w - 16)}`, moneyCol(paid)) + '\n';
    if (opts.payment.cardType || opts.payment.cardLast4) {
      const t  = opts.payment.cardType ?? 'Card';
      const l4 = opts.payment.cardLast4 ? ` ****${opts.payment.cardLast4}` : '';
      r += clip(`  Card: ${t}${l4}`, w) + '\n';
      if (opts.payment.authCode || opts.payment.rrn) {
        const auth = opts.payment.authCode ? `Auth: ${opts.payment.authCode}` : '';
        const rrn  = opts.payment.rrn      ? `RRN: ${opts.payment.rrn}`      : '';
        r += `    ${clip(auth, Math.max(1, Math.floor(w / 2) - 2))}    ${clip(rrn, Math.max(1, w - Math.floor(w / 2) - 6))}\n`;
      }
    }
    if (opts.payment.tendered !== undefined) {
      r += pad('  Tendered', moneyCol(opts.payment.tendered)) + '\n';
    }
    if (opts.payment.changeGiven && opts.payment.changeGiven > 0) {
      r += pad('  Change', moneyCol(opts.payment.changeGiven)) + '\n';
    }
    r += line + '\n';
  }

  // ── Loyalty ───────────────────────────────────────────────────────
  if (opts.loyalty && (opts.loyalty.pointsEarned !== undefined || opts.loyalty.pointsBalance !== undefined)) {
    const earnedPart = opts.loyalty.pointsEarned !== undefined
      ? `Earned ${opts.loyalty.pointsEarned}` : '';
    const balancePart = opts.loyalty.pointsBalance !== undefined
      ? ` (Balance ${opts.loyalty.pointsBalance})` : '';
    r += clip(`  Loyalty: ${earnedPart}${balancePart}`, w) + '\n';
    r += line + '\n';
  }

  // ── Copy marker ───────────────────────────────────────────────────
  r += `<C><B>${copy === 'merchant' ? '* MERCHANT COPY *' : '* CUSTOMER COPY *'}</B></C>\n`;
  r += line + '\n';

  // ── ANZ terminal receipt (verbatim, monospace) ────────────────────
  if (opts.anzReceiptText && opts.anzReceiptText.trim().length > 0) {
    r += '\n' + opts.anzReceiptText.trim() + '\n';
    r += line + '\n';
  }

  // ── Feedback QR (real ESC/POS) ────────────────────────────────────
  if (opts.store.qrPayload) {
    r += centre('Scan for feedback') + '\n';
    // Raw ESC/POS — see escPosQrCode() for the byte layout + caveats.
    r += escPosQrCode(opts.store.qrPayload, 6) + '\n';
    if (opts.store.qrMessage) {
      r += centre(clip(opts.store.qrMessage, w)) + '\n';
    }
    r += line + '\n';
  }

  // ── Order barcode (scannable Code128) + human-readable ref ───────
  // Staff can scan this at the orders-detail page to jump straight to
  // the order / refund flow without typing the number.
  // v2.7.44 — also gated on the merchant's showOrderNumber toggle so a
  // shop that hides the order number doesn't get a barcode either.
  if (showOrderNumber && opts.order.orderNumber) {
    r += centre('Order #') + '\n';
    r += escPosBarcode128(opts.order.orderNumber) + '\n';
    r += `<C><B>${clip(opts.order.orderNumber, w - 2)}</B></C>\n`;
    r += line + '\n';
  }

  // ── Footer ────────────────────────────────────────────────────────
  r += centre('Thank you!') + '\n';
  if (opts.store.website) r += centre(clip(opts.store.website, w)) + '\n';
  r += centre(clip(iso, w)) + '\n';
  const trace = opts.traceId ?? opts.order.orderNumber;
  if (trace) r += centre(clip(`Trace ${trace}`, w)) + '\n';
  r += '\n';
  r += centre('Powered by ElevatedPOS') + '\n';
  r += line + '\n';
  r += '\n\n\n';

  return r;
}

/**
 * Print a single formatted POS receipt. Use `printSaleReceipts` for
 * card sales so the customer + merchant copies go through one call.
 */
export async function printReceipt(opts: PrintReceiptOpts | LegacyReceiptOpts): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const { type, paperWidth } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();

  // v2.7.51 — make `printReceipt` (single receipt / reprint path) ALSO
  // respect the merchant's latest dashboard toggle. Previously only
  // `printSaleReceipts` refreshed device-config, so reprinting an old
  // order via the Orders detail screen would render with the toggle's
  // value at order-placement time, not the current setting.
  await ensureFreshSettings();
  const fresh = getReceiptSettings();

  // Accept the legacy shape so pre-v2.7.17 callers keep compiling.
  const normalised = isLegacyReceiptOpts(opts) ? legacyToRich(opts) : opts;
  // Override the caller's snapshot with the freshly-fetched value so
  // toggle changes are reflected even on reprints.
  const withFresh: PrintReceiptOpts = {
    ...normalised,
    order: { ...normalised.order, showOrderNumber: fresh.showOrderNumber },
  };
  console.log(
    '[receipt-toggle] printReceipt override showOrderNumber=',
    fresh.showOrderNumber,
    ' (caller passed=', normalised.order.showOrderNumber, ')',
  );
  const text = buildReceiptText(withFresh, paperWidth);

  // v2.7.48 — render the merchant logo (if any) as a raster bitmap above
  // the text body. Best-effort: a bad logo or unsupported firmware logs
  // a warning but does NOT block the receipt body.
  try {
    await printLogoIfAny(fresh);
  } catch (err) {
    console.warn('[printer] logo print failed — continuing with text receipt:', err);
  }

  try {
    await printer.printText(text, { cut: true });
  } catch (e: any) {
    throw new Error('Print failed: ' + (e?.message ?? 'unknown'));
  }
}

/**
 * Convenience for card sales: prints the POS customer copy, the POS
 * merchant copy, and any ANZ terminal receipts per the merchant's
 * print preferences (see `useReceiptPrefs`).
 *
 * Four toggles drive the flow:
 *   - `printCustomerReceipt`     (bool)  — POS customer copy on/off
 *   - `printStoreReceipt`        (bool)  — POS merchant copy on/off
 *   - `eftposCustomerAttach`     (enum)  — off / attached / standalone
 *   - `eftposStoreAttach`        (enum)  — off / attached / standalone
 *
 * `attached` means the ANZ receipt is appended to the bottom of the
 * corresponding POS receipt (historical default). `standalone` prints
 * it as its own cut receipt after the POS receipt.
 */
export async function printSaleReceipts(
  opts: Omit<PrintReceiptOpts, 'copy' | 'anzReceiptText'> & {
    anzMerchantReceipt?: string;
    anzCustomerReceipt?: string;
  },
): Promise<void> {
  // v2.7.48 — pull fresh device-config from the server before printing so a
  // dashboard change the merchant just made (showOrderNumber toggle, logo
  // upload) takes effect on the very next receipt without forcing them to
  // tap "Sync" on the More page. Best-effort: throttled to a 30s window
  // so this never blocks the print on a slow connection.
  //
  // After the refresh we re-pull the receipt settings and OVERRIDE the
  // value the caller captured at order-placement time. The caller's
  // `getReceiptSettings()` snapshot may be stale (older than 30s of
  // navigating around), and bug 1 in v2.7.48 was specifically that
  // toggle changes weren't reflected. The fresh fetch + override is the
  // root-cause fix.
  await ensureFreshSettings();
  const fresh = getReceiptSettings();
  const overrideShowOrderNumber = fresh.showOrderNumber;

  // v2.7.51 — confirm the merchant's toggle propagation right before print.
  console.log(
    '[receipt-toggle] printSaleReceipts override showOrderNumber=',
    overrideShowOrderNumber,
    ' (caller passed=', opts.order.showOrderNumber, ')',
  );

  const { anzMerchantReceipt, anzCustomerReceipt, ...base } = opts;
  // Re-apply the fresh toggle so all downstream `printReceipt` calls
  // see the latest server-side value, not the snapshot the call site
  // captured before the fetch happened.
  const baseWithFreshSettings: typeof base = {
    ...base,
    order: { ...base.order, showOrderNumber: overrideShowOrderNumber },
  };
  const prefs = useReceiptPrefs.getState();

  const customerAnz = anzCustomerReceipt && anzCustomerReceipt.trim().length > 0
    ? anzCustomerReceipt
    : undefined;
  const merchantAnz = anzMerchantReceipt && anzMerchantReceipt.trim().length > 0
    ? anzMerchantReceipt
    : undefined;

  // ── Customer POS receipt ─────────────────────────────────────────
  if (prefs.printCustomerReceipt) {
    const anzAttached = prefs.eftposCustomerAttach === 'attached'
      ? customerAnz
      : undefined;
    await printReceipt({
      ...baseWithFreshSettings,
      copy: 'customer',
      anzReceiptText: anzAttached,
    });
  }

  // ── Standalone ANZ customer receipt ──────────────────────────────
  if (prefs.eftposCustomerAttach === 'standalone' && customerAnz) {
    await printRawAnzReceipt(customerAnz, 'customer');
  }

  // ── Merchant POS receipt ─────────────────────────────────────────
  if (prefs.printStoreReceipt) {
    const anzAttached = prefs.eftposStoreAttach === 'attached'
      ? merchantAnz
      : undefined;
    await printReceipt({
      ...baseWithFreshSettings,
      copy: 'merchant',
      anzReceiptText: anzAttached,
    });
  }

  // ── Standalone ANZ merchant receipt ──────────────────────────────
  if (prefs.eftposStoreAttach === 'standalone' && merchantAnz) {
    await printRawAnzReceipt(merchantAnz, 'merchant');
  }
}

/**
 * Print the raw ANZ terminal receipt verbatim as its own cut receipt.
 * Wraps the ANZ text in a minimal POS header/footer so staff can see
 * which copy it is, without re-printing the full itemised POS receipt.
 */
export async function printRawAnzReceipt(
  text: string,
  copy: ReceiptCopy,
): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const { type, paperWidth } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();

  const w = paperWidth === 58 ? 32 : 48;
  const line = '='.repeat(w);

  let body = '';
  body += line + '\n';
  body += `<C><B>${copy === 'merchant' ? '* MERCHANT COPY *' : '* CUSTOMER COPY *'}</B></C>\n`;
  body += line + '\n';
  body += '\n' + text.trim() + '\n';
  body += line + '\n';
  body += '<C>Powered by ElevatedPOS</C>\n';
  body += '\n\n\n';

  try {
    await printer.printText(body, { cut: true });
  } catch (e: any) {
    throw new Error('ANZ receipt print failed: ' + (e?.message ?? 'unknown'));
  }
}

/* ------------------------------------------------------------------ */
/* Legacy adapter                                                      */
/* ------------------------------------------------------------------ */

/** Pre-v2.7.17 receipt shape — retained for backward compatibility. */
export interface LegacyReceiptOpts {
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
}

function isLegacyReceiptOpts(o: PrintReceiptOpts | LegacyReceiptOpts): o is LegacyReceiptOpts {
  return (o as LegacyReceiptOpts).storeName !== undefined
      && (o as PrintReceiptOpts).store === undefined;
}

function legacyToRich(o: LegacyReceiptOpts): PrintReceiptOpts {
  return {
    store: { name: o.storeName },
    order: {
      orderNumber: o.orderNumber,
      cashierName: o.cashierName,
      orderedAt: new Date(),
    },
    items: o.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      unitPrice: i.price,
      lineTotal: i.price * i.qty,
    })),
    totals: {
      subtotalExGst: o.subtotal,
      gst: o.gst,
      surcharge: o.surchargeAmount,
      tip: o.tipAmount,
      total: o.total,
    },
    payment: o.paymentMethod ? { method: o.paymentMethod } : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* End-of-Day (Close Till) Report                                      */
/* ------------------------------------------------------------------ */

/**
 * Options for {@link printEodReport}.
 *
 * The POS close-till flow gathers these numbers from three sources:
 *   - `store`  → local device identity + branch label
 *   - `shift`  → local till store (opened/closed times, float, counted cash)
 *   - `sales`  → server `/api/v1/orders/eod-summary` response
 *
 * Any missing optional fields render as blank lines rather than crashing.
 */
export interface EodReportOpts {
  store: { name: string; branch?: string; device?: string };
  shift: {
    openedAt: Date | null;
    closedAt: Date;
    openedByName?: string;
    floatDollars: number;
    expectedCashDollars: number;
    countedCashDollars: number;
    varianceDollars: number;
    notes?: string;
  };
  sales: {
    totalCount: number;       totalDollars: number;
    cashCount: number;        cashDollars: number;
    cardCount: number;        cardDollars: number;
    otherCount?: number;      otherDollars?: number;
    refundCount: number;      refundDollars: number;
  };
  /** Optional raw ANZ reconciliation receipt text, appended verbatim. */
  anzReconciliationText?: string;
}

/**
 * Print the End-of-Day (Close Till) report.
 *
 * Layout is designed to mirror the sale-receipt style in
 * {@link buildReceiptText} — large centred store header, dashed
 * section dividers, monospaced aligned columns. Honours the paper width
 * from `usePrinterStore` (58mm → 32 cols, 80mm → 48 cols).
 */
export async function printEodReport(opts: EodReportOpts): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const { type, paperWidth } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();

  const w = paperWidth === 58 ? 32 : 48;
  const bigW = Math.floor(w / 2);
  const line = '='.repeat(w);
  const dash = '-'.repeat(w);
  // v2.7.44 — half-width separator for use immediately after `</CM>` lines
  // (cheap firmware can leak the 2× width state past the implicit reset on
  // '\n', wrapping a full-width `===`). bigW × 2 ≤ w, so it fits either way.
  const bigLine = '='.repeat(bigW);

  function pad(left: string, right: string): string {
    const space = w - left.length - right.length;
    return left + ' '.repeat(Math.max(1, space)) + right;
  }
  function clip(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) : s;
  }
  function centre(s: string): string {
    return `<C>${clip(s, w)}</C>`;
  }
  function money(n: number): string {
    const abs = Math.abs(n).toFixed(2);
    return n < 0 ? `-$${abs}` : `$${abs}`;
  }
  function fmtDT(d: Date | null): string {
    if (!d) return '—';
    try {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month} ${h}:${m}`;
    } catch {
      return '—';
    }
  }

  const otherCount = opts.sales.otherCount ?? 0;
  const otherDollars = opts.sales.otherDollars ?? 0;

  let r = '';
  // ── Header ──────────────────────────────────────────────────────────
  r += line + '\n';
  r += `<CM>${clip('END OF DAY REPORT', bigW)}</CM>\n`;
  r += `<CM>${clip(opts.store.name, bigW)}</CM>\n`;
  const hasBranchOrDevice = !!(opts.store.branch || opts.store.device);
  if (hasBranchOrDevice) {
    const parts: string[] = [];
    if (opts.store.branch) parts.push(opts.store.branch);
    if (opts.store.device) parts.push(`Device: ${opts.store.device}`);
    r += centre(clip(parts.join('  '), w)) + '\n';
  }
  // bigLine when the separator sits directly after `</CM>` (no branch/device
  // line between). See v2.7.44 notes — cheap firmware can leak 2× width past
  // the implicit reset on '\n' and wrap a full-width `===`.
  r += (hasBranchOrDevice ? line : `<C>${bigLine}</C>`) + '\n';

  // ── Shift times ─────────────────────────────────────────────────────
  const openedLine = opts.shift.openedByName
    ? pad(`  Opened:  ${fmtDT(opts.shift.openedAt)}`, `By ${clip(opts.shift.openedByName, Math.max(4, w - 20))}  `)
    : `  Opened:  ${fmtDT(opts.shift.openedAt)}`;
  r += openedLine + '\n';
  r += `  Closed:  ${fmtDT(opts.shift.closedAt)}\n`;
  r += dash + '\n';

  // ── Sales block ─────────────────────────────────────────────────────
  r += centre('Sales') + '\n';
  r += dash + '\n';
  r += pad(`  Total sales (${opts.sales.totalCount})`, money(opts.sales.totalDollars)) + '\n';
  r += pad(`    Cash  (${opts.sales.cashCount})`, money(opts.sales.cashDollars)) + '\n';
  r += pad(`    Card  (${opts.sales.cardCount})`, money(opts.sales.cardDollars)) + '\n';
  if (otherCount > 0 || otherDollars > 0) {
    r += pad(`    Other (${otherCount})`, money(otherDollars)) + '\n';
  }
  r += pad(`  Refunds (${opts.sales.refundCount})`, `-${money(opts.sales.refundDollars)}`) + '\n';
  r += line + '\n';

  // ── Cash reconciliation ────────────────────────────────────────────
  const cashRefunds = 0; // Server currently returns cashRefunds=0 — placeholder.
  r += centre('Cash Reconciliation') + '\n';
  r += dash + '\n';
  r += pad('  Opening float', money(opts.shift.floatDollars)) + '\n';
  r += pad('  + Cash sales', money(opts.sales.cashDollars)) + '\n';
  r += pad('  - Cash refunds', `-${money(cashRefunds)}`) + '\n';
  r += pad('  = Expected in drawer', money(opts.shift.expectedCashDollars)) + '\n';
  r += pad('  Counted cash', money(opts.shift.countedCashDollars)) + '\n';
  const vSign = opts.shift.varianceDollars > 0
    ? '+'
    : opts.shift.varianceDollars < 0 ? '-' : '';
  const vAbs = Math.abs(opts.shift.varianceDollars).toFixed(2);
  r += `<B>${pad('  Variance', `${vSign}$${vAbs}`)}</B>\n`;
  r += line + '\n';

  // ── Notes (optional) ───────────────────────────────────────────────
  if (opts.shift.notes && opts.shift.notes.trim().length > 0) {
    r += '  Notes:\n';
    // Wrap the notes to the paper width so long runs don't clip.
    const body = opts.shift.notes.trim();
    const chunkSize = Math.max(16, w - 4);
    for (let i = 0; i < body.length; i += chunkSize) {
      r += `  ${body.slice(i, i + chunkSize)}\n`;
    }
    r += line + '\n';
  }

  // ── Verbatim ANZ reconciliation receipt ────────────────────────────
  if (opts.anzReconciliationText && opts.anzReconciliationText.trim().length > 0) {
    r += '\n' + opts.anzReconciliationText.trim() + '\n';
    r += line + '\n';
  }

  // ── Footer ─────────────────────────────────────────────────────────
  r += centre('Powered by ElevatedPOS') + '\n';
  r += centre(clip(new Date().toISOString(), w)) + '\n';
  r += line + '\n';
  r += '\n\n\n';

  try {
    await printer.printText(r, { cut: true });
  } catch (e: any) {
    throw new Error('EOD report print failed: ' + (e?.message ?? 'unknown'));
  }
}

export async function printRefundReceipt(opts: {
  storeName: string;
  orderNumber?: string;
  items: { name: string; qty: number; price: number }[];
  refundAmount: number;
  reason?: string;
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
  receipt += `<C><B>*** REFUND ***</B></C>\n`;
  if (opts.orderNumber) receipt += `<C>Order #${opts.orderNumber}</C>\n`;
  receipt += `<C>${date}  ${time}</C>\n`;
  receipt += line + '\n';

  for (const item of opts.items) {
    const priceStr = `-$${item.price.toFixed(2)}`;
    const nameStr = item.qty > 1 ? `${item.qty}x ${item.name}` : item.name;
    receipt += pad(nameStr.substring(0, w - priceStr.length - 1), priceStr) + '\n';
  }

  receipt += dash + '\n';
  receipt += `<B>${pad('REFUND TOTAL', `-$${opts.refundAmount.toFixed(2)}`)}</B>\n`;
  receipt += line + '\n';
  if (opts.reason) {
    receipt += `Reason: ${opts.reason.substring(0, w - 8)}\n`;
  }
  receipt += '\n<C>Thank you!</C>\n';
  receipt += '<C>Powered by ElevatedPOS</C>\n\n\n';

  try {
    await printer.printText(receipt, { cut: true });
  } catch (e: any) {
    throw new Error('Refund receipt print failed: ' + (e?.message ?? 'unknown'));
  }
}

/**
 * Detailed refund receipt (v2.7.27).
 *
 * Reuses the rich sale-receipt layout so an itemised refund slip has the
 * same store header, items block, totals table, and ANZ receipt tail as
 * the original sale — just with "*** REFUND ***" banners and negated
 * totals. Unlike {@link printRefundReceipt} (which takes a minimal
 * storeName + orderNumber shape), this one expects the full
 * {@link PrintReceiptOpts} plus the original order number and the
 * refunded amount, and prints both the customer + merchant copies per
 * the merchant's receipt-prefs toggles.
 */
export async function printRefundReceiptDetailed(
  opts: Omit<PrintReceiptOpts, 'copy' | 'anzReceiptText'> & {
    originalOrderNumber: string;
    refundAmount: number;
    anzMerchantReceipt?: string;
    anzCustomerReceipt?: string;
  },
): Promise<void> {
  if (!loadPrinterModules()) throw new Error('Printer module not available.');
  const { type, paperWidth } = usePrinterStore.getState().config;
  const printer = getPrinter(type);
  if (!printer) throw new Error('No printer configured');
  if (!connected) await connectPrinter();

  const { anzMerchantReceipt, anzCustomerReceipt, originalOrderNumber, refundAmount, ...base } = opts;
  const prefs = useReceiptPrefs.getState();

  const customerAnz = anzCustomerReceipt && anzCustomerReceipt.trim().length > 0
    ? anzCustomerReceipt
    : undefined;
  const merchantAnz = anzMerchantReceipt && anzMerchantReceipt.trim().length > 0
    ? anzMerchantReceipt
    : undefined;

  const w = paperWidth === 58 ? 32 : 48;
  const line = '='.repeat(w);

  function buildRefundText(copy: ReceiptCopy, anzReceiptText?: string): string {
    // Delegate to the standard rich builder so header / items / totals all
    // stay consistent with a sale receipt. We then inject the "REFUND"
    // banner + refunded-amount summary after the standard body.
    const core = buildReceiptText(
      { ...(base as PrintReceiptOpts), copy, anzReceiptText },
      paperWidth,
    );
    // Prepend a big centred REFUND banner + original-order ref so the
    // customer immediately sees this isn't a sale receipt.
    let banner = '';
    banner += line + '\n';
    banner += `<C><B>*** REFUND ***</B></C>\n`;
    banner += `<C>Original Order: #${originalOrderNumber}</C>\n`;
    banner += `<C><B>Refunded: -$${refundAmount.toFixed(2)}</B></C>\n`;
    banner += line + '\n';
    return banner + core;
  }

  // ── Customer POS refund receipt ──────────────────────────────────────
  if (prefs.printCustomerReceipt) {
    const anzAttached = prefs.eftposCustomerAttach === 'attached' ? customerAnz : undefined;
    const text = buildRefundText('customer', anzAttached);
    try {
      await printer.printText(text, { cut: true });
    } catch (e: any) {
      throw new Error('Refund receipt print failed: ' + (e?.message ?? 'unknown'));
    }
  }

  // ── Standalone ANZ customer receipt ──────────────────────────────────
  if (prefs.eftposCustomerAttach === 'standalone' && customerAnz) {
    await printRawAnzReceipt(customerAnz, 'customer');
  }

  // ── Merchant POS refund receipt ──────────────────────────────────────
  if (prefs.printStoreReceipt) {
    const anzAttached = prefs.eftposStoreAttach === 'attached' ? merchantAnz : undefined;
    const text = buildRefundText('merchant', anzAttached);
    try {
      await printer.printText(text, { cut: true });
    } catch (e: any) {
      throw new Error('Refund receipt print failed: ' + (e?.message ?? 'unknown'));
    }
  }

  // ── Standalone ANZ merchant receipt ──────────────────────────────────
  if (prefs.eftposStoreAttach === 'standalone' && merchantAnz) {
    await printRawAnzReceipt(merchantAnz, 'merchant');
  }
}

/**
 * v2.7.48 — line item shape for `printOrderTickets`. Carries the
 * destination tag inherited from the line's product → category, so the
 * grouping logic in `printOrderTickets` doesn't need a catalog lookup.
 */
export interface OrderTicketLine {
  name: string;
  qty: number;
  /**
   * Routing destination from `category.printerDestination`. Lines with
   * `'none'`, empty string, or `null` are dropped — those categories
   * are explicitly opted out of kitchen tickets.
   */
  destination?: string | null;
  note?: string;
}

/**
 * Build the kitchen-ticket text for a SINGLE destination's lines.
 * Shared between the legacy `printOrderTicket` (single-printer) and
 * the v2.7.48 `printOrderTickets` (multi-printer) paths so the layout
 * stays consistent.
 */
function buildOrderTicketText(args: {
  paperWidth: 58 | 80;
  orderNumber?: string;
  orderTypeLabel?: string;
  destinationLabel?: string; // shown in the header so kitchen vs bar tickets are distinguishable
  items: { name: string; qty: number; note?: string }[];
}): string {
  const w = args.paperWidth === 58 ? 32 : 48;
  const line = '='.repeat(w);

  const now = new Date();
  const time = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  let ticket = '';
  ticket += `<C><B>ORDER TICKET</B></C>\n`;
  if (args.destinationLabel) {
    ticket += `<C><B>[ ${args.destinationLabel.toUpperCase()} ]</B></C>\n`;
  }
  if (args.orderNumber) ticket += `<C>Order #${args.orderNumber}</C>\n`;
  if (args.orderTypeLabel) ticket += `<C><B>${args.orderTypeLabel}</B></C>\n`;
  ticket += `<C>${time}</C>\n`;
  ticket += line + '\n';

  for (const item of args.items) {
    const qtyStr = `x${item.qty}`;
    const nameStr = item.name.substring(0, w - qtyStr.length - 2);
    const space = w - nameStr.length - qtyStr.length;
    ticket += nameStr + ' '.repeat(Math.max(1, space)) + qtyStr + '\n';
    if (item.note) {
      ticket += `   ${item.note.substring(0, w - 4)}\n`;
    }
  }

  ticket += line + '\n\n\n';
  return ticket;
}

/**
 * Print a single kitchen / bar ticket — legacy single-printer path.
 *
 * v2.7.48 changes:
 *  - Bails early with a console.warn (no throw) when the order printer
 *    is configured but disconnected, so the caller's try/catch isn't
 *    invoked and the toast surface is the responsibility of the caller's
 *    higher-level code (not us).
 *  - Renders the merchant logo (best-effort) at the top of the ticket
 *    so kitchen staff see the same branding as the customer copy.
 *
 * Callers that want per-category routing should use {@link printOrderTickets}
 * instead — this function preserves the pre-v2.7.48 single-printer behaviour
 * for back-compat.
 */
export async function printOrderTicket(opts: {
  orderNumber?: string;
  items: { name: string; qty: number; note?: string }[];
  /**
   * v2.7.44 — hospitality order type label ("Dine In" / "Takeaway" /
   * "Delivery"). When set, printed in bold under the order number so the
   * kitchen knows which channel the ticket is for. Omit for retail.
   */
  orderTypeLabel?: string;
}): Promise<void> {
  if (!loadPrinterModules()) {
    console.warn('[printer] printOrderTicket: module not available — skipping');
    return;
  }
  const cfg = usePrinterStore.getState().config;

  // Prefer the dedicated order printer if it has been configured. The library
  // only supports one active connection per transport, so we may need to
  // disconnect from the receipt printer and reconnect to the order printer.
  const useOrderPrinter = !!(cfg.orderPrinter?.type && cfg.orderPrinter.address);
  const targetType = useOrderPrinter ? cfg.orderPrinter.type : cfg.type;
  const targetAddress = useOrderPrinter ? cfg.orderPrinter.address : cfg.address;
  const paperWidth = useOrderPrinter ? cfg.orderPrinter.paperWidth : cfg.paperWidth;
  const printer = getPrinter(targetType);
  if (!printer) {
    console.warn('[printer] printOrderTicket: no printer configured');
    return;
  }

  // If we're switching to a different physical printer, drop the existing
  // connection and reconnect to the new device.
  // v2.7.48 — every connect/init failure is now caught + logged rather
  // than thrown so a disconnected order printer doesn't propagate an
  // exception up the sale flow. The caller treats no kitchen ticket as a
  // soft warning, not a sale-blocking error.
  let switchedTransport = false;
  if (useOrderPrinter && (cfg.type !== targetType || cfg.address !== targetAddress)) {
    if (connected) { try { await disconnectPrinter(); } catch { /* ignore */ } }
    try {
      if (targetType === 'network') {
        try { await NetPrinter?.init(); } catch { /* ignore */ }
        const [host, portStr] = (targetAddress || '').split(':');
        await NetPrinter?.connectPrinter(host!, parseInt(portStr ?? '9100'));
      } else if (targetType === 'usb') {
        try { await USBPrinter?.init(); } catch { /* ignore */ }
        let devices: any[] = [];
        try { devices = await USBPrinter.getDeviceList(); } catch { devices = []; }
        const target = devices.find((d: any) => String(d.device_id) === targetAddress) ?? devices[0];
        if (!target) throw new Error('order printer not found on USB bus');
        await USBPrinter.connectPrinter(target.vendor_id, target.product_id);
      } else if (targetType === 'bluetooth') {
        try { await BLEPrinter?.init(); } catch { /* ignore */ }
        await BLEPrinter?.connectPrinter(targetAddress);
      }
      connected = true;
      connectedOrderPrinterAddress = targetAddress;
      switchedTransport = true;
    } catch (err) {
      console.warn('[printer] printOrderTicket: order printer unreachable —', err);
      return; // Best-effort: skip the ticket without throwing.
    }
  } else if (!connected) {
    try { await connectPrinter(); } catch (err) {
      console.warn('[printer] printOrderTicket: receipt printer unreachable —', err);
      return;
    }
  }

  // Best-effort logo print at the top — small enough to not waste paper.
  try { await printLogoIfAny(getReceiptSettings()); } catch { /* ignore */ }

  const ticket = buildOrderTicketText({
    paperWidth: paperWidth === 58 ? 58 : 80,
    orderNumber: opts.orderNumber,
    orderTypeLabel: opts.orderTypeLabel,
    items: opts.items,
  });

  try {
    await printer.printText(ticket, { cut: true });
  } catch (e: any) {
    console.warn('[printer] printOrderTicket: print call failed —', e?.message ?? e);
  }

  // Don't leave the library connected to the order printer if we hijacked
  // the receipt-printer transport — the next receipt-side call will
  // re-connect the receipt printer anyway, but flagging it explicitly
  // saves a stale-connection warning.
  if (switchedTransport) {
    connectedOrderPrinterAddress = targetAddress;
  }
}

/**
 * v2.7.48 — multi-printer routing helper.
 *
 * Groups `lines` by their `destination` tag (typically inherited from
 * `category.printerDestination`) and prints one ticket per non-empty
 * group to the matching `OrderPrinterDevice` in `cfg.orderPrinters`.
 *
 * Routing rules:
 *   - Lines with `destination` == `'none'`, empty string, or null/undefined
 *     are dropped (those categories opted out of kitchen tickets).
 *   - Lines whose destination doesn't match any configured printer are
 *     forwarded to the legacy single `cfg.orderPrinter` (if set) under
 *     a "kitchen" fallback so existing single-printer rigs keep working.
 *   - When `cfg.orderPrinters` is empty AND the legacy `cfg.orderPrinter`
 *     is set, every printable line goes to the legacy printer (treated as
 *     destination 'kitchen').
 *   - Each printer's connect/print is wrapped in try/catch — a failure on
 *     one destination never blocks the others.
 *
 * Best-effort: NEVER throws. Any failure is logged and the call returns
 * normally so the sale itself isn't blocked.
 */
export async function printOrderTickets(opts: {
  orderNumber?: string;
  orderTypeLabel?: string;
  lines: OrderTicketLine[];
}): Promise<void> {
  if (!loadPrinterModules()) {
    console.warn('[printer] printOrderTickets: module not available — skipping');
    return;
  }

  const cfg = usePrinterStore.getState().config;
  const printerList = cfg.orderPrinters;

  // Filter & group lines by destination. Drop opt-outs early so empty
  // groups don't waste paper.
  const groups = new Map<string, OrderTicketLine[]>();
  for (const ln of opts.lines) {
    const dest = (ln.destination ?? '').toLowerCase().trim();
    if (!dest || dest === 'none') continue;
    const arr = groups.get(dest) ?? [];
    arr.push(ln);
    groups.set(dest, arr);
  }
  if (groups.size === 0) {
    console.log('[printer] printOrderTickets: no printable lines after destination filter');
    return;
  }

  // v2.7.49 — resolve each destination to a physical printer.
  //
  // Routing rules (in order):
  //   1. Multi-printer mode (`orderPrinters[]` non-empty): match the
  //      destination exactly. If no printer is tagged for that
  //      destination, the line is dropped with a warning. Legacy
  //      single-printer config is IGNORED in this mode — adding even
  //      one entry to `orderPrinters` graduates the merchant to
  //      multi-printer mode and the legacy printer is no longer used.
  //      Otherwise legacy was silently capturing every 'kitchen' line
  //      even when a real kitchen printer was added (the bug merchants
  //      reported as "added a second printer but everything still
  //      prints from the first").
  //   2. Single-printer mode (`orderPrinters[]` empty AND legacy set):
  //      every line goes to the legacy printer, which is treated as a
  //      'kitchen' destination. This preserves behaviour for merchants
  //      who haven't migrated to the new UI yet.
  //   3. No printer config at all: drop everything with a warning.
  const legacy = cfg.orderPrinter?.type && cfg.orderPrinter.address ? cfg.orderPrinter : null;
  const inMultiPrinterMode = printerList.length > 0;

  function resolvePrinter(dest: string): OrderPrinterDevice | null {
    if (inMultiPrinterMode) {
      const exact = printerList.find((p) => p.destination?.toLowerCase().trim() === dest);
      return exact ?? null;
    }
    if (legacy) {
      return {
        id: 'legacy',
        destination: 'kitchen',
        type: legacy.type,
        address: legacy.address,
        name: legacy.name ?? 'Order Printer',
        paperWidth: legacy.paperWidth,
      };
    }
    return null;
  }

  console.log('[printer] printOrderTickets: routing', {
    mode: inMultiPrinterMode ? 'multi' : (legacy ? 'legacy-single' : 'none'),
    printerList: printerList.map((p) => ({ destination: p.destination, name: p.name, address: p.address })),
    legacy: legacy ? { name: legacy.name, address: legacy.address } : null,
    groups: Array.from(groups.keys()),
  });

  for (const [dest, lines] of groups) {
    const target = resolvePrinter(dest);
    if (!target || !target.type || !target.address) {
      console.warn(
        `[printer] printOrderTickets: no printer configured for destination "${dest}" — dropping`,
        lines.length, 'lines',
        inMultiPrinterMode
          ? `(multi-printer mode — set a category's "Printer Destination" to "${dest}" or add a printer with that destination tag in More → Order Printers)`
          : '(no printer configured)',
      );
      continue;
    }
    console.log(
      `[printer] printOrderTickets: dest="${dest}" → printer "${target.name}" (${target.address})`,
      `(${lines.length} line${lines.length === 1 ? '' : 's'})`,
    );

    try {
      await connectOrderPrinter(target);
    } catch (err) {
      console.warn(
        `[printer] printOrderTickets: connect failed for destination "${dest}" (${target.name}) —`,
        err,
      );
      continue;
    }

    const printer = getPrinter(target.type);
    if (!printer) {
      console.warn('[printer] printOrderTickets: native module missing for', target.type);
      continue;
    }

    // Logo at top of the kitchen ticket too — small branding for the
    // back-of-house workflow. Best-effort only.
    try { await printLogoIfAny(getReceiptSettings()); } catch { /* ignore */ }

    const ticket = buildOrderTicketText({
      paperWidth: target.paperWidth === 58 ? 58 : 80,
      orderNumber: opts.orderNumber,
      orderTypeLabel: opts.orderTypeLabel,
      destinationLabel: target.destination ?? dest,
      items: lines.map((l) => ({ name: l.name, qty: l.qty, note: l.note })),
    });

    try {
      await printer.printText(ticket, { cut: true });
    } catch (err: any) {
      console.warn(
        `[printer] printOrderTickets: print call failed for "${dest}" —`,
        err?.message ?? err,
      );
    }
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
        target.vendor_id,
        target.product_id,
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
