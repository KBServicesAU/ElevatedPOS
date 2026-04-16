// Verify the "ws" upstream transport works too.
//
// Starts a tiny WebSocket server on 127.0.0.1:17784 that pretends to be a
// Castles S1F2 speaking WebSocket SIXml, confirms the bridge (which needs to
// be restarted with TERMINAL_TRANSPORT=ws TERMINAL_TARGET_PORT=17784) relays
// frames both ways.

import { WebSocketServer } from 'ws';
import WebSocket from 'ws';

const MOCK_PORT = 17784;

// ── Mock terminal ─────────────────────────────────────────────────────────
const mockWss = new WebSocketServer({ port: MOCK_PORT, path: '/SIXml', handleProtocols: (p) => p.has('SIXml') ? 'SIXml' : false });
console.log(`[mock] Mock Castles terminal listening on ws://127.0.0.1:${MOCK_PORT}/SIXml`);

mockWss.on('connection', (ws, req) => {
  console.log(`[mock] Client connected, subprotocol="${ws.protocol}"`);
  // Send a greeting back
  ws.send(Buffer.from('MOCK_TERMINAL_HELLO', 'utf-8'), { binary: true });
  ws.on('message', (data, isBinary) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    console.log(`[mock] ← ${buf.length}B from client: ${buf.toString('utf-8')}`);
    // Echo with a prefix
    ws.send(Buffer.concat([Buffer.from('ACK:'), buf]), { binary: true });
  });
  ws.on('close', () => console.log('[mock] Client closed'));
});

// ── Client through bridge ─────────────────────────────────────────────────
// Give mock 100ms to bind
await new Promise((r) => setTimeout(r, 200));

const BRIDGE_URL = 'ws://127.0.0.1:9999/SIXml';
console.log(`\n[client] Opening WebSocket to bridge: ${BRIDGE_URL}`);

const ws = new WebSocket(BRIDGE_URL, 'SIXml');
ws.binaryType = 'arraybuffer';

const received = [];
let opened = false;

ws.on('open', () => {
  opened = true;
  console.log(`[client] ✓ OPEN (subprotocol="${ws.protocol}")`);
  setTimeout(() => {
    console.log('[client] → Sending "PING from client"');
    ws.send(Buffer.from('PING from client', 'utf-8'), { binary: true });
  }, 300);
  setTimeout(() => {
    console.log('[client] Closing');
    ws.close(1000, 'done');
  }, 1500);
});

ws.on('message', (data, isBinary) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  received.push(buf.toString('utf-8'));
  console.log(`[client] ← ${buf.length}B: ${buf.toString('utf-8')}`);
});

ws.on('error', (err) => console.log(`[client] ERROR: ${err.message}`));
ws.on('close', (code) => {
  console.log(`[client] CLOSE code=${code}`);
  setTimeout(() => {
    console.log('\n=== Summary ===');
    console.log('opened:', opened);
    console.log('received:', received);
    if (opened && received.some(s => s.includes('HELLO')) && received.some(s => s.includes('ACK:'))) {
      console.log('✅ WS upstream relay verified (HELLO + ACK both flowed through bridge)');
      process.exit(0);
    } else {
      console.log('❌ Missing expected frames');
      process.exit(1);
    }
  }, 200);
});

setTimeout(() => {
  console.log('safety timeout');
  process.exit(2);
}, 10000);
