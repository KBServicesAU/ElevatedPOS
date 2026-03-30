import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password } = body as { token?: string; password?: string };

    if (!token || !password) {
      return NextResponse.json({ message: 'Token and password are required.' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const upstream = await fetch(`${AUTH_API_URL}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token, password }),
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
        'Reset link is invalid or has expired. Please request a new one.';
      return NextResponse.json({ message: errorMsg }, { status: upstream.status });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[auth/reset-password] error:', err);
    return NextResponse.json({ message: 'Service unavailable' }, { status: 503 });
  }
}
