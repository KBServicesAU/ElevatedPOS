import express from 'express';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type WebSocket from 'ws';
import http from 'http';
import net from 'node:net';
import { verify } from 'jsonwebtoken';
import { printReceipt, ReceiptData } from './printers/escpos';
import { openCashDrawer } from './printers/cashDrawer';

// Extend WebSocket to carry the authenticated locationId
interface TaggedWebSocket extends WebSocket {
  locationId?: string;
}

// ─── Terminal proxy configuration ────────────────────────────────────────────
// The proxy relays WebSocket frames from the browser POS (which can't open
// ws:// from an https:// page) to the ANZ terminal on the LAN.
//
// ENV:
//   TERMINAL_PROXY_ENABLED  — "true" to enable (default: false)
//   TERMINAL_TARGET_HOST    — terminal LAN IP (e.g. 192.168.1.100)
//   TERMINAL_TARGET_PORT    — terminal SIXml port (default: 7784)
//   TERMINAL_TRANSPORT      — "ws" (default, real Castles S1F2) or "tcp"
//                             (raw-TCP SIXml — used by the EftSimulator and some
//                             older terminals without a WebSocket listener).
//   TERMINAL_PROXY_BIND     — bind address; "127.0.0.1" for local-only (default)

const TERMINAL_PROXY_ENABLED = (process.env['TERMINAL_PROXY_ENABLED'] ?? 'false') === 'true';
const TERMINAL_TARGET_HOST   = process.env['TERMINAL_TARGET_HOST'] ?? '';
const TERMINAL_TARGET_PORT   = Number(process.env['TERMINAL_TARGET_PORT']) || 7784;
const TERMINAL_TRANSPORT     = (process.env['TERMINAL_TRANSPORT'] ?? 'ws').toLowerCase() === 'tcp' ? 'tcp' : 'ws';
const TERMINAL_PROXY_BIND    = process.env['TERMINAL_PROXY_BIND'] ?? '127.0.0.1';

/** Only allow RFC1918 + loopback as terminal targets — inverse of printer SSRF check. */
function isValidTerminalTarget(host: string): boolean {
  if (!host || typeof host !== 'string') return false;
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') return true;
  if (/^10\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  return false;
}

const app = express();
app.use(express.json());

// ─── CORS — the bridge runs on localhost but must be reachable from the tenant's
// HTTPS origin (e.g. https://app.elevatedpos.com.au).  Browsers enforce CORS on
// fetch() to the bridge; the WebSocket upgrade on /SIXml uses its own check so
// this block only affects the HTTP endpoints.  Allowing `*` is safe here:
//   • /health exposes nothing sensitive (just the configured target + status)
//   • all action endpoints (/print, /cash-drawer, /display/…) require a
//     bridge token (HIGH-3) or JWT (for the proxy upgrade)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

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

// ─── Path-based WebSocket routing ────────────────────────────────────────────
// Two WebSocket servers, both in noServer mode.  The HTTP server's 'upgrade'
// event dispatches to the right one based on URL path:
//   /SIXml  → terminal proxy (relays frames to the ANZ terminal on the LAN)
//   /*      → existing event bus (scanner/peripheral forwarding)

const eventWss = new WebSocketServer({ noServer: true });
// The TIM API SDK opens ws://<host>:<port>/SIXml with the "SIXml" subprotocol.
// We must echo that subprotocol back or the SDK considers the handshake
// failed and retries (or aborts).
const proxyWss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols: Set<string>) => (protocols.has('SIXml') ? 'SIXml' : false),
});

// Keep a reference as `wss` so existing event-bus code below still works.
const wss = eventWss;

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  // The TIM API JS SDK v26-01 connects to ws://<ip>:<port>/SIXml with the
  // "SIXml" subprotocol.  Some SDK builds (or when the bridge port IS the
  // terminal port) may connect to the root path instead.  We detect:
  //   1. Exact path match `/SIXml`
  //   2. Root path `/` when the `Sec-WebSocket-Protocol` header contains "SIXml"
  //   3. Root path `/` when the proxy is enabled and no event-bus token is present
  //      (SDK never sends a ?token= param; event-bus clients always do)
  const isSIXmlPath = url.pathname === '/SIXml';
  const hasSIXmlProtocol = (request.headers['sec-websocket-protocol'] ?? '').includes('SIXml');
  const isRootWithoutToken = url.pathname === '/' && !url.searchParams.has('token');
  const shouldProxy = TERMINAL_PROXY_ENABLED &&
    (isSIXmlPath || hasSIXmlProtocol || isRootWithoutToken);

  if (shouldProxy) {
    proxyWss.handleUpgrade(request, socket, head, (ws) => {
      proxyWss.emit('connection', ws, request);
    });
  } else {
    eventWss.handleUpgrade(request, socket, head, (ws) => {
      eventWss.emit('connection', ws, request);
    });
  }
});

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
    terminalProxy: {
      enabled: TERMINAL_PROXY_ENABLED,
      target: TERMINAL_PROXY_ENABLED && TERMINAL_TARGET_HOST
        ? `${TERMINAL_TARGET_HOST}:${TERMINAL_TARGET_PORT}`
        : null,
      transport: TERMINAL_PROXY_ENABLED ? TERMINAL_TRANSPORT : null,
      namespaceRewrite: TERMINAL_PROXY_ENABLED ? TERMINAL_NAMESPACE_REWRITE : false,
      activeConnections: proxyWss.clients.size,
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

// ─── Terminal proxy WebSocket — bidirectional relay to ANZ terminal ──────────
// The TIM API JS SDK builds ws://${ip}:${port}/SIXml.  When the browser POS
// sets ip=127.0.0.1 port=9999, the SDK connects here.  We open a second
// WebSocket to the real terminal on the LAN and pipe frames both ways.

let activeProxyCount = 0;

proxyWss.on('connection', (clientWs, request) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // The TIM API SDK opens a raw WebSocket with no auth headers or query
  // params — it can't be modified.  When the bridge is bound to localhost
  // (127.0.0.1) it's already protected by the OS network stack, so JWT
  // auth is optional for proxy connections.
  //
  // If JWT_SECRET is set AND a ?token= is provided, we verify it.
  // If JWT_SECRET is set but no token → allow (SDK can't send tokens).
  // If JWT_SECRET is not set → allow (local-only mode).
  const jwtSecret = process.env['JWT_SECRET'];
  const url = new URL(request.url ?? '/', 'http://localhost');
  const token = url.searchParams.get('token');

  if (jwtSecret && token) {
    try {
      verify(token, jwtSecret);
    } catch {
      clientWs.close(1008, 'Invalid token');
      return;
    }
  }
  // When no JWT_SECRET or no token: allow — the bind address (127.0.0.1)
  // is the access-control boundary for the proxy.

  if (!TERMINAL_TARGET_HOST) {
    clientWs.close(1011, 'TERMINAL_TARGET_HOST not configured');
    return;
  }
  if (!isValidTerminalTarget(TERMINAL_TARGET_HOST)) {
    console.error(`[TerminalProxy] Rejected non-LAN target: ${TERMINAL_TARGET_HOST}`);
    clientWs.close(1011, 'Terminal target must be a LAN address');
    return;
  }

  // Rate-limit: allow max 5 concurrent proxy sessions (practical for any site)
  if (activeProxyCount >= 5) {
    clientWs.close(1013, 'Too many concurrent terminal proxy sessions');
    return;
  }
  activeProxyCount++;

  const release = (): void => {
    activeProxyCount = Math.max(0, activeProxyCount - 1);
  };

  if (TERMINAL_TRANSPORT === 'tcp') {
    relayClientToRawTcp(clientWs, release);
  } else {
    relayClientToWebSocket(clientWs, release);
  }
});

// ── Transport: WebSocket → WebSocket (real Castles S1F2 terminals) ──
function relayClientToWebSocket(clientWs: WsWebSocket, release: () => void): void {
  const targetUrl = `ws://${TERMINAL_TARGET_HOST}:${TERMINAL_TARGET_PORT}/SIXml`;
  console.log(`[TerminalProxy] [ws] Connecting to ${targetUrl} (active: ${activeProxyCount})`);

  // Echo the "SIXml" subprotocol upstream — real terminals expect it.
  const terminalWs = new WsWebSocket(targetUrl, 'SIXml');

  let clientAlive = true;
  let terminalAlive = false;

  terminalWs.on('open', () => {
    terminalAlive = true;
    console.log(`[TerminalProxy] [ws] Connected to terminal ${TERMINAL_TARGET_HOST}:${TERMINAL_TARGET_PORT}`);
  });

  clientWs.on('message', (data, isBinary) => {
    if (terminalAlive && terminalWs.readyState === WsWebSocket.OPEN) {
      terminalWs.send(data, { binary: isBinary });
    }
  });

  terminalWs.on('message', (data, isBinary) => {
    if (clientAlive && clientWs.readyState === WsWebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('close', (code) => {
    clientAlive = false;
    release();
    console.log(`[TerminalProxy] [ws] Client disconnected (code=${code}, active: ${activeProxyCount})`);
    if (terminalAlive && terminalWs.readyState !== WsWebSocket.CLOSED) {
      terminalWs.close(1000, 'Client disconnected');
    }
  });

  terminalWs.on('close', (code) => {
    terminalAlive = false;
    console.log(`[TerminalProxy] [ws] Terminal disconnected (code=${code})`);
    if (clientAlive && clientWs.readyState !== WsWebSocket.CLOSED) {
      clientWs.close(code, 'Terminal disconnected');
    }
  });

  clientWs.on('error', (err) => {
    console.error('[TerminalProxy] [ws] Client error:', err.message);
    clientAlive = false;
    release();
    if (terminalAlive && terminalWs.readyState !== WsWebSocket.CLOSED) {
      terminalWs.close(1011, 'Client error');
    }
  });

  terminalWs.on('error', (err) => {
    console.error('[TerminalProxy] [ws] Terminal error:', err.message);
    terminalAlive = false;
    if (clientAlive && clientWs.readyState !== WsWebSocket.CLOSED) {
      clientWs.close(1011, `Terminal unreachable: ${err.message}`);
    }
    release();
  });
}

// ─── SIXml namespace rewriting ───────────────────────────────────────────────
// SIX/Worldline published two URI branding variants for the same protocol:
//   • http://www.six-payment-services.com/  (legacy, pre-rebrand)
//   • http://www.worldline.com/              (current, post-rebrand)
// The newer TIM SDK (v26-01) emits the Worldline URI, but some Castles terminals
// ship with firmware that only parses the legacy SIX URI and silently drops
// messages in the other namespace. When TERMINAL_NAMESPACE_REWRITE=true we
// transparently rewrite the XML namespace attribute on every SIXml frame in
// each direction and patch the 2-byte length header to reflect the new
// payload size. Callers above/below this layer are unaffected.
const TERMINAL_NAMESPACE_REWRITE = (process.env['TERMINAL_NAMESPACE_REWRITE'] ?? 'false') === 'true';
const TERMINAL_DEBUG_BYTES = (process.env['TERMINAL_DEBUG_BYTES'] ?? 'false') === 'true';

function logBytes(direction: string, buf: Buffer): void {
  if (!TERMINAL_DEBUG_BYTES) return;
  const hex = buf.subarray(0, Math.min(buf.length, 48)).toString('hex');
  const xmlIdx = buf.indexOf('<?xml');
  const xmlPreview = xmlIdx >= 0
    ? buf.subarray(xmlIdx, Math.min(buf.length, xmlIdx + 200)).toString('utf8').replace(/\s+/g, ' ')
    : '(no xml)';
  console.log(`[TerminalProxy] [bytes][${direction}] len=${buf.length} hex=${hex}${buf.length > 48 ? '...' : ''}`);
  console.log(`[TerminalProxy] [bytes][${direction}] xml=${xmlPreview}`);
}

const NS_WORLDLINE = Buffer.from('http://www.worldline.com/');
const NS_SIX_LEGACY = Buffer.from('http://www.six-payment-services.com/');

/**
 * Wire-format of a SIXml frame (empirically derived from a live Castles S1F2):
 *   [0..4]  "SIXml" magic (5 bytes)
 *   [5]     version byte (0x02 on v1 firmware)
 *   [6..7]  payload length in bytes (big-endian) — counts everything after the length field
 *   [8..]   message payload (1-byte type flag + XML document)
 *
 * The 2-byte length field allows payloads up to 65535 bytes.
 */
const SIXML_MAGIC = Buffer.from('SIXml');
const SIXML_HEADER_SIZE = 8; // 5 magic + 1 version + 2 length

/**
 * Transform a buffered stream of SIXml frames, swapping the XML namespace URI
 * in each frame. Accepts possibly-partial input and returns { output, leftover }
 * so callers can re-feed the leftover on the next chunk.
 *
 * For simplicity we do not split individual SIXml frames across TCP packets —
 * if a partial frame arrives we stash the unread tail in `leftover`.
 */
function rewriteSixmlStream(
  input: Buffer,
  from: Buffer,
  to: Buffer,
): { output: Buffer; leftover: Buffer } {
  const outChunks: Buffer[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    // Look for the next "SIXml" magic. Everything before it is non-frame bytes
    // that we pass through unchanged (should be empty in practice).
    const magicIdx = input.indexOf(SIXML_MAGIC, cursor);
    if (magicIdx === -1) {
      // No more frames in this buffer — keep the tail as leftover.
      return { output: Buffer.concat(outChunks), leftover: input.subarray(cursor) };
    }
    if (magicIdx > cursor) {
      // Emit non-frame bytes verbatim.
      outChunks.push(input.subarray(cursor, magicIdx));
      cursor = magicIdx;
    }

    // Need at least 8 bytes for the header.
    if (input.length - cursor < SIXML_HEADER_SIZE) {
      return { output: Buffer.concat(outChunks), leftover: input.subarray(cursor) };
    }

    const payloadLen = input.readUInt16BE(cursor + 6);
    const frameEnd = cursor + SIXML_HEADER_SIZE + payloadLen;
    if (frameEnd > input.length) {
      // Incomplete frame — stash and wait for more bytes.
      return { output: Buffer.concat(outChunks), leftover: input.subarray(cursor) };
    }

    const version = input[cursor + 5];
    const payload = input.subarray(cursor + SIXML_HEADER_SIZE, frameEnd);

    // Swap the namespace URI across every occurrence (usually once per frame).
    let newPayload = payload;
    if (payload.includes(from)) {
      // Buffer.replaceAll doesn't exist — loop manually.
      const pieces: Buffer[] = [];
      let i = 0;
      while (i < payload.length) {
        const hit = payload.indexOf(from, i);
        if (hit === -1) {
          pieces.push(payload.subarray(i));
          break;
        }
        pieces.push(payload.subarray(i, hit));
        pieces.push(to);
        i = hit + from.length;
      }
      newPayload = Buffer.concat(pieces);
    }

    const newHeader = Buffer.alloc(SIXML_HEADER_SIZE);
    SIXML_MAGIC.copy(newHeader, 0);
    newHeader[5] = version ?? 0x02;
    newHeader.writeUInt16BE(newPayload.length, 6);

    outChunks.push(newHeader, newPayload);
    cursor = frameEnd;
  }

  return { output: Buffer.concat(outChunks), leftover: Buffer.alloc(0) };
}

// ── Transport: WebSocket → raw TCP (EftSimulator, TCP-only firmware) ──
// Browser's TIM SDK sends each SIXml message as a WebSocket frame whose
// payload is the raw SIXml bytes (already length-prefixed per the SIXml wire
// format).  We pipe those bytes straight into a TCP socket; the terminal's
// response bytes are wrapped back into WebSocket binary frames.  When the
// namespace rewriter is enabled we additionally swap SIX-legacy ↔ Worldline
// URIs in both directions for firmware that only speaks one dialect.
function relayClientToRawTcp(clientWs: WsWebSocket, release: () => void): void {
  const targetHost = TERMINAL_TARGET_HOST;
  const targetPort = TERMINAL_TARGET_PORT;
  console.log(`[TerminalProxy] [tcp] Connecting to ${targetHost}:${targetPort} (active: ${activeProxyCount})`);

  const sock = net.createConnection({ host: targetHost, port: targetPort });
  sock.setNoDelay(true);

  let clientAlive = true;
  let sockAlive = false;

  // Per-direction buffer for partial SIXml frames when namespace rewriting
  // is enabled. TCP does not preserve frame boundaries so we may receive
  // half a SIXml frame and need to stitch it to the next chunk.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let clientToTermLeftover: Buffer = Buffer.alloc(0) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let termToClientLeftover: Buffer = Buffer.alloc(0) as any;

  if (TERMINAL_NAMESPACE_REWRITE) {
    console.log('[TerminalProxy] [tcp] Namespace rewriting ENABLED (worldline ↔ six-legacy)');
  }

  sock.on('connect', () => {
    sockAlive = true;
    console.log(`[TerminalProxy] [tcp] Connected to terminal ${targetHost}:${targetPort}`);
  });

  clientWs.on('message', (data, _isBinary) => {
    if (!sockAlive || sock.destroyed) return;
    // ws gives us Buffer | ArrayBuffer | Buffer[] — normalise to Buffer.
    let buf = Array.isArray(data)
      ? Buffer.concat(data)
      : data instanceof ArrayBuffer
        ? Buffer.from(data)
        : (data as Buffer);

    logBytes('CLIENT->RAW', buf);
    if (TERMINAL_NAMESPACE_REWRITE) {
      // SDK speaks Worldline URI; terminal expects legacy SIX URI.
      const combined = Buffer.concat([clientToTermLeftover, buf]);
      const { output, leftover } = rewriteSixmlStream(combined, NS_WORLDLINE, NS_SIX_LEGACY);
      clientToTermLeftover = leftover;
      buf = output;
      logBytes('CLIENT->TERM (rewritten)', buf);
    }

    if (buf.length > 0) sock.write(buf);
  });

  sock.on('data', (chunk: Buffer) => {
    if (!(clientAlive && clientWs.readyState === WsWebSocket.OPEN)) return;

    logBytes('TERM->RAW', chunk);
    let out: Buffer = chunk;
    if (TERMINAL_NAMESPACE_REWRITE) {
      // Terminal speaks legacy SIX URI; SDK expects Worldline URI.
      const combined = Buffer.concat([termToClientLeftover, chunk]);
      const { output, leftover } = rewriteSixmlStream(combined, NS_SIX_LEGACY, NS_WORLDLINE);
      termToClientLeftover = leftover;
      out = output;
      logBytes('TERM->CLIENT (rewritten)', out);
    }

    if (out.length > 0) clientWs.send(out, { binary: true });
  });

  clientWs.on('close', (code) => {
    clientAlive = false;
    release();
    console.log(`[TerminalProxy] [tcp] Client disconnected (code=${code}, active: ${activeProxyCount})`);
    if (sockAlive && !sock.destroyed) sock.end();
  });

  sock.on('close', (hadError) => {
    sockAlive = false;
    console.log(`[TerminalProxy] [tcp] Terminal socket closed (hadError=${hadError})`);
    if (clientAlive && clientWs.readyState !== WsWebSocket.CLOSED) {
      clientWs.close(hadError ? 1011 : 1000, 'Terminal disconnected');
    }
  });

  clientWs.on('error', (err) => {
    console.error('[TerminalProxy] [tcp] Client error:', err.message);
    clientAlive = false;
    release();
    if (sockAlive && !sock.destroyed) sock.destroy();
  });

  sock.on('error', (err) => {
    console.error('[TerminalProxy] [tcp] Terminal socket error:', err.message);
    sockAlive = false;
    if (clientAlive && clientWs.readyState !== WsWebSocket.CLOSED) {
      clientWs.close(1011, `Terminal unreachable: ${err.message}`);
    }
    release();
  });
}

// ─── Event WebSocket — forward scanner/peripheral events to connected POS clients
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
const BIND = TERMINAL_PROXY_ENABLED ? TERMINAL_PROXY_BIND : '0.0.0.0';
server.listen(PORT, BIND, () => {
  console.log(`[HardwareBridge] Listening on http://${BIND}:${PORT}`);
  if (TERMINAL_PROXY_ENABLED) {
    console.log(
      `[HardwareBridge] Terminal proxy ENABLED (transport=${TERMINAL_TRANSPORT}) → ` +
      `${TERMINAL_TARGET_HOST}:${TERMINAL_TARGET_PORT}`,
    );
  }
});
