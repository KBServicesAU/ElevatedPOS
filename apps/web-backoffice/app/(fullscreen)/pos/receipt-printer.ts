const ESC = 0x1b;

export const CMD = {
  INIT:        [ESC, 0x40],
  BOLD_ON:     [ESC, 0x45, 0x01],
  BOLD_OFF:    [ESC, 0x45, 0x00],
  CENTER:      [ESC, 0x61, 0x01],
  LEFT:        [ESC, 0x61, 0x00],
  FEED:        [0x0a],                       // line feed
  CUT:         [0x1d, 0x56, 0x41, 0x00],    // partial cut
  DRAWER_OPEN: [ESC, 0x70, 0x00, 0x19, 0xfa], // open cash drawer
  FONT_SMALL:  [ESC, 0x4d, 0x01],
  FONT_NORMAL: [ESC, 0x4d, 0x00],
} as const;

export interface ReceiptLine {
  name: string;
  qty: number;
  price: number;
  discount?: number;
  note?: string;
}

export interface ReceiptData {
  storeName: string;
  orderNumber: string;
  createdAt: string;
  staffName?: string;
  customerName?: string;
  lines: ReceiptLine[];
  subtotalExGst: number;
  gst: number;
  total: number;
  tenders: { method: string; amount: number; change?: number }[];
}

const WIDTH = 48;
const DIVIDER = '-'.repeat(WIDTH);
const encoder = new TextEncoder();

function bytes(...args: (readonly number[] | Uint8Array | string)[]): number[] {
  const result: number[] = [];
  for (const arg of args) {
    if (typeof arg === 'string') {
      result.push(...encoder.encode(arg));
    } else if (arg instanceof Uint8Array) {
      result.push(...arg);
    } else {
      result.push(...(arg as number[]));
    }
  }
  return result;
}

function centerText(text: string, width = WIDTH): string {
  const trimmed = text.slice(0, width);
  const pad = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return ' '.repeat(pad) + trimmed;
}

function padRow(left: string, right: string, width = WIDTH): string {
  const available = width - right.length;
  const leftTrimmed = left.slice(0, available - 1);
  return leftTrimmed.padEnd(available) + right;
}

function formatMoney(amount: number): string {
  return '$' + amount.toFixed(2);
}

function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-AU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export function buildReceiptBytes(data: ReceiptData): Uint8Array {
  const buf: number[] = [];

  function push(...cmds: (readonly number[] | string)[]) {
    for (const cmd of cmds) {
      if (typeof cmd === 'string') {
        buf.push(...encoder.encode(cmd));
      } else {
        buf.push(...(cmd as number[]));
      }
    }
  }

  function line(text = '') {
    push(text, CMD.FEED);
  }

  // Init
  push(CMD.INIT);

  // --- Header ---
  push(CMD.CENTER, CMD.BOLD_ON);
  line(data.storeName.slice(0, WIDTH));
  push(CMD.BOLD_OFF);
  line('TAX INVOICE');
  push(CMD.LEFT);
  line(centerText(`Order #${data.orderNumber}`));
  line(centerText(formatDateTime(data.createdAt)));
  if (data.staffName) {
    line(centerText(`Served by: ${data.staffName}`));
  }
  if (data.customerName) {
    line(centerText(`Customer: ${data.customerName}`));
  }
  line(DIVIDER);

  // --- Line Items ---
  for (const item of data.lines) {
    const label = `${item.qty}x ${item.name}`;
    const price = formatMoney(item.price * item.qty);
    line(padRow(label, price));

    if (item.discount && item.discount > 0) {
      const discountStr = `-${formatMoney(item.discount)}`;
      line(padRow('  Discount', discountStr));
    }

    if (item.note) {
      line(`  ${item.note}`.slice(0, WIDTH));
    }
  }

  // --- Totals ---
  line(DIVIDER);
  line(padRow('Subtotal (ex. GST)', formatMoney(data.subtotalExGst)));
  line(padRow('GST (10%)', formatMoney(data.gst)));
  push(CMD.BOLD_ON);
  line(padRow('TOTAL', formatMoney(data.total)));
  push(CMD.BOLD_OFF);

  // --- Tenders ---
  line(DIVIDER);
  let totalChange = 0;
  for (const tender of data.tenders) {
    line(padRow(tender.method, formatMoney(tender.amount)));
    if (tender.change && tender.change > 0) {
      totalChange += tender.change;
    }
  }
  if (totalChange > 0) {
    push(CMD.BOLD_ON);
    line(padRow('Change Due', formatMoney(totalChange)));
    push(CMD.BOLD_OFF);
  }

  // --- Footer ---
  line(DIVIDER);
  push(CMD.CENTER);
  line();
  line('Thank you!');
  push(CMD.LEFT);
  push(CMD.FEED, CMD.FEED, CMD.FEED);
  push(CMD.CUT);

  return new Uint8Array(buf);
}

/* ------------------------------------------------------------------ */
/* Serial Port printing (Web Serial API)                               */
/* ------------------------------------------------------------------ */

export async function printReceipt(port: SerialPort, data: ReceiptData): Promise<void> {
  try {
    const portInfo = port.getInfo();
    // Only open if not already readable (i.e. not open)
    if (!port.readable) {
      await port.open({ baudRate: 9600 });
    }
    // Suppress unused variable warning
    void portInfo;

    const receiptBytes = buildReceiptBytes(data);
    const writer = port.writable!.getWriter();
    try {
      await writer.write(receiptBytes);
    } finally {
      writer.releaseLock();
    }
  } catch (err) {
    throw new Error(`Failed to print receipt: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function openCashDrawer(port: SerialPort): Promise<void> {
  try {
    if (!port.readable) {
      await port.open({ baudRate: 9600 });
    }

    const drawerBytes = new Uint8Array(CMD.DRAWER_OPEN);
    const writer = port.writable!.getWriter();
    try {
      await writer.write(drawerBytes);
    } finally {
      writer.releaseLock();
    }
  } catch (err) {
    throw new Error(`Failed to open cash drawer: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ------------------------------------------------------------------ */
/* USB Printer support (WebUSB API)                                    */
/* ------------------------------------------------------------------ */

/** Common thermal/receipt printer USB vendor IDs */
export const USB_PRINTER_FILTERS: USBDeviceFilter[] = [
  { classCode: 0x07 },          // USB Printer class
  { vendorId: 0x04b8 },         // Epson
  { vendorId: 0x0519 },         // Star Micronics
  { vendorId: 0x1d90 },         // Citizen
  { vendorId: 0x0dd4 },         // Custom Engineering
  { vendorId: 0x1504 },         // Bixolon
  { vendorId: 0x0fe6 },         // ICS Electronics
  { vendorId: 0x0416 },         // Winbond
  { vendorId: 0x04e8 },         // Samsung (Bixolon rebrand)
  { vendorId: 0x0483 },         // STMicroelectronics (some POS printers)
];

async function sendToUsbDevice(device: USBDevice, data: Uint8Array): Promise<void> {
  if (!device.opened) {
    await device.open();
  }
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }

  const iface = device.configuration!.interfaces[0];
  if (!iface) throw new Error('No USB interface found on device');

  try {
    await device.claimInterface(iface.interfaceNumber);
  } catch {
    // Interface may already be claimed — continue
  }

  const alternate = iface.alternates[0];
  if (!alternate) throw new Error('No alternate setting found on USB interface');

  const outEndpoint = alternate.endpoints.find((e: USBEndpoint) => e.direction === 'out');
  if (!outEndpoint) {
    throw new Error('No output endpoint found on USB device. This device may not support direct USB printing.');
  }

  await device.transferOut(outEndpoint.endpointNumber, data.buffer as ArrayBuffer);
}

export async function printReceiptUsb(device: USBDevice, data: ReceiptData): Promise<void> {
  try {
    const receiptBytes = buildReceiptBytes(data);
    await sendToUsbDevice(device, receiptBytes);
  } catch (err) {
    throw new Error(`Failed to print receipt via USB: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function openCashDrawerUsb(device: USBDevice): Promise<void> {
  try {
    const drawerBytes = new Uint8Array(CMD.DRAWER_OPEN);
    await sendToUsbDevice(device, drawerBytes);
  } catch (err) {
    throw new Error(`Failed to open cash drawer via USB: ${err instanceof Error ? err.message : String(err)}`);
  }
}
