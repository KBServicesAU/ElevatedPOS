import net from 'net';

export interface ReceiptData {
  header: string;
  lines: Array<{ label: string; amount: string }>;
  total: string;
  footer: string;
  qrCodeUrl?: string;
}

// ESC/POS command constants
const ESC_INIT       = '\x1B\x40';        // Initialize printer
const ALIGN_CENTER   = '\x1B\x61\x01';    // Align center
const ALIGN_LEFT     = '\x1B\x61\x00';    // Align left
const BOLD_ON        = '\x1B\x45\x01';    // Bold on
const BOLD_OFF       = '\x1B\x45\x00';    // Bold off
const CUT_PAPER      = '\x1D\x56\x42\x00'; // Full cut
const LF             = '\n';

function padLine(label: string, amount: string, width = 42): string {
  const available = width - amount.length;
  return label.substring(0, available).padEnd(available) + amount;
}

function buildReceiptBuffer(receipt: ReceiptData): Buffer {
  const parts: string[] = [];

  // Init
  parts.push(ESC_INIT);

  // Header (centered, bold)
  parts.push(ALIGN_CENTER);
  parts.push(BOLD_ON);
  parts.push(receipt.header + LF);
  parts.push(BOLD_OFF);
  parts.push(LF);

  // Line items (left aligned)
  parts.push(ALIGN_LEFT);
  parts.push('----------------------------------------' + LF);
  for (const line of receipt.lines) {
    parts.push(padLine(line.label, line.amount) + LF);
  }
  parts.push('----------------------------------------' + LF);

  // Total (bold)
  parts.push(BOLD_ON);
  parts.push(padLine('TOTAL', receipt.total) + LF);
  parts.push(BOLD_OFF);
  parts.push(LF);

  // Footer (centered)
  parts.push(ALIGN_CENTER);
  parts.push(receipt.footer + LF);
  parts.push(LF);

  // QR code placeholder (text only — full QR requires store image commands)
  if (receipt.qrCodeUrl) {
    parts.push(receipt.qrCodeUrl + LF);
    parts.push(LF);
  }

  // Cut paper
  parts.push(CUT_PAPER);

  return Buffer.from(parts.join(''), 'latin1');
}

export function printReceipt(
  config: { host: string; port: number },
  receipt: ReceiptData,
): Promise<void> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    function settle() {
      if (!settled) {
        settled = true;
        resolve();
      }
    }

    socket.on('error', (err) => {
      console.error('[HardwareBridge][Printer] TCP error:', err.message);
      settle();
    });

    socket.connect(config.port, config.host, () => {
      try {
        const data = buildReceiptBuffer(receipt);
        socket.write(data);
        // Allow printer time to receive the full payload before closing
        setTimeout(() => {
          socket.destroy();
          settle();
        }, 500);
      } catch (err) {
        console.error('[HardwareBridge][Printer] Build error:', err);
        socket.destroy();
        settle();
      }
    });

    socket.on('close', () => settle());
  });
}
