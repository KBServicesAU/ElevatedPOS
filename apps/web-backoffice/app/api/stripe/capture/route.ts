import Stripe from 'stripe';
import { type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

/**
 * POST /api/stripe/capture
 * Body: { paymentIntentId: string }
 *
 * Captures a manually-captured PaymentIntent after Terminal has processed the card.
 * For mock/simulated PaymentIntents (id starts with 'pi_sim_'), skips the Stripe call.
 *
 * v2.7.68 — auth required. Was previously unauthenticated; combined with
 * the unauthed payment-intent endpoint that meant any internet caller
 * could capture (or refuse to capture) any PI in the platform account.
 * After v2.7.68, payment-intent stamps `orgId` into metadata so a future
 * pass can extend this handler to enforce org-match (only the issuing
 * org can capture its own PI). For now any verified JWT proceeds — same
 * blast radius as before, just gated to logged-in employees / paired
 * devices instead of the open internet.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { paymentIntentId } = await req.json() as { paymentIntentId: string };

  if (typeof paymentIntentId !== 'string' || !paymentIntentId) {
    return Response.json(
      { error: 'paymentIntentId is required.' },
      { status: 422 },
    );
  }

  // Simulated / mock — nothing to capture
  if (paymentIntentId.startsWith('pi_sim_') || !process.env.STRIPE_SECRET_KEY) {
    return Response.json({ ok: true, mock: true });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await stripe.paymentIntents.capture(paymentIntentId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[stripe/capture]', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
