import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const upstream = await fetch(`${AUTH_API_URL}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    let data: Record<string, unknown> = {};
    try {
      data = await upstream.json();
    } catch {
      // upstream returned non-JSON
    }

    if (!upstream.ok) {
      const errorMsg =
        (data.message as string) ||
        (data.error as string) ||
        `Auth service error ${upstream.status}`;
      return NextResponse.json({ message: errorMsg }, { status: upstream.status });
    }

    // Always return 200 to avoid email enumeration — even if the address
    // doesn't exist the auth service should do the same.
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[auth/forgot-password] error:', err);
    return NextResponse.json({ message: 'Service unavailable' }, { status: 503 });
  }
}
