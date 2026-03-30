import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function POST(_request: NextRequest) {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get('nexus_refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${AUTH_API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    let data: Record<string, unknown> = {};
    try {
      data = await upstream.json();
    } catch {
      // upstream returned non-JSON
    }

    if (!upstream.ok) {
      // Refresh failed — clear both cookies so middleware redirects to login
      const response = NextResponse.json({ error: 'Session expired' }, { status: 401 });
      response.cookies.delete('nexus_token');
      response.cookies.delete('nexus_refresh_token');
      return response;
    }

    const { accessToken } = data as { accessToken: string };

    const response = NextResponse.json({ ok: true });
    response.cookies.set('nexus_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });

    return response;
  } catch (err) {
    console.error('[auth/refresh] error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
