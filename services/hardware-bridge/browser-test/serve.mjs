// Tiny static file server for the browser TIM test harness.
// Serves .wasm with the correct MIME type (browsers require
// application/wasm for WebAssembly.instantiateStreaming).

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8099);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css':  'text/css; charset=utf-8',
  '.ico':  'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const safePath = path.normalize(urlPath).replace(/^(\.\.[\\/])+/g, '');
    let filePath = path.join(ROOT, safePath);

    const stat = await fs.stat(filePath).catch(() => null);
    if (stat?.isDirectory()) filePath = path.join(filePath, 'test.html');

    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] ?? 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
    res.end(data);
    console.log(`200 ${req.method} ${urlPath} (${type}, ${data.length}B)`);
  } catch (err) {
    console.log(`404 ${req.method} ${req.url}: ${err.message}`);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[tim-test] Serving ${ROOT} at http://127.0.0.1:${PORT}`);
});
