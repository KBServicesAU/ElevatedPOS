import { NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL || 'http://localhost:4001';

// v2.7.51 — proxies the storefront's per-device selection (locations × devices)
// to the auth service /billing/pending-selection endpoint. The onboarding token
// from /api/onboard/register is passed through as the Bearer auth header.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const token = request.headers.get('x-onboarding-token');
  if (!token) {
    return NextResponse.json(
      { error: 'Missing onboarding token. Please restart signup.' },
      { status: 401 },
    );
  }

  try {
    const res = await fetch(`${AUTH_API_URL}/api/v1/billing/pending-selection`, {
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
        { error: (data as { error?: string }).error ?? 'Failed to save device selection' },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[onboard/device-pricing] error:', err);
    return NextResponse.json(
      { error: 'Could not reach billing service' },
      { status: 502 },
    );
  }
}
