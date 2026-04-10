import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_URL = process.env['AUTH_SERVICE_URL'] ?? process.env['AUTH_API_URL'] ?? 'http://auth:4001';

function getToken(): string {
  const jar = cookies();
  return jar.get('partner_token')?.value ?? jar.get('elevatedpos_platform_token')?.value ?? '';
}

/**
 * GET /api/tenants/[id]/activity
 * Returns audit log activity for a given organisation.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = getToken();
  try {
    const res = await fetch(`${AUTH_URL}/api/v1/platform/organisations/${id}/audit-log?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.ok) {
      const body = await res.json();
      return NextResponse.json(body, { status: res.status });
    }
    // Fall back to empty activity if endpoint not available
    return NextResponse.json({ data: [] });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
