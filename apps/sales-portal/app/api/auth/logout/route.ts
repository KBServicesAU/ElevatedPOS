import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };

  response.cookies.set('sales_token', '', cookieOpts);
  response.cookies.set('sales_user', '', { ...cookieOpts, httpOnly: false });

  return response;
}
