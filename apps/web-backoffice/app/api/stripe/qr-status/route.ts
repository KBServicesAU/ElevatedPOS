import Stripe from 'stripe';
import { type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { resolveConnectAccount } from '@/lib/stripe-connect';

/**
 * GET /api/stripe/qr-status?id=cs_xxx
 * Returns: {
 *   status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'unknown',
 *   paymentIntentId: 'pi_xxx' | null,
 *   amountTotal: number | null,        // cents, the amount actually charged
 *   currency: 'aud' | string | null,
 *   paymentMethod: 'card' | 'apple_pay' | 'google_pay' | 'link' | string | null,
 * }
 *
 * Polled every ~2s by the POS QR-pay modal. Returns:
 *   - 'pending'   while the customer hasn't paid yet (session.payment_status === 'unpaid')
 *   - 'paid'      once Stripe confirms the charge (payment_status === 'paid')
 *   - 'expired'   if the session expired (session.status === 'expired')
 *   - 'cancelled' if the customer hit the cancel URL or the operator
 *                 abandoned the flow (session.status === 'complete' with
 *                 payment_status !== 'paid')
 *
 * Auth required + verifies session.metadata.orgId matches the caller's
 * orgId so a logged-in operator on org A can't poll org B's sessions
 * by guessing ids.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return Response.json({ error: 'id query parameter is required.' }, { status: 422 });
  }

  // Mock path for dev / demo without Stripe configured.
  if (id.startsWith('cs_sim_')) {
    // The POS simulator just declares "paid" after ~3 seconds; for
    // honesty we mirror that here based on age extracted from the id.
    const tsRaw = id.replace('cs_sim_', '');
    const ts = Number(tsRaw);
    if (Number.isFinite(ts)) {
      const ageSeconds = Math.floor((Date.now() - ts) / 1000);
      return Response.json({
        status: ageSeconds >= 3 ? 'paid' : 'pending',
        paymentIntentId: ageSeconds >= 3 ? `pi_sim_${tsRaw}` : null,
        amountTotal: null,
        currency: null,
        paymentMethod: 'card',
        mock: true,
      });
    }
    return Response.json({ status: 'pending', paymentIntentId: null, mock: true });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return Response.json({ error: 'Stripe not configured.' }, { status: 503 });
  }

  // v2.7.78 — Sessions created in v2.7.76 (no Connect) lived on the
  // platform account. Sessions from v2.7.78 onwards live on the
  // merchant's connected account and need the `stripeAccount` header
  // to retrieve. Resolve the merchant's account; if missing, fall
  // back to platform-side retrieval (handles legacy sessions and the
  // dev/demo path where Connect isn't configured).
  const connect = await resolveConnectAccount(req);

  try {
    const stripe = new Stripe(secretKey);
    const session = connect?.stripeAccountId
      ? await stripe.checkout.sessions.retrieve(
          id,
          { expand: ['payment_intent', 'payment_intent.payment_method'] },
          { stripeAccount: connect.stripeAccountId },
        )
      : await stripe.checkout.sessions.retrieve(id, {
          expand: ['payment_intent', 'payment_intent.payment_method'],
        });

    // Org-match enforcement (same shape as /api/stripe/capture).
    const callerOrgId = String(auth.orgId ?? '');
    const sessionOrgId = session.metadata?.['orgId'];
    if (sessionOrgId && callerOrgId && sessionOrgId !== callerOrgId) {
      console.warn('[stripe/qr-status] org mismatch', {
        sessionId: id,
        sessionOrgId,
        callerOrgId,
        callerSub: auth.sub,
      });
      return Response.json(
        { error: 'Session does not belong to your organisation.' },
        { status: 403 },
      );
    }

    let status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'unknown' = 'unknown';
    if (session.status === 'expired') {
      status = 'expired';
    } else if (session.payment_status === 'paid') {
      status = 'paid';
    } else if (session.status === 'complete') {
      // Reached the terminal state but the payment didn't go through
      // (e.g. customer hit cancel) — treat as cancelled.
      status = 'cancelled';
    } else if (session.status === 'open') {
      status = 'pending';
    }

    // Extract a friendly payment_method label from the expanded PI
    // when available. PaymentMethod.type is one of: 'card', 'link',
    // etc. For Apple Pay / Google Pay, Stripe sets card.wallet.type.
    let paymentMethod: string | null = null;
    let paymentIntentId: string | null = null;
    if (session.payment_intent && typeof session.payment_intent === 'object') {
      paymentIntentId = session.payment_intent.id;
      const pm = session.payment_intent.payment_method;
      if (pm && typeof pm === 'object') {
        const wallet = pm.card?.wallet?.type;
        paymentMethod = wallet ?? pm.type ?? null;
      }
    }

    return Response.json({
      status,
      paymentIntentId,
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
      paymentMethod,
    });
  } catch (err) {
    console.error('[stripe/qr-status]', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
