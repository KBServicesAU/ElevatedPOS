import { NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL || 'http://localhost:4001';

// v2.7.51 — proxies the storefront's "create subscription + payment intent"
// call to the auth service /billing/setup endpoint. The endpoint reads the
// per-device selection from the org row (set by /pending-selection earlier
// in the wizard) and returns a clientSecret for confirming the first
// month's charge with Stripe Payment Element.
export async function POST(request: NextRequest) {
  const token = request.headers.get('x-onboarding-token');
  if (!token) {
    return NextResponse.json({ error: 'Missing onboarding token' }, { status: 401 });
  }

  let body: unknown = {};
  try { body = await request.json(); } catch { body = {}; }

  try {
    const res = await fetch(`${AUTH_API_URL}/api/v1/billing/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { error?: string; detail?: string }).error
            ?? (data as { detail?: string }).detail
            ?? 'Could not create subscription' },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[onboard/billing-setup] error:', err);
    return NextResponse.json({ error: 'Could not reach billing service' }, { status: 502 });
  }
}
