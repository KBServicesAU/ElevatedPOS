import { NextRequest, NextResponse } from 'next/server';

// Raw body needed for Stripe signature verification — disable body parsing
export const dynamic = 'force-dynamic';

const INTEGRATIONS_API_URL =
  process.env['INTEGRATIONS_API_URL'] ?? 'http://localhost:4010';

/**
 * Stripe platform webhook receiver.
 * Receives events from Stripe and forwards them (with the raw body + signature)
 * to the integrations service, which performs signature verification.
 *
 * Register this URL in the Stripe dashboard:
 *   https://app.elevatedpos.com.au/api/stripe/webhook
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const stripeSignature = request.headers.get('stripe-signature');

  if (!stripeSignature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  try {
    const response = await fetch(`${INTEGRATIONS_API_URL}/api/v1/stripe/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': stripeSignature,
      },
      body: rawBody,
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error('[stripe/webhook] forward failed', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
