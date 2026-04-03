import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function GET() {
  const cookieStore = cookies();
  const token = cookieStore.get('elevatedpos_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${AUTH_API_URL}/api/v1/employees/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const data = await upstream.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[auth/me] error:', err);

    // Fallback: decode the JWT payload without verification to at least get name
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'),
      );
      return NextResponse.json({
        id: payload.sub,
        firstName: payload.firstName ?? payload.given_name ?? 'User',
        lastName: payload.lastName ?? payload.family_name ?? '',
        email: payload.email ?? '',
        role: payload.role ?? null,
        orgId: payload.orgId ?? '',
      });
    } catch {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }
  }
}
