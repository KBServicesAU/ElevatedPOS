import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { organisations, stripeConnectAccounts, stripeSubscriptions, stripeInvoices } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
  apiVersion: '2024-06-20',
});

const PLATFORM_FEE_BASIS_POINTS = 100; // 1%

// ── Industry → Stripe MCC mapping ───────────────────────────────────────────
// Merchant Category Codes required by Stripe for AU accounts.
const INDUSTRY_MCC: Record<string, string> = {
  restaurant:     '5812', // Eating Places, Restaurants
  cafe:           '5812',
  quick_service:  '5814', // Fast Food Restaurants
  bar:            '5813', // Bars, Cocktail Lounges
  retail:         '5999', // Retail Stores, Not Elsewhere Classified
  fashion:        '5621', // Women's Ready-to-Wear Stores
  grocery:        '5411', // Grocery Stores, Supermarkets
  salon:          '7230', // Beauty Shops
  barber:         '7241', // Barber Shops
  gym:            '7997', // Membership Clubs (Sports, Recreation)
  services:       '7389', // Misc Business Services
  other:          '5999',
};

// Fields that Stripe accepts upfront when pre-filling a Connect account.
function buildStripeAccountParams(org: {
  name: string;
  websiteUrl?: string | null;
  phone?: string | null;
  industry?: string | null;
  businessAddress?: Record<string, string> | null;
  abn?: string | null;
}): Partial<Stripe.AccountCreateParams> {
  const params: Partial<Stripe.AccountCreateParams> = {};
  const mcc = org.industry ? (INDUSTRY_MCC[org.industry] ?? '5999') : undefined;

  params.business_profile = {
    ...(org.name ? { name: org.name } : {}),
    ...(org.websiteUrl ? { url: org.websiteUrl } : {}),
    ...(mcc ? { mcc } : {}),
  };

  if (org.phone || org.businessAddress) {
    const addr = org.businessAddress ?? {};
    params.company = {
      ...(org.phone ? { phone: org.phone } : {}),
      ...(org.abn ? { tax_id: org.abn } : {}),
      ...(addr['line1'] ? {
        address: {
          line1: addr['line1'],
          ...(addr['line2'] ? { line2: addr['line2'] } : {}),
          city: addr['city'] ?? '',
          state: addr['state'] ?? '',
          postal_code: addr['postcode'] ?? '',
          country: 'AU',
        },
      } : {}),
    };
  }

  return params;
}

// Fetch org profile fields used for Stripe pre-fill.
async function getOrgProfile(orgId: string) {
  const rows = await db
    .select({
      name:            organisations.name,
      websiteUrl:      organisations.websiteUrl,
      phone:           organisations.phone,
      industry:        organisations.industry,
      businessAddress: organisations.businessAddress,
      abn:             organisations.abn,
    })
    .from(organisations)
    .where(eq(organisations.id, orgId))
    .limit(1);
  return rows[0] ?? null;
}

export async function connectRoutes(app: FastifyInstance) {

  // ── POST /connect/platform-account ──────────────────────────────────────────
  // Storefront onboarding: creates (or retrieves) a Stripe Connect Express
  // account for the org and returns an onboarding URL.
  // Body: { email?, businessName?, returnUrl, refreshUrl }
  // orgId is always taken from the authenticated JWT — never from the request body.
  app.post('/connect/platform-account', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { email, businessName, returnUrl, refreshUrl } = request.body as {
      email?: string;
      businessName?: string;
      returnUrl: string;
      refreshUrl: string;
    };

    // Graceful fallback when Stripe is not configured (dev / CI environments)
    if (!process.env['STRIPE_SECRET_KEY']) {
      return reply.send({ url: returnUrl });
    }

    const baseUrl = process.env['APP_URL'] ?? 'https://app.elevatedpos.com.au';

    // Check for an existing Connect account
    const existing = await db
      .select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId))
      .limit(1);

    let accountId: string;

    if (existing.length > 0) {
      accountId = existing[0]!.stripeAccountId;
    } else {
      const orgProfile = await getOrgProfile(orgId);
      const profileParams = orgProfile ? buildStripeAccountParams({
        ...orgProfile,
        name: businessName ?? orgProfile.name,
      }) : {};
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'AU',
        ...(email ? { email } : {}),
        ...profileParams,
        capabilities: {
          card_payments:           { requested: true },
          transfers:               { requested: true },
          au_becs_debit_payments:  { requested: true },
        },
        metadata: { orgId },
      });
      accountId = account.id;

      await db.insert(stripeConnectAccounts).values({
        orgId,
        stripeAccountId: accountId,
        status: 'onboarding',
        businessName: businessName ?? orgProfile?.name ?? null,
        platformFeePercent: PLATFORM_FEE_BASIS_POINTS,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl ?? `${baseUrl}/onboard/payment-account`,
      return_url: returnUrl ?? `${baseUrl}/onboard/subscription`,
      type: 'account_onboarding',
    });

    // Persist the link so it can be referenced later
    await db
      .update(stripeConnectAccounts)
      .set({
        onboardingUrl: accountLink.url,
        onboardingExpiresAt: new Date(accountLink.expires_at * 1000),
        updatedAt: new Date(),
      })
      .where(eq(stripeConnectAccounts.orgId, orgId));

    return reply.send({ url: accountLink.url });
  });

  // ── Create / get onboarding link ────────────────────────────────────────────
  // orgId is always taken from the authenticated JWT — never from the request body.
  app.post('/connect/onboard', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { businessName, returnUrl, refreshUrl } = request.body as {
      businessName?: string; returnUrl?: string; refreshUrl?: string;
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
      const orgProfile = await getOrgProfile(orgId);
      const profileParams = orgProfile ? buildStripeAccountParams({
        ...orgProfile,
        name: businessName ?? orgProfile.name,
      }) : {};
      // Create Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'AU',
        ...profileParams,
        capabilities: {
          card_payments:           { requested: true },
          transfers:               { requested: true },
          au_becs_debit_payments:  { requested: true },
        },
        metadata: { orgId },
      });
      accountId = account.id;

      await db.insert(stripeConnectAccounts).values({
        orgId,
        stripeAccountId: accountId,
        status: 'onboarding',
        businessName: businessName ?? orgProfile?.name ?? null,
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

  // ── GET /connect/account-status ─────────────────────────────────────────────
  // Authenticated variant — orgId comes from the JWT, never from the URL.
  // Returns the connected account for the requesting org (or null if none).
  app.get('/connect/account-status', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const rows = await db.select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId))
      .limit(1);

    if (rows.length === 0) return reply.send(null);

    const row = rows[0]!;

    // Refresh status from Stripe if key is configured
    if (process.env['STRIPE_SECRET_KEY']) {
      try {
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
      } catch {
        // Fall through to cached DB values if Stripe call fails
      }
    }

    return reply.send({
      stripeAccountId: row.stripeAccountId,
      status: row.status,
      chargesEnabled: row.chargesEnabled ?? false,
      payoutsEnabled: row.payoutsEnabled ?? false,
      detailsSubmitted: row.detailsSubmitted ?? false,
      businessName: row.businessName ?? undefined,
      platformFeePercent: row.platformFeePercent,
    });
  });

  // ── POST /connect/sync-account ───────────────────────────────────────────────
  // Pushes current org profile data (website, MCC, phone, address) to the
  // existing Stripe Connect account and returns a fresh onboarding link so
  // the merchant can complete the remaining requirements (representative,
  // bank account, ToS acceptance).
  app.post('/connect/sync-account', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    // v2.7.51 — surface the actual failure reason to the dashboard so the
    // merchant doesn't get a generic "Could not start setup, please try
    // again" toast forever. The browser sees the message via `apiFetch`.
    if (!process.env['STRIPE_SECRET_KEY']) {
      console.error('[connect/sync-account] STRIPE_SECRET_KEY missing — cannot create AccountLink');
      return reply.status(500).send({
        error: 'Stripe is not configured on the server (STRIPE_SECRET_KEY env var is missing). Contact support.',
      });
    }

    try {
      const rows = await db.select()
        .from(stripeConnectAccounts)
        .where(eq(stripeConnectAccounts.orgId, orgId))
        .limit(1);

      if (rows.length === 0) {
        console.warn('[connect/sync-account] no Connect account row for orgId=', orgId);
        return reply.status(404).send({
          error: 'No Connect account exists for this organisation yet. Reload and try again.',
        });
      }

      const { stripeAccountId } = rows[0]!;
      const orgProfile = await getOrgProfile(orgId);
      console.log('[connect/sync-account] orgId=', orgId, 'stripeAccountId=', stripeAccountId, 'hasProfile=', !!orgProfile);

      if (orgProfile) {
        const profileParams = buildStripeAccountParams(orgProfile);
        try {
          await stripe.accounts.update(stripeAccountId, profileParams as Stripe.AccountUpdateParams);
        } catch (updateErr) {
          // Non-fatal: we can still issue an AccountLink even if the profile
          // sync failed. Surface the exact reason in logs for triage.
          console.warn(
            '[connect/sync-account] profile update failed (continuing):',
            updateErr instanceof Error ? updateErr.message : String(updateErr),
          );
        }
      }

      // Generate a fresh onboarding link for the remaining requirements
      const baseUrl = process.env['APP_URL'] ?? 'https://app.elevatedpos.com.au';
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${baseUrl}/dashboard/payments?refresh=1`,
        return_url:  `${baseUrl}/dashboard/payments?connected=1`,
        type: 'account_onboarding',
      });

      await db.update(stripeConnectAccounts)
        .set({
          onboardingUrl:       accountLink.url,
          onboardingExpiresAt: new Date(accountLink.expires_at * 1000),
          updatedAt:           new Date(),
        })
        .where(eq(stripeConnectAccounts.orgId, orgId));

      return reply.send({ url: accountLink.url, expiresAt: new Date(accountLink.expires_at * 1000) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Stripe errors expose `type` and `code` — surface them so the toast
      // says e.g. "Stripe: api_key_expired" instead of "Please try again".
      const stripeType = (err as { type?: string }).type;
      const stripeCode = (err as { code?: string }).code;
      console.error('[connect/sync-account] Stripe call failed:', { message, stripeType, stripeCode });
      return reply.status(500).send({
        error: stripeType
          ? `Stripe error (${stripeType}${stripeCode ? `/${stripeCode}` : ''}): ${message}`
          : `Could not start Stripe onboarding: ${message}`,
      });
    }
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

  // ── POST /connect/account-session ────────────────────────────────────────────
  // Creates a short-lived AccountSession client_secret for use with
  // Stripe Connect Embedded Components.  The session enables the
  // account_onboarding, payments, payouts, and balances components so the
  // merchant dashboard can render them in-page without any Stripe redirect.
  app.post('/connect/account-session', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    if (!process.env['STRIPE_SECRET_KEY']) {
      return reply.status(503).send({ error: 'Payment processing not configured' });
    }

    // Get or create the connected account for this org
    const existing = await db.select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId))
      .limit(1);

    let accountId: string;
    const orgProfile = await getOrgProfile(orgId);
    const profileParams = orgProfile ? buildStripeAccountParams(orgProfile) : {};

    if (existing.length > 0) {
      accountId = existing[0]!.stripeAccountId;
      // Sync latest org data to the existing Stripe account so Stripe has
      // the most up-to-date website, MCC, phone, and address.
      if (orgProfile && process.env['STRIPE_SECRET_KEY']) {
        try {
          await stripe.accounts.update(accountId, profileParams as Stripe.AccountUpdateParams);
        } catch {
          // Non-fatal — session still works even if update fails
        }
      }
    } else {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'AU',
        ...profileParams,
        capabilities: {
          card_payments:           { requested: true },
          transfers:               { requested: true },
          au_becs_debit_payments:  { requested: true },
        },
        metadata: { orgId },
      });
      accountId = account.id;
      await db.insert(stripeConnectAccounts).values({
        orgId,
        stripeAccountId: accountId,
        status: 'onboarding',
        businessName: orgProfile?.name ?? null,
        platformFeePercent: PLATFORM_FEE_BASIS_POINTS,
      });
    }

    const session = await stripe.accountSessions.create({
      account: accountId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components: {
        // ── Core account ────────────────────────────────────────────────────────
        account_onboarding: { enabled: true },
        account_management: {
          enabled: true,
          features: { external_account_collection: true },
        },
        notification_banner: {
          enabled: true,
          features: { external_account_collection: true },
        },
        // ── Payments & disputes ─────────────────────────────────────────────────
        payments: {
          enabled: true,
          features: {
            refund_management: true,
            dispute_management: true,
            capture_payments: true,
          },
        },
        // ── Payouts & balance ───────────────────────────────────────────────────
        payouts: {
          enabled: true,
          features: {
            instant_payouts: true,
            standard_payouts: true,
            edit_payout_schedule: true,
          },
        },
        balances: {
          enabled: true,
          features: {
            instant_payouts: true,
            standard_payouts: true,
            edit_payout_schedule: true,
          },
        },
        // ── Reporting & financing (cast: may not be in SDK types for this API version) ──
        ...({
          reporting_chart: { enabled: true },
          capital_overview: { enabled: true },
        } as Record<string, unknown>),
      } as Parameters<typeof stripe.accountSessions.create>[0]['components'],
    });

    return reply.send({ clientSecret: session.client_secret });
  });

  // ── Create subscription for merchant's customer ──────────────────────────────
  // orgId is always taken from the authenticated JWT — never from the request body.
  app.post('/connect/subscriptions', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId: jwtOrgId } = request.user as { orgId: string };
    const body = request.body as {
      orgId?: string; customerId?: string; stripeCustomerId?: string;
      customerEmail?: string; customerName?: string; priceId: string;
      trialDays?: number; metadata?: Record<string, string>;
    };
    // Always use JWT orgId, ignore any orgId in body
    body.orgId = jwtOrgId;

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

  // ── Update subscription plan (upgrade / downgrade) ───────────────────────────
  // Swaps the price on the existing subscription item.
  // Defaults to create_prorations so the customer is charged the difference
  // immediately; pass prorationBehavior: 'none' to defer to the next cycle.
  app.patch('/connect/subscriptions/:subscriptionId', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { subscriptionId } = request.params as { subscriptionId: string };
    const body = request.body as {
      priceId: string;
      prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
    };

    if (!body.priceId) return reply.status(400).send({ error: 'priceId is required' });

    const rows = await db.select().from(stripeSubscriptions)
      .where(eq(stripeSubscriptions.stripeSubscriptionId, subscriptionId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Subscription not found' });

    const row = rows[0]!;

    // Retrieve the live subscription to get the current item ID
    let currentSub: Stripe.Subscription;
    try {
      currentSub = await stripe.subscriptions.retrieve(subscriptionId, {}, { stripeAccount: row.stripeAccountId });
    } catch (err) {
      const e = err as { message?: string };
      return reply.status(422).send({ error: e.message ?? 'Could not retrieve subscription' });
    }

    const currentItem = currentSub.items.data[0];
    if (!currentItem) return reply.status(422).send({ error: 'No subscription items found' });

    // Swap the price — Stripe creates a proration invoice automatically
    let updated: Stripe.Subscription;
    try {
      updated = await stripe.subscriptions.update(
        subscriptionId,
        {
          items: [{ id: currentItem.id, price: body.priceId }],
          proration_behavior: body.prorationBehavior ?? 'create_prorations',
        },
        { stripeAccount: row.stripeAccountId },
      );
    } catch (err) {
      const e = err as { message?: string };
      return reply.status(422).send({ error: e.message ?? 'Could not update subscription' });
    }

    await db.update(stripeSubscriptions)
      .set({ stripePriceId: body.priceId, status: updated.status, updatedAt: new Date() })
      .where(eq(stripeSubscriptions.stripeSubscriptionId, subscriptionId));

    return reply.send({ subscriptionId: updated.id, status: updated.status, priceId: body.priceId });
  });

  // ── Create invoice for merchant's customer ───────────────────────────────────
  // orgId is always taken from the authenticated JWT — never from the request body.
  app.post('/connect/invoices', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId: jwtOrgId } = request.user as { orgId: string };
    const body = request.body as {
      orgId?: string; stripeCustomerId?: string; customerEmail?: string;
      customerName?: string; customerId?: string;
      items: { description: string; amount: number; quantity: number }[];
      dueDate?: string; memo?: string; autoSend: boolean;
    };
    // Always use JWT orgId, ignore any orgId in body
    body.orgId = jwtOrgId;

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
      // Store display info in metadata so the list endpoint doesn't need Stripe calls
      metadata: {
        customerName: body.customerName ?? null,
        customerEmail: body.customerEmail ?? null,
        memo: body.memo ?? null,
      },
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

  // ── Void a draft or open invoice ────────────────────────────────────────────
  app.post('/connect/invoices/:invoiceId/void', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };

    const rows = await db.select().from(stripeInvoices)
      .where(eq(stripeInvoices.stripeInvoiceId, invoiceId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Invoice not found' });

    try {
      await stripe.invoices.voidInvoice(invoiceId, {}, { stripeAccount: rows[0]!.stripeAccountId });
    } catch (err) {
      const e = err as { message?: string };
      return reply.status(422).send({ error: e.message ?? 'Cannot void invoice' });
    }

    await db.update(stripeInvoices)
      .set({ status: 'void', updatedAt: new Date() })
      .where(eq(stripeInvoices.stripeInvoiceId, invoiceId));

    return reply.send({ voided: true });
  });

  // ── Mark invoice paid out-of-band (cash / offline payment) ──────────────────
  app.post('/connect/invoices/:invoiceId/mark-paid', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };

    const rows = await db.select().from(stripeInvoices)
      .where(eq(stripeInvoices.stripeInvoiceId, invoiceId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Invoice not found' });

    try {
      // paid_out_of_band marks the invoice as paid without charging the customer
      await stripe.invoices.pay(
        invoiceId,
        { paid_out_of_band: true },
        { stripeAccount: rows[0]!.stripeAccountId },
      );
    } catch (err) {
      const e = err as { message?: string };
      return reply.status(422).send({ error: e.message ?? 'Cannot mark invoice as paid' });
    }

    const stripeInv = await stripe.invoices.retrieve(invoiceId, { stripeAccount: rows[0]!.stripeAccountId });
    await db.update(stripeInvoices)
      .set({ status: 'paid', amountPaid: stripeInv.amount_paid, updatedAt: new Date() })
      .where(eq(stripeInvoices.stripeInvoiceId, invoiceId));

    return reply.send({ paid: true });
  });

  // ── Storefront checkout session (Stripe Hosted Checkout) ─────────────────────
  // This is a customer-facing route — no user JWT. The orgId is resolved from
  // the slug via a database lookup against the organisations table.
  app.post('/connect/checkout-session', {
  }, async (request, reply) => {
    const body = request.body as {
      slug: string;
      items: { id: string; name: string; price: number; quantity: number }[];
      customer: { name: string; email: string; phone?: string };
      successUrl: string;
      cancelUrl: string;
    };

    // Resolve org from slug via DB lookup — never fall back to a hardcoded default
    const orgRow = await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.slug, body.slug))
      .limit(1);
    if (orgRow.length === 0) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Storefront not found',
        status: 404,
      });
    }
    const orgId = orgRow[0]!.id;

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
  // orgId is always taken from the authenticated JWT — never from the request body.
  app.post('/connect/payment-intent', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId: jwtOrgId } = request.user as { orgId: string };
    const body = request.body as {
      orgId?: string; amount: number; currency: string; description?: string; metadata?: Record<string, string>;
    };
    // Always use JWT orgId, ignore any orgId in body
    body.orgId = jwtOrgId;

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
