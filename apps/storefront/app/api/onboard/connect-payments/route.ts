import { NextRequest, NextResponse } from 'next/server';

const INTEGRATIONS_API_URL = process.env.INTEGRATIONS_API_URL || 'http://localhost:4010';

// v2.7.51 — fixed Stripe Connect onboarding flow.
//
// Previously this route silently fell back to redirecting to the next step
// (subscription page) whenever the integrations service was unreachable or
// returned an error. The merchant saw "Payment account connected
// successfully!" without any Stripe redirect ever happening — because no
// JWT was being forwarded to the protected integrations endpoint, so it
// always 401'd, and the catch-all just redirected forwards.
//
// Now we:
//   1. Require the onboarding token (passed via x-onboarding-token header)
//   2. Forward it as Bearer auth to integrations
//   3. Surface real errors to the user instead of pretending it succeeded
//   4. Only return a success URL if Stripe actually issued an onboarding link
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

  const token = request.headers.get('x-onboarding-token');
  if (!token) {
    return NextResponse.json(
      { error: 'Missing onboarding token. Please restart signup.' },
      { status: 401 },
    );
  }

  try {
    const res = await fetch(
      `${INTEGRATIONS_API_URL}/api/v1/connect/platform-account`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ returnUrl, refreshUrl }),
      },
    );

    const data = await res.json().catch(() => ({})) as {
      url?: string;
      accountLinkUrl?: string;
      error?: string;
      detail?: string;
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? data.detail ?? `Stripe Connect setup failed (${res.status}).` },
        { status: res.status },
      );
    }

    const url = data.url ?? data.accountLinkUrl;
    if (!url) {
      return NextResponse.json(
        { error: 'Stripe did not return an onboarding URL. Please try again.' },
        { status: 502 },
      );
    }
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[onboard/connect-payments] error:', err);
    return NextResponse.json(
      { error: 'Could not reach payments service. Please try again.' },
      { status: 502 },
    );
  }
}
