import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { token } = (await req.json()) as { token: string };

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  // Test the EPOS Now token
  const res = await fetch('https://api.eposnow.com/api/product', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('easy_move_token_eposnow', token, {
    httpOnly: true,
    secure: true,
    maxAge: 3600,
    path: '/',
  });
  return response;
}
