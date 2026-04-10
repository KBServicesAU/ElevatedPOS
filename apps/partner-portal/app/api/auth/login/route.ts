import { type NextRequest, NextResponse } from 'next/server';

const AUTH_URL = process.env['AUTH_SERVICE_URL'] ?? process.env['AUTH_API_URL'] ?? 'http://auth:4001';

/**
 * POST /api/auth/login
 * Authenticates via the platform login endpoint and sets a session cookie.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const res = await fetch(`${AUTH_URL}/api/v1/platform/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body['email'], password: body['password'] }),
    });

    const data = await res.json() as { token?: string; error?: string; message?: string };
    if (!res.ok || !data.token) {
      return NextResponse.json(
        { error: data.error ?? data.message ?? 'Invalid credentials' },
        { status: res.status },
      );
    }

    const response = NextResponse.json({ success: true });
    const maxAge = 60 * 60 * 8; // 8 hours
    response.cookies.set('partner_token', data.token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/',
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 });
  }
}
