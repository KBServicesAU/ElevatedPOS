import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward to auth microservice
    const upstream = await fetch(`${AUTH_API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    let data: Record<string, unknown> = {};
    try {
      data = await upstream.json();
    } catch {
      // upstream returned non-JSON (e.g. plain text error)
    }

    if (!upstream.ok) {
      // Use || so empty strings fall through to the next fallback
      const errorMsg =
        (data.message as string) ||
        (data.error as string) ||
        (data.detail as string) ||
        (data.title as string) ||
        `Auth service error ${upstream.status}`;
      console.error('[auth/login] upstream error:', upstream.status, data);
      return NextResponse.json({ error: errorMsg }, { status: upstream.status });
    }

    const { accessToken, refreshToken, user } = data as {
      accessToken: string;
      refreshToken?: string;
      user: Record<string, unknown>;
    };

    // Build response and set httpOnly cookies
    const response = NextResponse.json({ user }, { status: 200 });

    response.cookies.set('elevatedpos_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });

    if (refreshToken) {
      response.cookies.set('elevatedpos_refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    return response;
  } catch (err) {
    console.error('[auth/login] error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
