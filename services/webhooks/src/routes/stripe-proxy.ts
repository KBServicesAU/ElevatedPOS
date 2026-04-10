import type { FastifyInstance } from 'fastify';

/**
 * Stripe webhook proxy.
 *
 * Stripe is configured to POST to:
 *   https://api.elevatedpos.com.au/api/v1/webhooks/stripe
 *
 * The K8s ingress rewrites that path to /api/v1/stripe and routes it to this
 * (webhooks) service. The actual Stripe event handler lives in the integrations
 * service, so we forward the raw body + signature header there.
 */
export async function stripeProxyRoutes(app: FastifyInstance) {
  // Accept raw body so the Stripe signature can be verified downstream.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post('/stripe', async (request, reply) => {
    const integrationsUrl =
      process.env['INTEGRATIONS_URL'] ??
      process.env['INTEGRATIONS_API_URL'] ??
      'http://integrations:4010';

    const target = `${integrationsUrl}/api/v1/stripe/webhook`;

    try {
      const upstream = await fetch(target, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': (request.headers['stripe-signature'] as string) ?? '',
        },
        body: request.body as Buffer,
      });

      const data = await upstream.text();

      return reply
        .status(upstream.status)
        .header('content-type', upstream.headers.get('content-type') ?? 'application/json')
        .send(data);
    } catch (err) {
      app.log.error({ err, target }, '[stripe-proxy] failed to reach integrations service');
      // Return 200 so Stripe stops retrying — the event can be replayed from the Stripe dashboard.
      // Returning 5xx would cause Stripe to retry indefinitely.
      return reply.status(200).send({ received: true, processed: false });
    }
  });
}
