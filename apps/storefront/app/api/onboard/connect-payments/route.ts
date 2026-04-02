import { NextRequest, NextResponse } from 'next/server';

const INTEGRATIONS_API_URL = process.env.INTEGRATIONS_API_URL || 'http://localhost:4003';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');

  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${INTEGRATIONS_API_URL}/api/v1/connect/platform-account?orgId=${encodeURIComponent(orgId)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!res.ok) {
      // Integrations service not available yet — return mock redirect
      const fallbackUrl = `/onboard/subscription?orgId=${encodeURIComponent(orgId)}`;
      return NextResponse.json({ url: fallbackUrl });
    }

    const data = await res.json();
    return NextResponse.json({ url: data.url || data.accountLinkUrl });
  } catch {
    // Service unavailable — fall back gracefully to next step
    const fallbackUrl = `/onboard/subscription?orgId=${encodeURIComponent(orgId)}`;
    return NextResponse.json({ url: fallbackUrl });
  }
}
