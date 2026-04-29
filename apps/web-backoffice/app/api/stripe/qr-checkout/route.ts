import Stripe from 'stripe';
import { type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

/**
 * POST /api/stripe/qr-checkout
 * Body: { amount: number (cents), currency?: 'aud', orderRef?: string, locationName?: string }
 * Returns: { id: 'cs_xxx', url: 'https://checkout.stripe.com/c/pay/...', expiresAt: epochSeconds }
 *
 * Creates a Stripe Checkout Session for the customer-screen QR-pay flow.
 *
 * Why Checkout Session (vs PaymentIntent + Stripe.js Elements):
 *   • Stripe-hosted page handles Google Pay / Apple Pay / Link / cards
 *     out of the box — we don't need to maintain custom HTML, do PCI
 *     scoping, or wire wallet domains.
 *   • The customer's phone follows the URL, pays, the page redirects to
 *     a static success_url. Our POS doesn't depend on that redirect —
 *     it polls /api/stripe/qr-status to detect completion.
 *   • Sessions expire after ~30 minutes server-side; we expose 15 min
 *     to the POS so the operator gets a clean "expired" state if the
 *     customer wanders off.
 *
 * Security:
 *   • Auth required (employee JWT or device token via the proxy).
 *   • orgId from the verified JWT goes into session.metadata so a
 *     /api/stripe/qr-status call can verify the caller owns the
 *     session before reporting its state.
 *   • Amount capped at $100,000 like the PaymentIntent route.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null) as {
    amount?: unknown;
    currency?: unknown;
    orderRef?: unknown;
    locationName?: unknown;
  } | null;

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0 || amount > 100_000_00) {
    return Response.json(
      { error: 'Invalid amount: must be a positive integer in cents, ≤ $100,000.' },
      { status: 422 },
    );
  }

  const currency = typeof body?.currency === 'string' && body.currency.length === 3
    ? body.currency.toLowerCase()
    : 'aud';

  const orderRef = typeof body?.orderRef === 'string' ? body.orderRef.slice(0, 100) : '';
  const locationName = typeof body?.locationName === 'string' ? body.locationName.slice(0, 100) : '';

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    // Dev/demo without Stripe — return a mock the POS can simulate.
    const mockId = `cs_sim_${Date.now()}`;
    return Response.json({
      id: mockId,
      url: `https://checkout.stripe.com/c/pay/sim/${mockId}`,
      expiresAt: Math.floor(Date.now() / 1000) + 15 * 60,
      mock: true,
    });
  }

  try {
    const stripe = new Stripe(secretKey);

    // Use the public app URL so the redirect after payment goes
    // somewhere meaningful. The POS doesn't depend on the redirect —
    // it polls /qr-status — but the customer's phone needs a tidy
    // landing page rather than a 404.
    const appUrl = process.env.APP_URL ?? 'https://app.elevatedpos.com.au';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // payment_method_types omitted → Stripe enables card + Apple Pay
      // + Google Pay + Link automatically per the merchant's account
      // settings. Adding the array would actually *narrow* what's
      // available, the opposite of what we want.
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: orderRef ? `Order ${orderRef}` : 'Sale',
              ...(locationName ? { description: locationName } : {}),
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/pay/qr/success?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pay/qr/cancel?session={CHECKOUT_SESSION_ID}`,
      // 30 min Stripe-side; we surface 15 in the POS modal so the
      // operator gets a clean expiry well before the session itself
      // dies.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      metadata: {
        orgId: String(auth.orgId ?? ''),
        createdBy: String(auth.sub),
        orderRef,
        kind: 'qr_pay_v1',
      },
      payment_intent_data: {
        metadata: {
          orgId: String(auth.orgId ?? ''),
          orderRef,
          kind: 'qr_pay_v1',
        },
      },
    });

    return Response.json({
      id: session.id,
      url: session.url,
      expiresAt: session.expires_at,
    });
  } catch (err) {
    console.error('[stripe/qr-checkout]', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
