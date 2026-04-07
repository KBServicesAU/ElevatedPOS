import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email: string; password: string };

    const upstream = await fetch(`${AUTH_API_URL}/api/v1/platform/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    let data: Record<string, unknown> = {};
    try {
      data = await upstream.json() as Record<string, unknown>;
    } catch {
      // upstream returned non-JSON
    }

    if (!upstream.ok) {
      const errorMsg =
        (data['message'] as string) ||
        (data['error'] as string) ||
        `Auth service error ${upstream.status}`;
      return NextResponse.json({ error: errorMsg }, { status: upstream.status });
    }

    const { accessToken, user } = data as {
      accessToken: string;
      user: { role: string; name: string; email: string; id: string };
    };

    const role = (user?.role as string) ?? '';
    if (role !== 'sales_agent' && role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Not authorized for this portal' },
        { status: 403 },
      );
    }

    const response = NextResponse.json({ ok: true, user }, { status: 200 });

    // HttpOnly token — not readable by JS, protects the bearer token
    response.cookies.set('sales_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });

    // Client-readable cookie carrying display name + email for the UI.
    // Does NOT contain the bearer token — safe to be non-httpOnly.
    const userInfo = JSON.stringify({
      name: user?.name ?? '',
      email: user?.email ?? '',
      role: user?.role ?? '',
    });
    response.cookies.set('sales_user', userInfo, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (err) {
    console.error('[sales-portal/auth/login] error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
