import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_URL = process.env['AUTH_SERVICE_URL'] ?? process.env['AUTH_API_URL'] ?? 'http://auth:4001';

function getToken(): string {
  const jar = cookies();
  return jar.get('partner_token')?.value ?? jar.get('elevatedpos_platform_token')?.value ?? '';
}

/**
 * GET /api/tenants
 * Proxy to platform organisations list.
 */
export async function GET(req: NextRequest) {
  const token = getToken();
  const { searchParams } = req.nextUrl;
  const qs = searchParams.toString();

  try {
    const res = await fetch(`${AUTH_URL}/api/v1/platform/organisations${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 });
  }
}
