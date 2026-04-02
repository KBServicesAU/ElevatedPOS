import { NextRequest, NextResponse } from 'next/server';

const INTEGRATIONS_API_URL = process.env.INTEGRATIONS_API_URL || 'http://localhost:4010';

export async function POST(request: NextRequest) {
  let body: { orgId?: string; returnUrl?: string; refreshUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { orgId, returnUrl, refreshUrl } = body;

  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${INTEGRATIONS_API_URL}/api/v1/connect/platform-account`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, returnUrl, refreshUrl }),
      },
    );

    if (!res.ok) {
      // Integrations service not available — fall back gracefully
      const fallbackUrl = returnUrl ?? `/onboard/subscription?orgId=${encodeURIComponent(orgId)}`;
      return NextResponse.json({ url: fallbackUrl });
    }

    const data = await res.json() as { url?: string; accountLinkUrl?: string };
    return NextResponse.json({ url: data.url ?? data.accountLinkUrl });
  } catch {
    // Service unavailable — fall back gracefully to next step
    const fallbackUrl = returnUrl ?? `/onboard/subscription?orgId=${encodeURIComponent(orgId)}`;
    return NextResponse.json({ url: fallbackUrl });
  }
}
