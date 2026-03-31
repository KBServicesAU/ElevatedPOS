import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const upstream = await fetch(`${AUTH_API_URL}/api/v1/auth/pin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data.message ?? data.error ?? 'Invalid PIN' },
        { status: upstream.status },
      );
    }

    const { accessToken, refreshToken, user } = data as {
      accessToken: string;
      refreshToken?: string;
      user: Record<string, unknown>;
    };

    const response = NextResponse.json({ user }, { status: 200 });

    response.cookies.set('elevatedpos_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });

    if (refreshToken) {
      response.cookies.set('elevatedpos_refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return response;
  } catch (err) {
    console.error('[auth/pin-login] error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
