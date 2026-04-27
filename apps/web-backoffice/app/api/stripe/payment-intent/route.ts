import Stripe from 'stripe';
import { type NextRequest } from 'next/server';

/**
 * POST /api/stripe/payment-intent
 * Body: { amount: number (cents), currency?: string, orderId?: string }
 * Returns: { clientSecret, id, mock? }
 *
 * Uses payment_method_types: ['card_present'] for Terminal (tap/insert/swipe).
 * capture_method: 'manual' so we capture after Terminal processes the card.
 */
export async function POST(req: NextRequest) {
  const { amount, currency = 'aud', orderId = '' } = await req.json() as {
    amount: number;
    currency?: string;
    orderId?: string;
  };

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
      metadata: { orderId },
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
