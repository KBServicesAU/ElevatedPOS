import { NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL || 'http://localhost:4001';

// v2.7.51 — returns the per-device billing summary (pos/kds/kiosk/display
// counts + monthly total in cents). Reads from the auth service /billing/preview
// endpoint which falls back to pendingDeviceSelection if no subscription exists.
export async function GET(request: NextRequest) {
  const token = request.headers.get('x-onboarding-token');
  if (!token) {
    return NextResponse.json({ error: 'Missing onboarding token' }, { status: 401 });
  }
  try {
    const res = await fetch(`${AUTH_API_URL}/api/v1/billing/preview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { error?: string }).error ?? 'Could not load billing summary' },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[onboard/billing-summary] error:', err);
    return NextResponse.json({ error: 'Could not reach billing service' }, { status: 502 });
  }
}
