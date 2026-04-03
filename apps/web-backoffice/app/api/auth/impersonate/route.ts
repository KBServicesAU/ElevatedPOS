import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * POST /api/auth/impersonate
 * Accepts a platform-issued impersonation access token and sets it as the
 * session cookie so support staff can browse as the merchant.
 * The token is short-lived (30 min) and carries `impersonatedBy` in its payload.
 */
export async function POST(request: NextRequest) {
  const { token } = (await request.json()) as { token?: string };

  if (!token || typeof token !== 'string' || token.length < 20) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const cookieStore = cookies();
  cookieStore.set('elevatedpos_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // 30 min — matches the token TTL issued by the auth service
    maxAge: 30 * 60,
  });

  return NextResponse.json({ ok: true });
}
