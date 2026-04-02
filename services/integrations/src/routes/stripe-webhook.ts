import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { stripeConnectAccounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
  apiVersion: '2024-06-20',
});

const WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';

export async function stripeWebhookRoutes(app: FastifyInstance) {
  // Must receive raw body for signature verification.
  // This route does NOT use JWT auth — Stripe signs the payload itself.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/stripe/webhook', async (request, reply) => {
    const sig = request.headers['stripe-signature'];

    if (!sig || !WEBHOOK_SECRET) {
      app.log.warn('[stripe-webhook] missing signature or secret — skipping verification');
      return reply.status(400).send({ error: 'Webhook secret not configured' });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        sig as string,
        WEBHOOK_SECRET,
      );
    } catch (err) {
      app.log.error({ err }, '[stripe-webhook] signature verification failed');
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    app.log.info({ type: event.type, id: event.id }, '[stripe-webhook] received');

    try {
      await handleEvent(event);
    } catch (err) {
      app.log.error({ type: event.type, err }, '[stripe-webhook] handler error');
      // Return 200 so Stripe doesn't retry — log the error and investigate
    }

    return reply.send({ received: true });
  });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'account.updated': {
      const account = event.account
        ? await stripe.accounts.retrieve(event.account)
        : (event.data.object as Stripe.Account);

      const orgId = account.metadata?.['orgId'];
      if (!orgId) break;

      const status = account.charges_enabled ? 'active'
        : account.details_submitted ? 'restricted'
        : 'onboarding';

      await db
        .update(stripeConnectAccounts)
        .set({
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled ?? false,
          detailsSubmitted: account.details_submitted,
          status,
          updatedAt: new Date(),
        })
        .where(eq(stripeConnectAccounts.stripeAccountId, account.id));
      break;
    }

    case 'payment_intent.succeeded': {
      // Future: update order status via orders service
      break;
    }

    case 'payment_intent.payment_failed': {
      // Future: notify merchant of failed payment
      break;
    }

    case 'invoice.payment_succeeded': {
      // Future: update subscription invoice status
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // Future: sync subscription status changes
      break;
    }

    default:
      break;
  }
}
