import Stripe from 'stripe';
import { type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

/**
 * POST /api/stripe/payment-intent
 * Body: { amount: number (cents), currency?: string, orderId?: string }
 * Returns: { clientSecret, id, mock? }
 *
 * Uses payment_method_types: ['card_present'] for Terminal (tap/insert/swipe).
 * capture_method: 'manual' so we capture after Terminal processes the card.
 *
 * v2.7.68 — was previously unauthenticated, allowing any caller on the
 * public internet to mint real Stripe PaymentIntents against the platform
 * STRIPE_SECRET_KEY. Now requires a verified JWT (mobile devices via
 * Authorization header, web sessions via cookie) before doing anything
 * with the Stripe SDK.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { amount, currency = 'aud', orderId = '' } = await req.json() as {
    amount: number;
    currency?: string;
    orderId?: string;
  };

  // Defensive — caller-supplied amount must be a positive integer (cents).
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_00) {
    return Response.json(
      { error: 'Invalid amount: must be a positive integer in cents, ≤ $100,000.' },
      { status: 422 },
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    // No Stripe key — return a mock PaymentIntent for simulated flow
    const mockId = `pi_sim_${Date.now()}`;
    return Response.json({
      id: mockId,
      clientSecret: `${mockId}_secret_sim`,
      mock: true,
    });
  }

  try {
    const stripe = new Stripe(secretKey);
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_types: ['card_present'],
      capture_method: 'manual',
      // Tag the PI with the merchant org so dashboard filtering / refunds
      // can be scoped without trusting the client. orgId comes from the
      // verified JWT, NOT from the request body.
      metadata: { orderId, orgId: String(auth.orgId ?? ''), createdBy: String(auth.sub) },
    });

    return Response.json({
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      mock: false,
    });
  } catch (err) {
    console.error('[stripe/payment-intent]', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
