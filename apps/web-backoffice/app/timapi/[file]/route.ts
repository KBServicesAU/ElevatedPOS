/**
 * /timapi/[file] — ANZ TIM API SDK static file server
 *
 * Serves timapi.js and timapi.wasm from the filesystem.
 * This route handler is a guaranteed fallback for when Next.js static file
 * serving from public/timapi/ is intercepted by middleware or other routing.
 *
 * Files are read from process.cwd()/apps/web-backoffice/public/timapi/
 * which is where the Dockerfile copies them in standalone mode.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

const ALLOWED_FILES: Record<string, string> = {
  'timapi.js':   'application/javascript; charset=utf-8',
  'timapi.wasm': 'application/wasm',
};

// In Next.js standalone, cwd is the root of the standalone bundle (/app).
// The Dockerfile copies public/ to apps/web-backoffice/public/.
// Try both the monorepo path (standalone) and local public/ path (dev).
function resolveTimapiFile(filename: string): string | null {
  const candidates = [
    join(process.cwd(), 'apps', 'web-backoffice', 'public', 'timapi', filename),
    join(process.cwd(), 'public', 'timapi', filename),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const contentType = ALLOWED_FILES[file];

  if (!contentType) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = resolveTimapiFile(file);
  if (!filePath) {
    console.error(`[timapi] SDK file not found: ${file} — cwd=${process.cwd()}`);
    return NextResponse.json(
      { error: `ANZ TIM API SDK file '${file}' not found on server. Place timapi.js + timapi.wasm in public/timapi/.` },
      { status: 404 },
    );
  }

  try {
    const content = readFileSync(filePath);
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Length': String(content.length),
      },
    });
  } catch (err) {
    console.error(`[timapi] Failed to read ${file}:`, err);
    return NextResponse.json({ error: 'Failed to read SDK file' }, { status: 500 });
  }
}
