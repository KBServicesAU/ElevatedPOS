import Stripe from 'stripe';
import { type NextRequest } from 'next/server';

/**
 * POST /api/stripe/capture
 * Body: { paymentIntentId: string }
 *
 * Captures a manually-captured PaymentIntent after Terminal has processed the card.
 * For mock/simulated PaymentIntents (id starts with 'pi_sim_'), skips the Stripe call.
 */
export async function POST(req: NextRequest) {
  const { paymentIntentId } = await req.json() as { paymentIntentId: string };

  // Simulated / mock — nothing to capture
  if (paymentIntentId.startsWith('pi_sim_') || !process.env.STRIPE_SECRET_KEY) {
    return Response.json({ ok: true, mock: true });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    await stripe.paymentIntents.capture(paymentIntentId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[stripe/capture]', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
