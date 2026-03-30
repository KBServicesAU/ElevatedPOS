import Stripe from 'stripe';

/**
 * POST /api/stripe/connection-token
 * Called by the Stripe Terminal JS SDK on the client to fetch a connection token.
 * The token authorises the browser to communicate with a Stripe Terminal reader.
 */
export async function POST() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    // Stripe not configured — return a sentinel so the client knows to use simulated mode
    return Response.json({ secret: null, simulated: true }, { status: 200 });
  }

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
    const token = await stripe.terminal.connectionTokens.create();
    return Response.json({ secret: token.secret, simulated: false });
  } catch (err) {
    console.error('[stripe/connection-token]', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
