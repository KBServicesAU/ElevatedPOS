import { NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env['AUTH_API_URL'] ?? 'http://localhost:4001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email: string; password: string };

    const upstream = await fetch(`${AUTH_API_URL}/api/v1/platform/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await upstream.json() as { token?: string; error?: string; title?: string };

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data.title ?? data.error ?? 'Authentication failed' },
        { status: upstream.status },
      );
    }

    const token = data.token ?? '';

    const response = NextResponse.json({ ok: true });
    response.cookies.set('godmode_token', token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });

    return response;
  } catch (err) {
    console.error('Godmode login error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
