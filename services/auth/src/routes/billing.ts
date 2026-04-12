/**
 * Stripe Billing routes
 *
 * Manages SaaS subscription lifecycle:
 *  - Create customer + subscription on org registration
 *  - Billing portal access
 *  - Webhook: subscription events → update org planStatus
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY                   Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET_BILLING       Stripe webhook signing secret for this endpoint
 *                                       (separate from terminal/connect webhooks)
 *   STRIPE_PRICE_STARTER                Stripe Price ID for Starter plan ($49/mo)
 *   STRIPE_PRICE_GROWTH                 Stripe Price ID for Growth plan ($99/mo)
 *   STRIPE_PRICE_ENTERPRISE             Stripe Price ID for Enterprise plan ($249/mo)
 *   DASHBOARD_URL                       (optional) Portal return URL, defaults to production URL
 */
import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';

function getStripe(): Stripe {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

const PLAN_PRICE_IDS: Record<string, string> = {
  starter:    process.env['STRIPE_PRICE_STARTER']    ?? '',
  growth:     process.env['STRIPE_PRICE_GROWTH']     ?? '',
  enterprise: process.env['STRIPE_PRICE_ENTERPRISE'] ?? '',
};

export async function billingRoutes(app: FastifyInstance) {

  // POST /api/v1/billing/setup
  // Called after org registration to create Stripe customer + trial subscription.
  // Body: { plan }
  // Requires authentication — call this after the user logs in post-registration.
  app.post('/setup', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const body = z.object({
      plan: z.enum(['starter', 'growth', 'enterprise']).default('starter'),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    const stripe = getStripe();

    // Create or retrieve Stripe customer
    let stripeCustomerId = org.stripeCustomerId ?? undefined;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: org.billingEmail ?? undefined,
        name: org.name,
        metadata: { orgId: org.id },
      });
      stripeCustomerId = customer.id;
      await db.update(schema.organisations)
        .set({ stripeCustomerId })
        .where(eq(schema.organisations.id, org.id));
    }

    // Create trial subscription if a price ID is configured
    const priceId = PLAN_PRICE_IDS[body.data.plan];
    if (priceId) {
      await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        trial_period_days: 30,
        metadata: { orgId: org.id, plan: body.data.plan },
      });
    }

    return reply.send({ data: { stripeCustomerId } });
  });

  // GET /api/v1/billing/portal
  // Returns a Stripe Customer Portal session URL so the merchant can manage their subscription.
  app.get('/portal', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    const stripeCustomerId = org.stripeCustomerId;
    if (!stripeCustomerId) {
      return reply.status(400).send({ error: 'No Stripe customer found. Please contact support.' });
    }

    const stripe = getStripe();
    const returnUrl = process.env['DASHBOARD_URL'] ?? 'https://app.elevatedpos.com.au/dashboard/billing';

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    return reply.send({ data: { url: session.url } });
  });

  // GET /api/v1/billing/status
  // Returns current subscription status for the org.
  app.get('/status', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    return reply.send({
      data: {
        plan: org.plan,
        planStatus: org.planStatus,
        stripeCustomerId: org.stripeCustomerId ?? null,
        trialEndsAt: null, // populate once a trialEndsAt column is added to the schema
      },
    });
  });

  // POST /api/v1/billing/webhook
  // Stripe webhook handler for SaaS subscription lifecycle events.
  // Configure this endpoint URL in the Stripe dashboard under Webhooks.
  // Enable events: customer.subscription.created, customer.subscription.updated,
  //                customer.subscription.deleted
  app.post('/webhook', { config: { rawBody: true } }, async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET_BILLING'];

    if (!sig || !webhookSecret) {
      return reply.status(400).send({ error: 'Missing Stripe signature or webhook secret' });
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(
        (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body),
        sig as string,
        webhookSecret,
      );
    } catch {
      return reply.status(400).send({ error: 'Webhook signature verification failed' });
    }

    const subscription = event.data.object as Stripe.Subscription;
    const orgId = subscription.metadata?.['orgId'];
    const plan = subscription.metadata?.['plan'] ?? 'starter';

    if (orgId) {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          let planStatus: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'paused';
          if (subscription.status === 'trialing') {
            planStatus = 'trialing';
          } else if (subscription.status === 'active') {
            planStatus = 'active';
          } else if (subscription.status === 'past_due') {
            planStatus = 'past_due';
          } else if (subscription.status === 'canceled') {
            planStatus = 'cancelled';
          } else {
            planStatus = 'paused';
          }
          await db.update(schema.organisations)
            .set({
              plan: plan as 'starter' | 'growth' | 'pro' | 'enterprise' | 'custom',
              planStatus,
            })
            .where(eq(schema.organisations.id, orgId));
          break;
        }
        case 'customer.subscription.deleted': {
          await db.update(schema.organisations)
            .set({ planStatus: 'cancelled' })
            .where(eq(schema.organisations.id, orgId));
          break;
        }
      }
    }

    return reply.send({ received: true });
  });
}
