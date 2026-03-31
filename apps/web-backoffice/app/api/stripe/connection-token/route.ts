import Stripe from 'stripe';

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
 */
export async function POST() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const forceSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';

  if (!secretKey) {
    // Stripe not configured — signal pure demo mode.
    return Response.json({ secret: null, simulated: true }, { status: 200 });
  }

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2026-03-25.dahlia' });
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
