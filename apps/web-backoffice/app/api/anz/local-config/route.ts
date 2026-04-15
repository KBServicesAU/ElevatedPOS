/**
 * /api/anz/local-config
 *
 * File-backed local store for ANZ terminal config.
 * Used when the payments microservice is not running (local dev / demo).
 * Stores config in .anz-local-config.json next to the web-backoffice package.
 */

import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_FILE = join(process.cwd(), '.anz-local-config.json');

function readConfig(): Record<string, unknown> {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return {};
}

function writeConfig(data: Record<string, unknown>) {
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function GET() {
  const config = readConfig();
  if (!config.terminalIp) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({ configured: true, ...config });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const current = readConfig();
    const updated = { ...current, ...body };
    writeConfig(updated);
    return NextResponse.json({ ok: true, ...updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    writeConfig({});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
