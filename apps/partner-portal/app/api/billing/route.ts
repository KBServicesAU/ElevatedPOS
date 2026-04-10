import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_URL = process.env['AUTH_SERVICE_URL'] ?? process.env['AUTH_API_URL'] ?? 'http://auth:4001';

function getToken(): string {
  const jar = cookies();
  return jar.get('partner_token')?.value ?? jar.get('elevatedpos_platform_token')?.value ?? '';
}

/**
 * GET /api/billing
 * Returns aggregated billing summary for the partner's tenant portfolio.
 */
export async function GET() {
  const token = getToken();
  try {
    const res = await fetch(`${AUTH_URL}/api/v1/platform/organisations?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ data: [], stats: { total: 0, active: 0, mrr: 0 } });

    const body = await res.json() as { data?: Array<{ id: string; plan?: string; planStatus?: string }> };
    const orgs = body.data ?? [];

    // Derive billing summary from org list
    const PLAN_MRR: Record<string, number> = { starter: 299, growth: 499, pro: 999, enterprise: 1999, custom: 0 };
    const active = orgs.filter((o) => o.planStatus === 'active' || o.planStatus === 'trialing');
    const mrr = active.reduce((sum, o) => sum + (PLAN_MRR[o.plan ?? ''] ?? 0), 0);

    return NextResponse.json({
      data: orgs,
      stats: { total: orgs.length, active: active.length, mrr },
    });
  } catch {
    return NextResponse.json({ data: [], stats: { total: 0, active: 0, mrr: 0 } });
  }
}
