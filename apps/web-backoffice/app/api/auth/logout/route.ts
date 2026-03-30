import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const token = cookieStore.get('nexus_token')?.value;

  // Tell the auth service to blacklist the token (best-effort)
  if (token) {
    try {
      await fetch(`${AUTH_API_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
    } catch {
      // ignore upstream errors on logout
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete('nexus_token');
  response.cookies.delete('nexus_refresh_token');
  return response;
}
