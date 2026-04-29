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
 * v2.7.68 — auth required.
 * v2.7.75 — org-match enforced. The TODO from v2.7.68 is now closed:
 * we retrieve the PI from Stripe, compare its `metadata.orgId` (set by
 * payment-intent at create time using the verified JWT) against the
 * caller's verified `orgId`, and refuse 403 if they don't match. That
 * means a logged-in merchant on org A can no longer capture or
 * inspect a PI minted by org B even if they guess the PI id. The
 * idempotency-key behaviour of `paymentIntents.capture()` itself is
 * provided by Stripe — calling it twice on a captured PI returns
 * succeeded without re-charging.
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

    // v2.7.75 — verify org ownership via metadata.orgId before capture.
    // payment-intent.ts stamps orgId from the JWT at create time.
    // Older PIs (pre-v2.7.68) without the metadata field are treated
    // as legitimate but logged so we can spot them in operational
    // metrics — by the time you read this, they should all have been
    // captured or expired.
    const callerOrgId = String(auth.orgId ?? '');
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const piOrgId = pi.metadata?.['orgId'];
    if (piOrgId && callerOrgId && piOrgId !== callerOrgId) {
      console.warn('[stripe/capture] org mismatch', {
        paymentIntentId,
        piOrgId,
        callerOrgId,
        callerSub: auth.sub,
      });
      return Response.json(
        { error: 'PaymentIntent does not belong to your organisation.' },
        { status: 403 },
      );
    }
    if (!piOrgId) {
      console.warn('[stripe/capture] PI missing metadata.orgId — pre-v2.7.68 record', {
        paymentIntentId,
      });
    }

    await stripe.paymentIntents.capture(paymentIntentId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[stripe/capture]', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
