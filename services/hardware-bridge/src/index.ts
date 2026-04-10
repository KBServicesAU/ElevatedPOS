import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import { verify } from 'jsonwebtoken';
import { printReceipt, ReceiptData } from './printers/escpos';
import { openCashDrawer } from './printers/cashDrawer';

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ─── FIX 4: SSRF validation helpers ──────────────────────────────────────────

function isValidPrinterHost(host: string): boolean {
  if (!host || typeof host !== 'string') return false;
  if (host.length > 253) return false;
  // If an explicit allowlist is configured, enforce it
  const allowedHosts = (process.env['ALLOWED_PRINTER_HOSTS'] ?? '').split(',').filter(Boolean);
  if (allowedHosts.length > 0) return allowedHosts.includes(host);
  // Without an allowlist, block known cloud metadata endpoints
  const blocked = ['metadata.google.internal', 'instance-data', '169.254.169.254'];
  return !blocked.includes(host.toLowerCase());
}

function isValidPrinterPort(port: unknown): boolean {
  const p = Number(port);
  return Number.isInteger(p) && p >= 1 && p <= 65535;
}

// GET /health — device status
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    devices: {
      printer: 'connected',
      display: 'connected',
      drawer: 'connected',
    },
  });
});

// POST /print/receipt — print a receipt (legacy stub)
app.post('/print/receipt', (req, res) => {
  const body = req.body as { orderId?: string; lines?: unknown[]; total?: number; tender?: string };
  console.log(`[HardwareBridge] Print receipt for order ${body.orderId ?? 'unknown'}`);
  res.json({ success: true, printer: 'default' });
});

// POST /print — ESC/POS receipt via TCP
app.post('/print', (req, res) => {
  const body = req.body as { printer?: { host?: string; port?: number }; receipt?: ReceiptData };

  if (!body.printer?.host || !body.printer?.port || !body.receipt) {
    res.status(400).json({ error: 'Missing printer config or receipt data' });
    return;
  }

  const { host, port } = body.printer;
  const receipt = body.receipt;

  // FIX 4: Validate host/port before opening a TCP connection (SSRF prevention)
  if (!isValidPrinterHost(host)) {
    res.status(400).json({ error: 'Invalid printer host' });
    return;
  }
  if (!isValidPrinterPort(port)) {
    res.status(400).json({ error: 'Invalid printer port' });
    return;
  }

  console.log(`[HardwareBridge] ESC/POS print to ${host}:${port}`);

  // Fire-and-forget; respond immediately so POS isn't blocked
  void printReceipt({ host, port }, receipt).catch((err: unknown) =>
    console.error('[HardwareBridge] printReceipt error:', err),
  );

  res.json({ success: true, printer: `${host}:${port}` });
});

// POST /cash-drawer — kick cash drawer via ESC/POS TCP
app.post('/cash-drawer', (req, res) => {
  const body = req.body as { printer?: { host?: string; port?: number } };

  if (!body.printer?.host || !body.printer?.port) {
    res.status(400).json({ error: 'Missing printer config' });
    return;
  }

  const { host, port } = body.printer;

  // FIX 4: Validate host/port before opening a TCP connection (SSRF prevention)
  if (!isValidPrinterHost(host)) {
    res.status(400).json({ error: 'Invalid printer host' });
    return;
  }
  if (!isValidPrinterPort(port)) {
    res.status(400).json({ error: 'Invalid printer port' });
    return;
  }

  console.log(`[HardwareBridge] Cash drawer kick to ${host}:${port}`);

  void openCashDrawer({ host, port }).catch((err: unknown) =>
    console.error('[HardwareBridge] openCashDrawer error:', err),
  );

  res.json({ success: true });
});

// POST /display/customer — update customer-facing display
app.post('/display/customer', (req, res) => {
  const body = req.body as { message?: string; total?: number };
  console.log('[HardwareBridge] Customer display update', { message: body.message, total: body.total });
  res.json({ success: true });
});

// POST /drawer/open — open the cash drawer
app.post('/drawer/open', (_req, res) => {
  console.log('[HardwareBridge] Open cash drawer');
  res.json({ success: true });
});

// WebSocket — forward scanner/peripheral events to connected POS clients
wss.on('connection', (ws, request) => {
  // FIX 5: Authenticate WebSocket upgrade via ?token=<jwt> query parameter
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    ws.close(1011, 'Server misconfiguration');
    return;
  }

  const url = new URL(request.url ?? '/', 'http://localhost');
  const token = url.searchParams.get('token');
  if (!token) {
    ws.close(1008, 'Authentication required');
    return;
  }
  try {
    verify(token, jwtSecret);
  } catch {
    ws.close(1008, 'Invalid token');
    return;
  }

  console.log('[HardwareBridge] POS client connected');

  ws.on('message', (data) => {
    // FIX 6: Wrap JSON.parse in try/catch to avoid crashing on malformed input
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    const msg = parsed as { type?: unknown; payload?: unknown };
    console.log('[HardwareBridge] Message from POS client', msg.type);
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(JSON.stringify(msg));
      }
    });
  });
  ws.on('close', () => console.log('[HardwareBridge] POS client disconnected'));
});

const PORT = Number(process.env['PORT'] ?? 9999);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[HardwareBridge] Listening on http://0.0.0.0:${PORT}`);
});
