import Stripe from 'stripe';
import { type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

/**
 * POST /api/stripe/connection-token
 * Called by the Stripe Terminal JS SDK on the client to fetch a connection token.
 * The token authorises the browser to communicate with a Stripe Terminal reader.
 *
 * Response shape:
 *   { secret: string | null, simulated: boolean }
 *
 * `simulated: true` means the client should use Stripe's built-in simulated
 * reader rather than discovering a physical device.  This occurs when:
 *   - STRIPE_SECRET_KEY is not set (demo/offline mode), or
 *   - STRIPE_TERMINAL_SIMULATED=true is set (useful for CI / developer
 *     environments that have test keys but no physical hardware).
 *
 * `secret: null` means the Terminal SDK cannot be initialised at all (pure
 * demo mode with no Stripe keys).  The client falls back to a local simulation.
 *
 * v2.7.68 — auth required. Was previously open to the public internet,
 * which would have minted real Stripe Terminal connection tokens to any
 * caller — those tokens are short-lived but still let the holder talk to
 * Terminal readers paired to the platform's Stripe account.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  void auth; // Suppress unused — we may scope by orgId later.

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const forceSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';

  if (!secretKey) {
    // Stripe not configured — signal pure demo mode.
    return Response.json({ secret: null, simulated: true }, { status: 200 });
  }

  try {
    const stripe = new Stripe(secretKey);
    const token = await stripe.terminal.connectionTokens.create();
    // When STRIPE_TERMINAL_SIMULATED is set we still return a real connection
    // token (the SDK requires one even for simulated readers) but we tell the
    // client to use simulated discovery.
    return Response.json({ secret: token.secret, simulated: forceSimulated });
  } catch (err) {
    console.error('[stripe/connection-token]', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
