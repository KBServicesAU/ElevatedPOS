import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { stripeConnectAccounts, stripeSubscriptions, stripeInvoices } from '../db/schema.js';
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
      // Return 200 so Stripe doesn't retry — log the error for investigation
    }

    return reply.send({ received: true });
  });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {

    // ── Connect: account status changed ──────────────────────────────────────
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

    // ── Connect: merchant deauthorised the platform ───────────────────────────
    case 'account.application.deauthorized': {
      const account = event.account;
      if (!account) break;
      await db
        .update(stripeConnectAccounts)
        .set({ status: 'deauthorized', chargesEnabled: false, updatedAt: new Date() })
        .where(eq(stripeConnectAccounts.stripeAccountId, account));
      break;
    }

    // ── Subscriptions ─────────────────────────────────────────────────────────
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const period = sub as unknown as {
        current_period_start: number;
        current_period_end: number;
      };
      await db
        .update(stripeSubscriptions)
        .set({
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodStart: new Date(period.current_period_start * 1000),
          currentPeriodEnd: new Date(period.current_period_end * 1000),
          updatedAt: new Date(),
        })
        .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .update(stripeSubscriptions)
        .set({ status: 'canceled', cancelAtPeriodEnd: false, updatedAt: new Date() })
        .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));
      break;
    }

    // ── Invoices ──────────────────────────────────────────────────────────────
    case 'invoice.payment_succeeded': {
      const inv = event.data.object as Stripe.Invoice;
      const invoiceId = (inv as { id?: string }).id;
      if (!invoiceId) break;
      await db
        .update(stripeInvoices)
        .set({ status: 'paid', amountPaid: inv.amount_paid, updatedAt: new Date() })
        .where(eq(stripeInvoices.stripeInvoiceId, invoiceId));
      break;
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const invoiceId = (inv as { id?: string }).id;
      if (!invoiceId) break;
      await db
        .update(stripeInvoices)
        .set({ status: 'open', updatedAt: new Date() })
        .where(eq(stripeInvoices.stripeInvoiceId, invoiceId));
      break;
    }

    // Invoice finalised — draft → open (ready to be sent / paid)
    case 'invoice.finalized': {
      const inv = event.data.object as Stripe.Invoice;
      const invoiceId = (inv as { id?: string }).id;
      if (!invoiceId) break;
      await db
        .update(stripeInvoices)
        .set({ status: 'open', updatedAt: new Date() })
        .where(eq(stripeInvoices.stripeInvoiceId, invoiceId));
      break;
    }

    // Invoice voided by the merchant
    case 'invoice.voided': {
      const inv = event.data.object as Stripe.Invoice;
      const invoiceId = (inv as { id?: string }).id;
      if (!invoiceId) break;
      await db
        .update(stripeInvoices)
        .set({ status: 'void', updatedAt: new Date() })
        .where(eq(stripeInvoices.stripeInvoiceId, invoiceId));
      break;
    }

    // Invoice written off as uncollectible
    case 'invoice.marked_uncollectible': {
      const inv = event.data.object as Stripe.Invoice;
      const invoiceId = (inv as { id?: string }).id;
      if (!invoiceId) break;
      await db
        .update(stripeInvoices)
        .set({ status: 'uncollectible', updatedAt: new Date() })
        .where(eq(stripeInvoices.stripeInvoiceId, invoiceId));
      break;
    }

    // ── Subscriptions: trial ending soon ─────────────────────────────────────
    // Fired 3 days before trial ends — forward to notifications service so the
    // merchant can send a heads-up email to their customer.
    case 'customer.subscription.trial_will_end': {
      const sub = event.data.object as Stripe.Subscription;
      const NOTIFICATIONS_API = process.env['NOTIFICATIONS_API_URL'] ?? 'http://localhost:4009';
      try {
        await fetch(`${NOTIFICATIONS_API}/api/v1/notifications/internal/trial-ending`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptionId: sub.id,
            customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
            trialEnd: (sub as unknown as { trial_end: number }).trial_end,
          }),
        });
      } catch { /* non-fatal — notifications service may be offline */ }
      break;
    }

    // ── Disputes ──────────────────────────────────────────────────────────────
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated':
      // Disputes are surfaced via the embedded 'payments' component in the
      // dashboard. Log here for audit; future: notify the merchant via push.
      break;

    // ── Payments ──────────────────────────────────────────────────────────────
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled':
      // Logged above — future: forward to orders service or notify merchant
      break;

    case 'charge.refunded':
      // Logged — future: update orders service with refund status
      break;

    case 'charge.succeeded':
      // Logged — future: forward to notifications/orders
      break;

    // ── Payouts ───────────────────────────────────────────────────────────────
    case 'payout.created':
    case 'payout.paid':
    case 'payout.failed':
    case 'payout.canceled':
      // Logged — surfaced via the 'payouts' embedded component
      break;

    // ── Terminal hardware ─────────────────────────────────────────────────────
    case 'terminal.reader.action_succeeded':
    case 'terminal.reader.action_failed':
      // Logged — POS devices handle their own terminal state machines
      break;

    default:
      break;
  }
}
