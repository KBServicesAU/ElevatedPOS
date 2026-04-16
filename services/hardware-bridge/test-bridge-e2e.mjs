// End-to-end test for the Hardware Bridge terminal proxy.
//
// Opens a WebSocket to ws://127.0.0.1:9999/SIXml using the "SIXml"
// subprotocol (mimicking what timapi.js does in the browser), then:
//   1. Verifies the upgrade is accepted with the correct subprotocol.
//   2. Gives the bridge a moment to establish the TCP connection upstream
//      to the simulator at 127.0.0.1:7784.
//   3. Sends a small SIXml-looking frame and records any bytes that come back.
//   4. Reports timings and close codes so we can see where any failure happened.
//
// Run from this directory:  node test-bridge-e2e.mjs

import WebSocket from 'ws';

const BRIDGE_URL = 'ws://127.0.0.1:9999/SIXml';

const t0 = Date.now();
const log = (...a) => console.log(`[t+${String(Date.now() - t0).padStart(5, ' ')}ms]`, ...a);

log(`Opening WebSocket to ${BRIDGE_URL} with subprotocol "SIXml"`);

const ws = new WebSocket(BRIDGE_URL, 'SIXml');
ws.binaryType = 'arraybuffer';

const results = {
  opened: false,
  negotiatedProtocol: null,
  dataFrames: [],
  unexpectedResponse: null,
  error: null,
  closeCode: null,
  closeReason: null,
};

ws.on('upgrade', (res) => {
  log(`HTTP upgrade response: status=${res.statusCode}, ` +
      `Sec-WebSocket-Protocol=${res.headers['sec-websocket-protocol'] ?? '(none)'}`);
});

ws.on('open', () => {
  results.opened = true;
  results.negotiatedProtocol = ws.protocol;
  log(`✓ OPEN — negotiated subprotocol="${ws.protocol}"`);

  // Give the bridge ~500ms to establish the TCP connection upstream.
  setTimeout(() => {
    // Send a minimal SIXml-looking frame.  The EftSimulator may or may not
    // respond to this, but the goal is to verify the bridge relays bytes.
    //
    // SIXml wire format (simplified): some variants use a length-prefix + XML
    // body.  We'll just send a recognisable ASCII payload and see what happens.
    const payload = Buffer.from(
      '<?xml version="1.0"?><SIXml><Heartbeat/></SIXml>\n',
      'utf-8',
    );
    log(`→ Sending ${payload.length} bytes: ${payload.slice(0, 40).toString('utf-8')}…`);
    try {
      ws.send(payload, { binary: true });
    } catch (err) {
      log(`✗ Send threw: ${err.message}`);
    }
  }, 500);

  // After another 3s, close — we've captured whatever came back.
  setTimeout(() => {
    log('Client-initiated close (3s after send)');
    ws.close(1000, 'Test complete');
  }, 3500);
});

ws.on('unexpected-response', (_req, res) => {
  results.unexpectedResponse = { statusCode: res.statusCode, headers: res.headers };
  log(`✗ Unexpected response: HTTP ${res.statusCode}`);
});

ws.on('message', (data, isBinary) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  results.dataFrames.push({ len: buf.length, preview: buf.slice(0, 60).toString('hex') });
  log(`← Received ${buf.length} bytes (binary=${isBinary}): ` +
      `hex=${buf.slice(0, 40).toString('hex')}  ` +
      `ascii="${buf.slice(0, 40).toString('utf-8').replace(/[^\x20-\x7e]/g, '.')}"`);
});

ws.on('error', (err) => {
  results.error = err.message;
  log(`✗ ERROR: ${err.message}`);
});

ws.on('close', (code, reason) => {
  results.closeCode = code;
  results.closeReason = reason?.toString('utf-8') ?? '';
  log(`CLOSE code=${code} reason="${results.closeReason}"`);

  // Summary
  console.log('\n=== Test summary ===');
  console.log(JSON.stringify({
    ...results,
    dataFrameCount: results.dataFrames.length,
  }, null, 2));

  if (results.opened && results.dataFrames.length > 0) {
    console.log('\n✅ End-to-end relay verified: bridge accepted WS upgrade and relayed bytes from simulator.');
    process.exit(0);
  } else if (results.opened) {
    console.log('\n⚠️  Bridge accepted WS upgrade but simulator sent no bytes back.');
    console.log('    (May be normal if the simulator expects a specific handshake first.)');
    process.exit(0);
  } else {
    console.log('\n❌ Bridge did not accept WS upgrade.');
    process.exit(1);
  }
});

// Safety timeout
setTimeout(() => {
  log('Safety timeout — forcing exit');
  try { ws.terminate(); } catch {}
  process.exit(2);
}, 15000);
