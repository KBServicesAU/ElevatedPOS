/**
 * GET /api/alerts — stub endpoint returning empty alert list.
 * Alerts are a planned feature; this stub prevents 404 errors in the UI
 * until the notifications service implements a dedicated alerts endpoint.
 *
 * POST /api/alerts/mark-all-read — no-op stub.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ data: [], meta: { totalCount: 0, unreadCount: 0 } });
}

export async function POST(_request: NextRequest) {
  return NextResponse.json({ ok: true });
}
