import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_URL = process.env['AUTH_SERVICE_URL'] ?? process.env['AUTH_API_URL'] ?? 'http://auth:4001';

function getToken(): string {
  const jar = cookies();
  return jar.get('partner_token')?.value ?? jar.get('elevatedpos_platform_token')?.value ?? '';
}

/** GET /api/tenants/[id] */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = getToken();
  try {
    const res = await fetch(`${AUTH_URL}/api/v1/platform/organisations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 });
  }
}

/** PATCH /api/tenants/[id] — update plan / status */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = getToken();
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${AUTH_URL}/api/v1/platform/organisations/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 });
  }
}
