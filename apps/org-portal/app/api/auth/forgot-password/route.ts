import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email: string };

    const upstream = await fetch(`${AUTH_API_URL}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: body.email }),
      cache: 'no-store',
    });

    let data: Record<string, unknown> = {};
    try {
      data = await upstream.json() as Record<string, unknown>;
    } catch {
      // upstream returned non-JSON — treat as success if 2xx
    }

    if (!upstream.ok) {
      const errorMsg =
        (data['message'] as string) ||
        (data['error'] as string) ||
        `Auth service error ${upstream.status}`;
      return NextResponse.json({ error: errorMsg }, { status: upstream.status });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[org-portal/auth/forgot-password] error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
