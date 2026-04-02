import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { stripeConnectAccounts, stripeSubscriptions, stripeInvoices } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
  apiVersion: '2024-06-20',
});

const PLATFORM_FEE_BASIS_POINTS = 100; // 1%

export async function connectRoutes(app: FastifyInstance) {

  // ── Create / get onboarding link ────────────────────────────────────────────
  app.post('/connect/onboard', {
  }, async (request, reply) => {
    const { orgId, businessName, returnUrl, refreshUrl } = request.body as {
      orgId: string; businessName?: string; returnUrl?: string; refreshUrl?: string;
    };

    const baseUrl = process.env['APP_URL'] ?? 'https://app.elevatedpos.com.au';

    // Check if already has a connect account
    const existing = await db.select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId))
      .limit(1);

    let accountId: string;

    if (existing.length > 0) {
      accountId = existing[0]!.stripeAccountId;
    } else {
      // Create Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'AU',
        ...(businessName ? { business_profile: { name: businessName } } : {}),
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          au_becs_debit_payments: { requested: true },
        },
        metadata: { orgId },
      });
      accountId = account.id;

      await db.insert(stripeConnectAccounts).values({
        orgId,
        stripeAccountId: accountId,
        status: 'onboarding',
        businessName: businessName ?? null,
        platformFeePercent: PLATFORM_FEE_BASIS_POINTS,
      });
    }

    // Generate onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl ?? `${baseUrl}/dashboard/settings/payments?refresh=1`,
      return_url: returnUrl ?? `${baseUrl}/dashboard/settings/payments?connected=1`,
      type: 'account_onboarding',
    });

    // Save the URL
    await db.update(stripeConnectAccounts)
      .set({ onboardingUrl: accountLink.url, onboardingExpiresAt: new Date(accountLink.expires_at * 1000), updatedAt: new Date() })
      .where(eq(stripeConnectAccounts.orgId, orgId));

    return reply.send({ url: accountLink.url, expiresAt: new Date(accountLink.expires_at * 1000) });
  });

  // ── Get connect account status ───────────────────────────────────────────────
  app.get('/connect/account/:orgId', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const rows = await db.select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId))
      .limit(1);

    if (rows.length === 0) {
      return reply.status(404).send({ error: 'No connect account found' });
    }

    const row = rows[0]!;

    // Refresh from Stripe
    const account = await stripe.accounts.retrieve(row.stripeAccountId);

    const status = account.charges_enabled ? 'active'
      : account.details_submitted ? 'restricted'
      : 'onboarding';

    await db.update(stripeConnectAccounts).set({
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      status,
      updatedAt: new Date(),
    }).where(eq(stripeConnectAccounts.orgId, orgId));

    return reply.send({
      stripeAccountId: row.stripeAccountId,
      status,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      businessName: account.business_profile?.name,
      platformFeePercent: row.platformFeePercent,
    });
  });

  // ── Create Stripe login link (dashboard access) ──────────────────────────────
  app.post('/connect/login-link/:orgId', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const rows = await db.select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId))
      .limit(1);

    if (rows.length === 0) return reply.status(404).send({ error: 'No connect account' });

    const loginLink = await stripe.accounts.createLoginLink(rows[0]!.stripeAccountId);
    return reply.send({ url: loginLink.url });
  });

  // ── Create subscription for merchant's customer ──────────────────────────────
  app.post('/connect/subscriptions', {
  }, async (request, reply) => {
    const body = request.body as {
      orgId: string; customerId?: string; stripeCustomerId?: string;
      customerEmail?: string; customerName?: string; priceId: string;
      trialDays?: number; metadata?: Record<string, string>;
    };

    const account = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, body.orgId)).limit(1);
    if (account.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const { stripeAccountId } = account[0]!;

    // Create or use existing Stripe customer on the connected account
    let stripeCustomerId = body.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        ...(body.customerEmail ? { email: body.customerEmail } : {}),
        ...(body.customerName ? { name: body.customerName } : {}),
        metadata: { orgId: body.orgId, customerId: body.customerId ?? '' },
      }, { stripeAccount: stripeAccountId });
      stripeCustomerId = customer.id;
    }

    // Create subscription with application fee
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: body.priceId }],
      ...(body.trialDays ? { trial_period_days: body.trialDays } : {}),
      application_fee_percent: 1, // ElevatedPOS 1% platform fee
      metadata: body.metadata ?? {},
    }, { stripeAccount: stripeAccountId });

    await db.insert(stripeSubscriptions).values({
      orgId: body.orgId,
      stripeAccountId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId,
      stripePriceId: body.priceId,
      customerId: body.customerId ?? null,
      status: subscription.status,
      currentPeriodStart: new Date((subscription as unknown as { current_period_start: number }).current_period_start * 1000),
      currentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      metadata: body.metadata ?? {},
    });

    return reply.status(201).send({ subscriptionId: subscription.id, status: subscription.status, stripeCustomerId });
  });

  // ── List subscriptions for org ───────────────────────────────────────────────
  app.get('/connect/subscriptions/:orgId', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const rows = await db.select().from(stripeSubscriptions)
      .where(eq(stripeSubscriptions.orgId, orgId));
    return reply.send({ subscriptions: rows });
  });

  // ── Cancel subscription ──────────────────────────────────────────────────────
  app.delete('/connect/subscriptions/:subscriptionId', async (request, reply) => {
    const { subscriptionId } = request.params as { subscriptionId: string };

    const rows = await db.select().from(stripeSubscriptions)
      .where(eq(stripeSubscriptions.stripeSubscriptionId, subscriptionId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Subscription not found' });

    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true },
      { stripeAccount: rows[0]!.stripeAccountId });

    await db.update(stripeSubscriptions).set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(stripeSubscriptions.stripeSubscriptionId, subscriptionId));

    return reply.send({ cancelled: true });
  });

  // ── Create invoice for merchant's customer ───────────────────────────────────
  app.post('/connect/invoices', {
  }, async (request, reply) => {
    const body = request.body as {
      orgId: string; stripeCustomerId?: string; customerEmail?: string;
      customerName?: string; customerId?: string;
      items: { description: string; amount: number; quantity: number }[];
      dueDate?: string; memo?: string; autoSend: boolean;
    };

    const account = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, body.orgId)).limit(1);
    if (account.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const { stripeAccountId } = account[0]!;

    let stripeCustomerId = body.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        ...(body.customerEmail ? { email: body.customerEmail } : {}),
        ...(body.customerName ? { name: body.customerName } : {}),
        metadata: { orgId: body.orgId },
      }, { stripeAccount: stripeAccountId });
      stripeCustomerId = customer.id;
    }

    // Add invoice items
    for (const item of body.items) {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: item.amount * item.quantity,
        currency: 'aud',
        description: item.description,
      }, { stripeAccount: stripeAccountId });
    }

    const invoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      collection_method: 'send_invoice',
      days_until_due: body.dueDate
        ? Math.ceil((new Date(body.dueDate).getTime() - Date.now()) / 86400000)
        : 30,
      ...(body.memo ? { description: body.memo } : {}),
      application_fee_amount: Math.round(
        body.items.reduce((sum, i) => sum + i.amount * i.quantity, 0) * 0.01
      ), // 1% platform fee
    }, { stripeAccount: stripeAccountId });

    if (body.autoSend) {
      await stripe.invoices.sendInvoice(invoice.id, {}, { stripeAccount: stripeAccountId });
    }

    await db.insert(stripeInvoices).values({
      orgId: body.orgId,
      stripeAccountId,
      stripeInvoiceId: invoice.id,
      stripeCustomerId,
      customerId: body.customerId ?? null,
      status: invoice.status ?? 'draft',
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      invoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
    });

    return reply.status(201).send({
      invoiceId: invoice.id,
      status: invoice.status,
      amountDue: invoice.amount_due,
      invoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
    });
  });

  // ── List invoices for org ────────────────────────────────────────────────────
  app.get('/connect/invoices/:orgId', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const rows = await db.select().from(stripeInvoices)
      .where(eq(stripeInvoices.orgId, orgId));
    return reply.send({ invoices: rows });
  });

  // ── Send draft invoice ───────────────────────────────────────────────────────
  app.post('/connect/invoices/:invoiceId/send', async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };

    const rows = await db.select().from(stripeInvoices)
      .where(eq(stripeInvoices.stripeInvoiceId, invoiceId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Invoice not found' });

    await stripe.invoices.sendInvoice(invoiceId, {}, { stripeAccount: rows[0]!.stripeAccountId });
    await db.update(stripeInvoices).set({ status: 'open', updatedAt: new Date() })
      .where(eq(stripeInvoices.stripeInvoiceId, invoiceId));

    return reply.send({ sent: true });
  });

  // ── Storefront checkout session (Stripe Hosted Checkout) ─────────────────────
  app.post('/connect/checkout-session', {
  }, async (request, reply) => {
    const body = request.body as {
      slug: string;
      items: { id: string; name: string; price: number; quantity: number }[];
      customer: { name: string; email: string; phone?: string };
      successUrl: string;
      cancelUrl: string;
    };

    // TODO: Replace with DB lookup via a storefronts table once multi-tenant config exists.
    // For now, a static mapping covers the demo environment.
    const SLUG_TO_ORG: Record<string, string> = {
      demo: '00000000-0000-0000-0000-000000000001',
    };
    const orgId = SLUG_TO_ORG[body.slug] ?? process.env['DEFAULT_ORG_ID'];
    if (!orgId) return reply.status(404).send({ error: 'Store not found' });

    const account = await db.select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId))
      .limit(1);
    if (account.length === 0) {
      return reply.status(404).send({ error: 'This store has not configured payments yet.' });
    }

    const { stripeAccountId, platformFeePercent } = account[0]!;
    const totalAmount = body.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const applicationFeeAmount = Math.round(totalAmount * (platformFeePercent / 10000));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: body.customer.email,
      line_items: body.items.map((item) => ({
        price_data: {
          currency: 'aud',
          product_data: { name: item.name },
          unit_amount: item.price,
        },
        quantity: item.quantity,
      })),
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        ...(body.customer.name ? { receipt_email: body.customer.email } : {}),
      },
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
    }, { stripeAccount: stripeAccountId });

    return reply.send({ url: session.url, sessionId: session.id });
  });

  // ── Create payment intent via connected account (with 1% fee) ───────────────
  app.post('/connect/payment-intent', {
  }, async (request, reply) => {
    const body = request.body as {
      orgId: string; amount: number; currency: string; description?: string; metadata?: Record<string, string>;
    };

    const account = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, body.orgId)).limit(1);
    if (account.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const { stripeAccountId, platformFeePercent } = account[0]!;
    const applicationFeeAmount = Math.round(body.amount * (platformFeePercent / 10000));

    const paymentIntent = await stripe.paymentIntents.create({
      amount: body.amount,
      currency: body.currency,
      application_fee_amount: applicationFeeAmount,
      ...(body.description ? { description: body.description } : {}),
      metadata: body.metadata ?? {},
    }, { stripeAccount: stripeAccountId });

    return reply.status(201).send({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      applicationFeeAmount,
    });
  });
}
