import express from 'express';
import { WebSocketServer } from 'ws';
import type WebSocket from 'ws';
import http from 'http';
import { verify } from 'jsonwebtoken';
import { printReceipt, ReceiptData } from './printers/escpos';
import { openCashDrawer } from './printers/cashDrawer';

// Extend WebSocket to carry the authenticated locationId
interface TaggedWebSocket extends WebSocket {
  locationId?: string;
}

const app = express();
app.use(express.json());

// ─── HIGH-3: Pre-shared token authentication ──────────────────────────────────

const BRIDGE_TOKEN = process.env['BRIDGE_TOKEN'];

function requireBridgeToken(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!BRIDGE_TOKEN) {
    // Not configured — allow in dev/local mode
    next();
    return;
  }
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token !== BRIDGE_TOKEN) {
    res.status(401).json({ type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'Invalid bridge token.' });
    return;
  }
  next();
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ─── FIX 4: SSRF validation helpers ──────────────────────────────────────────

function isValidPrinterHost(host: string): boolean {
  if (!host || typeof host !== 'string') return false;
  if (host.length > 253) return false;
  // If an explicit allowlist is configured, enforce it
  const allowedHosts = (process.env['ALLOWED_PRINTER_HOSTS'] ?? '').split(',').filter(Boolean);
  if (allowedHosts.length > 0) return allowedHosts.includes(host);
  // Without an allowlist, block known cloud metadata endpoints and loopback addresses
  // LOW-9: also block localhost / 127.0.0.1 / ::1 / 0.0.0.0 to prevent SSRF via loopback
  const blocked = [
    'metadata.google.internal', '169.254.169.254', 'instance-data',
    'localhost', '127.0.0.1', '::1', '0.0.0.0',
  ];
  const lower = host.toLowerCase().trim();
  if (blocked.includes(lower)) return false;
  // Block RFC1918 ranges
  if (/^10\./.test(lower)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(lower)) return false;
  if (/^192\.168\./.test(lower)) return false;
  return true;
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
app.post('/print', requireBridgeToken, (req, res) => {
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
app.post('/cash-drawer', requireBridgeToken, (req, res) => {
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
app.post('/display/customer', requireBridgeToken, (req, res) => {
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

  const taggedWs = ws as TaggedWebSocket;
  try {
    const decoded = verify(token, jwtSecret) as { locationId?: string };
    taggedWs.locationId = decoded.locationId;
  } catch {
    ws.close(1008, 'Invalid token');
    return;
  }

  console.log('[HardwareBridge] POS client connected', { locationId: taggedWs.locationId });

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
    // MED-9: Only broadcast to clients sharing the same locationId
    wss.clients.forEach((client) => {
      const taggedClient = client as TaggedWebSocket;
      if (
        taggedClient !== ws &&
        taggedClient.readyState === 1 &&
        taggedClient.locationId === taggedWs.locationId
      ) {
        taggedClient.send(JSON.stringify(msg));
      }
    });
  });
  ws.on('close', () => console.log('[HardwareBridge] POS client disconnected'));
});

const PORT = Number(process.env['PORT'] ?? 9999);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[HardwareBridge] Listening on http://0.0.0.0:${PORT}`);
});
