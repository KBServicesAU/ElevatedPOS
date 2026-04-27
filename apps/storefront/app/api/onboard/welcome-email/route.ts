import { NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL = process.env.AUTH_API_URL || 'http://localhost:4001';

// v2.7.51 — fires the merchant welcome email after subscription payment.
// Backed by /api/v1/billing/welcome-email which is idempotent (only sends once).
export async function POST(request: NextRequest) {
  const token = request.headers.get('x-onboarding-token');
  if (!token) {
    return NextResponse.json({ error: 'Missing onboarding token' }, { status: 401 });
  }
  try {
    const res = await fetch(`${AUTH_API_URL}/api/v1/billing/welcome-email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[onboard/welcome-email] error:', err);
    return NextResponse.json({ error: 'Could not reach billing service' }, { status: 502 });
  }
}
