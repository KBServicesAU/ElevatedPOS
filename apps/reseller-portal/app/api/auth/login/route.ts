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
    if (role !== 'reseller') {
      return NextResponse.json(
        { error: 'Access denied: reseller account required' },
        { status: 403 }
      );
    }

    const response = NextResponse.json({ ok: true, user }, { status: 200 });

    response.cookies.set('reseller_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (err) {
    console.error('[reseller-portal/auth/login] error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
