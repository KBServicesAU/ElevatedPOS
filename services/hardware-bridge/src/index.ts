import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import { printReceipt, ReceiptData } from './printers/escpos';
import { openCashDrawer } from './printers/cashDrawer';

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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
wss.on('connection', (ws) => {
  console.log('[HardwareBridge] POS client connected');
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString()) as { type: string; payload: unknown };
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
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[HardwareBridge] Listening on http://127.0.0.1:${PORT}`);
});
