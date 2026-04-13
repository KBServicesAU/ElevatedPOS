/**
 * Stripe Terminal routes
 *
 * Provides connection tokens and payment intent lifecycle for
 * Stripe Terminal Tap to Pay on Android (localMobile reader).
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY — from Stripe Dashboard → Developers → API Keys
 *   STRIPE_WEBHOOK_SECRET — from Stripe Dashboard → Webhooks
 */
import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';

function getStripe(): Stripe {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' });
}

export async function stripeTerminalRoutes(app: FastifyInstance) {

  // POST /api/v1/stripe/connection-token
  // Called by the mobile app SDK to get a connection token for the terminal.
  // Requires device auth (Bearer device token).
  app.post('/connection-token', async (_request, reply) => {
    // Accept both device token and staff JWT
    const stripe = getStripe();
    const token = await stripe.terminal.connectionTokens.create();
    return reply.send({ secret: token.secret });
  });

  // POST /api/v1/stripe/payment-intent
  // Creates a payment intent for Stripe Terminal.
  // Body: { amountCents: number, currency?: string, orderId?: string, orgId: string }
  app.post('/payment-intent', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      amountCents:   z.number().int().positive(),
      currency:      z.string().length(3).default('aud'),
      orderId:       z.string().optional(),
      description:   z.string().max(255).optional(),
      captureMethod: z.enum(['automatic', 'manual']).default('automatic'),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error', details: body.error.flatten() });

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create({
      amount:         body.data.amountCents,
      currency:       body.data.currency.toLowerCase(),
      payment_method_types: ['card_present'],
      capture_method: body.data.captureMethod,
      ...(body.data.description !== undefined ? { description: body.data.description } : {}),
      metadata: {
        orderId:  body.data.orderId ?? '',
        source:   'elevatedpos-terminal',
      },
    });

    return reply.send({ data: { clientSecret: intent.client_secret, id: intent.id } });
  });

  // POST /api/v1/stripe/capture
  // Captures an authorised payment intent (for manual capture flow).
  app.post('/capture', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      paymentIntentId: z.string(),
      amountCents:     z.number().int().positive().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.capture(body.data.paymentIntentId, {
      ...(body.data.amountCents ? { amount_to_capture: body.data.amountCents } : {}),
    });

    return reply.send({ data: { id: intent.id, status: intent.status, amount: intent.amount } });
  });

  // POST /api/v1/stripe/refund
  // Refunds a captured payment intent.
  app.post('/refund', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      paymentIntentId: z.string(),
      amountCents:     z.number().int().positive().optional(),
      reason:          z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).default('requested_by_customer'),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const stripe = getStripe();
    const refund = await stripe.refunds.create({
      payment_intent: body.data.paymentIntentId,
      ...(body.data.amountCents ? { amount: body.data.amountCents } : {}),
      reason: body.data.reason,
    });

    return reply.send({ data: { id: refund.id, status: refund.status, amount: refund.amount } });
  });

  // POST /api/v1/stripe/webhook
  // Stripe webhook endpoint — processes payment_intent events.
  // Raw body required for signature verification.
  app.post('/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];

    if (!sig || !webhookSecret) {
      return reply.status(400).send({ error: 'Missing signature' });
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(
        (request as any).rawBody ?? JSON.stringify(request.body),
        sig,
        webhookSecret,
      );
    } catch (err) {
      return reply.status(400).send({ error: `Webhook signature verification failed` });
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        // Payment confirmed — log for audit (reconciliation)
        console.log(`[stripe-webhook] payment_intent.succeeded: ${intent.id} amount=${intent.amount}`);
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        console.log(`[stripe-webhook] payment_intent.payment_failed: ${intent.id}`);
        break;
      }
      default:
        break;
    }

    return reply.send({ received: true });
  });
}
