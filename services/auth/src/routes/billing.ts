/**
 * ElevatedPOS Per-Device Billing Routes
 *
 * Pricing model (all AUD/month):
 *   POS device    $49
 *   KDS device    $19
 *   Kiosk device  $49
 *   Display device $19
 *   Dashboard     FREE
 *   Website add-on $15
 *   Custom domain add-on $5
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET_BILLING
 *   STRIPE_PRICE_POS            — Price ID for POS device ($49/mo)
 *   STRIPE_PRICE_KDS            — Price ID for KDS device ($19/mo)
 *   STRIPE_PRICE_KIOSK          — Price ID for Kiosk device ($49/mo)
 *   STRIPE_PRICE_DISPLAY        — Price ID for Display device ($19/mo)
 *   STRIPE_PRICE_WEBSITE_ADDON  — Price ID for Website add-on ($15/mo)
 *   STRIPE_PRICE_DOMAIN_ADDON   — Price ID for Custom Domain add-on ($5/mo)
 *   DASHBOARD_URL               — Portal return URL
 */
import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { DEVICE_PRICE_CENTS as PRICING_CENTS } from '../lib/pricing.js';

function getStripe(): Stripe {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' });
}

// ── Per-device Stripe Price IDs ───────────────────────────────────────────────

const DEVICE_PRICE_IDS: Record<string, string> = {
  pos:     process.env['STRIPE_PRICE_POS']           ?? '',
  kds:     process.env['STRIPE_PRICE_KDS']           ?? '',
  kiosk:   process.env['STRIPE_PRICE_KIOSK']         ?? '',
  display: process.env['STRIPE_PRICE_DISPLAY']       ?? '',
};

const ADDON_PRICE_IDS: Record<string, string> = {
  website:       process.env['STRIPE_PRICE_WEBSITE_ADDON'] ?? '',
  customDomain:  process.env['STRIPE_PRICE_DOMAIN_ADDON']  ?? '',
};

// Flat unit amounts in cents (used for UI display / fallback when no Stripe key configured).
// v2.7.51 — pricing harmonised with the new per-device model:
//   POS $49 · KDS $29 · Kiosk $39 · Signage/Display $19. Dashboard remains free.
// (`display` here is the same device type as `signage` on the storefront —
// kept under the legacy column name so existing org_subscription_items rows
// don't have to migrate.)
export const DEVICE_PRICE_CENTS: Record<string, number> = {
  pos:     4900,
  kds:     2900,
  kiosk:   3900,
  display: 1900,
  dashboard: 0,
};

export const ADDON_PRICE_CENTS: Record<string, number> = {
  website:      1500,
  customDomain:  500,
};

// ── Device selection schema (reused in multiple endpoints) ────────────────────

const deviceSelectionSchema = z.object({
  pos:     z.number().int().min(0).default(0),
  kds:     z.number().int().min(0).default(0),
  kiosk:   z.number().int().min(0).default(0),
  display: z.number().int().min(0).default(0),
  websiteAddon:      z.boolean().default(false),
  customDomainAddon: z.boolean().default(false),
});

type DeviceSelection = z.infer<typeof deviceSelectionSchema>;

/**
 * Build the Stripe subscription items array from a device selection.
 * Skips device types with quantity 0 and types with no configured price ID.
 */
function buildStripeItems(sel: DeviceSelection): Stripe.SubscriptionCreateParams.Item[] {
  const items: Stripe.SubscriptionCreateParams.Item[] = [];

  for (const [type, qty] of Object.entries({ pos: sel.pos, kds: sel.kds, kiosk: sel.kiosk, display: sel.display })) {
    if ((qty as number) > 0 && DEVICE_PRICE_IDS[type]) {
      items.push({ price: DEVICE_PRICE_IDS[type]!, quantity: qty as number });
    }
  }

  if (sel.websiteAddon && ADDON_PRICE_IDS['website']) {
    items.push({ price: ADDON_PRICE_IDS['website']!, quantity: 1 });
  }
  if (sel.customDomainAddon && ADDON_PRICE_IDS['customDomain']) {
    items.push({ price: ADDON_PRICE_IDS['customDomain']!, quantity: 1 });
  }

  return items;
}

// ── Per-device pricing schema (v2.7.51) ───────────────────────────────────────
// New per-device pricing model: merchant declares # locations, # devices
// per type per location. Prices: POS $49, KDS $29, Kiosk $39, Signage $19.
// The storefront onboarding flow stores this on the org via /pending-selection
// before advancing to Stripe Connect + /setup.
const perDeviceSelectionSchema = z.object({
  locations: z.array(z.object({
    name: z.string().max(100).optional(),
    pos:     z.number().int().min(0),
    kds:     z.number().int().min(0),
    kiosk:   z.number().int().min(0),
    signage: z.number().int().min(0),
  })).min(1, 'At least one location is required'),
});

export async function billingRoutes(app: FastifyInstance) {

  // ── POST /api/v1/billing/pending-selection ───────────────────────────────
  // Storefront step 2 — persist the merchant's chosen per-device pricing
  // (locations × devices) before they move on to payment-account / billing.
  // Stored as JSON on organisations.pending_device_selection so it can be
  // re-read on /billing/setup to build the Stripe subscription.
  app.post('/pending-selection', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const parsed = perDeviceSelectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 400,
        detail: parsed.error.message,
        issues: parsed.error.issues,
      });
    }

    // Sum quantities across all locations into a flat pos/kds/kiosk/signage total.
    // We persist BOTH the flat totals (used by /setup to call Stripe) and the
    // per-location breakdown (used to render the dashboard summary).
    const totals = parsed.data.locations.reduce(
      (acc, l) => ({
        pos:     acc.pos     + l.pos,
        kds:     acc.kds     + l.kds,
        kiosk:   acc.kiosk   + l.kiosk,
        signage: acc.signage + l.signage,
      }),
      { pos: 0, kds: 0, kiosk: 0, signage: 0 },
    );

    // Map "signage" (storefront naming) → "display" (existing internal naming
    // used by DEVICE_PRICE_CENTS / billing/setup). Same device type, just a
    // friendlier label for merchants on the signup form.
    // Source-of-truth prices come from lib/pricing.ts (PRICING_CENTS):
    //   pos $49 · kds $29 · kiosk $39 · signage(=display) $19.
    await db.update(schema.organisations)
      .set({
        pendingDeviceSelection: {
          locations: parsed.data.locations,
          pos:     totals.pos,
          kds:     totals.kds,
          kiosk:   totals.kiosk,
          display: totals.signage,
          // Pricing snapshot at signup time (so a future price change
          // doesn't silently re-charge an already-onboarded merchant).
          unitPriceCents: {
            pos:     PRICING_CENTS.pos,
            kds:     PRICING_CENTS.kds,
            kiosk:   PRICING_CENTS.kiosk,
            display: PRICING_CENTS.signage,
          },
        },
        billingModel: 'per_device',
        updatedAt: new Date(),
      })
      .where(eq(schema.organisations.id, user.orgId));

    const monthlyTotalCents =
      totals.pos     * PRICING_CENTS.pos +
      totals.kds     * PRICING_CENTS.kds +
      totals.kiosk   * PRICING_CENTS.kiosk +
      totals.signage * PRICING_CENTS.signage;

    return reply.send({
      data: {
        ...totals,
        deviceCount: totals.pos + totals.kds + totals.kiosk + totals.signage,
        monthlyTotalCents,
      },
    });
  });

  // ── POST /api/v1/billing/welcome-email ───────────────────────────────────
  // v2.7.51 — fires the merchant welcome email AFTER the subscription
  // payment has succeeded (storefront /onboard/complete calls this on mount).
  // Idempotent: tracks a `welcomeEmailSentAt` flag inside org.settings JSONB
  // so refreshing the complete page doesn't spam the merchant with duplicates.
  app.post('/welcome-email', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const NOTIFICATIONS_API_URL = process.env['NOTIFICATIONS_API_URL'] ?? 'http://notifications:4009';
    const APP_URL = process.env['APP_URL'] ?? 'https://app.elevatedpos.com.au';

    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    const settings = (org.settings ?? {}) as Record<string, unknown>;
    if (settings['welcomeEmailSentAt']) {
      return reply.send({ ok: true, alreadySent: true });
    }

    // Find the owner employee (oldest by createdAt) for the salutation + recipient.
    const owner = await db.query.employees.findFirst({
      where: eq(schema.employees.orgId, org.id),
      orderBy: (e, { asc }) => [asc(e.createdAt)],
    });
    if (!owner) return reply.status(404).send({ error: 'Owner not found' });

    const internalToken = app.jwt.sign(
      { sub: owner.id, orgId: org.id, role: 'system' },
      { expiresIn: '5m' },
    );

    const dashboardUrl = `${APP_URL}/dashboard`;
    const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f0f0f2;margin:0;padding:0">
  <div style="max-width:620px;margin:40px auto;padding:0 16px">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
      <div style="background:#09090b;padding:32px 40px;text-align:center">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#fff;border-radius:14px;font-size:30px;font-weight:900;color:#09090b;font-family:Georgia,serif">E</div>
        <div style="color:#fff;font-size:16px;font-weight:600;letter-spacing:.6px;margin-top:10px;opacity:.85">ElevatedPOS</div>
      </div>
      <div style="padding:40px">
        <h1 style="color:#09090b;font-size:22px;margin:0 0 12px">You're all set, ${owner.firstName}!</h1>
        <p style="color:#52525b;font-size:15px;line-height:1.7;margin:0 0 16px">
          Your <strong>${org.name}</strong> ElevatedPOS subscription is active. Your devices are ready to set up.
        </p>
        <p style="color:#52525b;font-size:15px;line-height:1.7;margin:0 0 24px">
          From your dashboard you can add staff, build your menu, configure printers, and start taking payments.
        </p>
        <div style="text-align:center;margin:28px 0">
          <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#fff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none">Go to your dashboard →</a>
        </div>
        <p style="font-size:13px;color:#a1a1aa;line-height:1.6;margin:0">
          Need help? We're here at <a href="mailto:support@elevatedpos.com.au" style="color:#71717a">support@elevatedpos.com.au</a>.
        </p>
      </div>
    </div>
  </div>
</body></html>`;

    try {
      await fetch(`${NOTIFICATIONS_API_URL}/api/v1/notifications/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalToken}` },
        body: JSON.stringify({
          to: owner.email,
          subject: `Welcome to ElevatedPOS, ${owner.firstName}!`,
          template: 'custom',
          orgId: org.id,
          data: { body: html },
        }),
      });
    } catch (err) {
      console.error('[billing/welcome-email] send failed:', err);
      // Don't fail the request — the merchant has already paid. Just retry next time.
      return reply.status(502).send({ ok: false, error: 'Email send failed' });
    }

    await db.update(schema.organisations)
      .set({
        settings: { ...settings, welcomeEmailSentAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(schema.organisations.id, org.id));

    return reply.send({ ok: true, alreadySent: false });
  });

  // ── GET /api/v1/billing/preview ──────────────────────────────────────────
  // Returns the active subscription items if one exists, otherwise falls back
  // to the persisted pendingDeviceSelection. Used by the storefront /onboard/
  // subscription page to show the merchant exactly what they're paying for.
  app.get('/preview', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    // Prefer live subscription items if a subscription exists
    const items = await db.select().from(schema.orgSubscriptionItems)
      .where(eq(schema.orgSubscriptionItems.orgId, org.id));

    if (items.length > 0) {
      const totals: Record<string, number> = { pos: 0, kds: 0, kiosk: 0, display: 0 };
      let monthlyTotalCents = 0;
      for (const it of items) {
        totals[it.deviceType] = it.quantity;
        monthlyTotalCents += it.quantity * it.unitAmountCents;
      }
      return reply.send({
        data: {
          pos:     totals.pos     ?? 0,
          kds:     totals.kds     ?? 0,
          kiosk:   totals.kiosk   ?? 0,
          display: totals.display ?? 0,
          monthlyTotalCents,
        },
      });
    }

    // Fall back to pendingDeviceSelection
    const pending = (org.pendingDeviceSelection ?? {}) as Record<string, unknown>;
    const pos     = typeof pending['pos']     === 'number' ? pending['pos']     as number : 0;
    const kds     = typeof pending['kds']     === 'number' ? pending['kds']     as number : 0;
    const kiosk   = typeof pending['kiosk']   === 'number' ? pending['kiosk']   as number : 0;
    const display = typeof pending['display'] === 'number' ? pending['display'] as number : 0;

    const monthlyTotalCents =
      pos     * (DEVICE_PRICE_CENTS['pos']     ?? 0) +
      kds     * (DEVICE_PRICE_CENTS['kds']     ?? 0) +
      kiosk   * (DEVICE_PRICE_CENTS['kiosk']   ?? 0) +
      display * (DEVICE_PRICE_CENTS['display'] ?? 0);

    return reply.send({
      data: { pos, kds, kiosk, display, monthlyTotalCents },
    });
  });

  // ── POST /api/v1/billing/setup ────────────────────────────────────────────
  // Creates Stripe customer + subscription from a device selection.
  // Body: { pos, kds, kiosk, display, websiteAddon, customDomainAddon }
  // (or empty — falls back to the stored pendingDeviceSelection from
  // /pending-selection in the storefront flow).
  // Called at the end of the onboarding wizard after Stripe Connect is done.
  app.post('/setup', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    // v2.7.51 — if the storefront already saved a per-device selection on the
    // org, prefer that over an explicit body. This lets the storefront call
    // /setup with no body after the merchant fills out the device-count form,
    // without re-sending the same numbers.
    const persisted = (org.pendingDeviceSelection ?? {}) as Record<string, unknown>;
    const bodyHasFields = request.body && typeof request.body === 'object'
      && Object.keys(request.body).some(k => ['pos','kds','kiosk','display','websiteAddon','customDomainAddon'].includes(k));
    const inputBody = bodyHasFields ? request.body : {
      pos:     typeof persisted['pos']     === 'number' ? persisted['pos']     : 0,
      kds:     typeof persisted['kds']     === 'number' ? persisted['kds']     : 0,
      kiosk:   typeof persisted['kiosk']   === 'number' ? persisted['kiosk']   : 0,
      display: typeof persisted['display'] === 'number' ? persisted['display'] : 0,
    };

    const parsed = deviceSelectionSchema.safeParse(inputBody);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });

    const sel = parsed.data;

    const stripe = getStripe();

    // Create or retrieve Stripe customer
    let stripeCustomerId = org.stripeCustomerId ?? undefined;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        ...(org.billingEmail ? { email: org.billingEmail } : {}),
        name: org.name,
        metadata: { orgId: org.id },
      });
      stripeCustomerId = customer.id;
      await db.update(schema.organisations)
        .set({ stripeCustomerId })
        .where(eq(schema.organisations.id, org.id));
    }

    // Build subscription items
    const items = buildStripeItems(sel);

    if (items.length === 0) {
      // Dashboard-only org — no charge, just mark active
      await db.update(schema.organisations)
        .set({
          billingModel: 'per_device',
          subscriptionStatus: 'active',
          websiteAddonEnabled: sel.websiteAddon,
          customDomainAddonEnabled: sel.customDomainAddon,
          updatedAt: new Date(),
        })
        .where(eq(schema.organisations.id, org.id));
      return reply.send({ data: { stripeCustomerId, subscriptionId: null } });
    }

    // Create subscription (collect payment immediately — no trial)
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items,
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { orgId: org.id },
    });

    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | null;

    // Store subscription items in DB
    for (const [type, qty] of Object.entries({ pos: sel.pos, kds: sel.kds, kiosk: sel.kiosk, display: sel.display })) {
      if ((qty as number) <= 0) continue;
      const priceId = DEVICE_PRICE_IDS[type];
      if (!priceId) continue;
      const stripeItem = subscription.items.data.find((it) => it.price.id === priceId);
      await db.insert(schema.orgSubscriptionItems)
        .values({
          orgId: org.id,
          deviceType: type as 'pos' | 'kds' | 'kiosk' | 'display' | 'dashboard',
          quantity: qty as number,
          stripeSubscriptionItemId: stripeItem?.id ?? null,
          stripePriceId: priceId,
          unitAmountCents: DEVICE_PRICE_CENTS[type] ?? 0,
        })
        .onConflictDoUpdate({
          target: [schema.orgSubscriptionItems.orgId, schema.orgSubscriptionItems.deviceType],
          set: { quantity: qty as number, stripeSubscriptionItemId: stripeItem?.id ?? null, updatedAt: new Date() },
        });
    }

    await db.update(schema.organisations)
      .set({
        billingModel: 'per_device',
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status as 'incomplete' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'paused',
        subscriptionCurrentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
        websiteAddonEnabled: sel.websiteAddon,
        customDomainAddonEnabled: sel.customDomainAddon,
        updatedAt: new Date(),
      })
      .where(eq(schema.organisations.id, org.id));

    return reply.send({
      data: {
        stripeCustomerId,
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret: paymentIntent?.client_secret ?? null,
      },
    });
  });

  // ── PATCH /api/v1/billing/items ───────────────────────────────────────────
  // Adjust device quantities for an existing subscription.
  // Body: { pos?, kds?, kiosk?, display?, websiteAddon?, customDomainAddon? }
  app.patch('/items', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const parsed = deviceSelectionSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation error' });

    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org?.stripeSubscriptionId) return reply.status(400).send({ error: 'No active subscription' });

    const stripe = getStripe();
    const updates = parsed.data;

    for (const [type, qty] of Object.entries(updates)) {
      if (type === 'websiteAddon' || type === 'customDomainAddon') continue;
      if (qty === undefined) continue;
      const priceId = DEVICE_PRICE_IDS[type];
      if (!priceId) continue;

      const [existing] = await db.select()
        .from(schema.orgSubscriptionItems)
        .where(and(
          eq(schema.orgSubscriptionItems.orgId, org.id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eq(schema.orgSubscriptionItems.deviceType as any, type),
        ));

      if (existing?.stripeSubscriptionItemId) {
        if ((qty as number) > 0) {
          await stripe.subscriptionItems.update(existing.stripeSubscriptionItemId, { quantity: qty as number });
        } else {
          await stripe.subscriptionItems.del(existing.stripeSubscriptionItemId, { proration_behavior: 'create_prorations' });
        }
        await db.update(schema.orgSubscriptionItems)
          .set({ quantity: qty as number, updatedAt: new Date() })
          .where(eq(schema.orgSubscriptionItems.id, existing.id));
      } else if ((qty as number) > 0) {
        const newItem = await stripe.subscriptionItems.create({
          subscription: org.stripeSubscriptionId,
          price: priceId,
          quantity: qty as number,
        });
        await db.insert(schema.orgSubscriptionItems)
          .values({
            orgId: org.id,
            deviceType: type as 'pos' | 'kds' | 'kiosk' | 'display' | 'dashboard',
            quantity: qty as number,
            stripeSubscriptionItemId: newItem.id,
            stripePriceId: priceId,
            unitAmountCents: DEVICE_PRICE_CENTS[type] ?? 0,
          })
          .onConflictDoUpdate({
            target: [schema.orgSubscriptionItems.orgId, schema.orgSubscriptionItems.deviceType],
            set: { quantity: qty as number, stripeSubscriptionItemId: newItem.id, updatedAt: new Date() },
          });
      }
    }

    // Handle add-ons
    const addonUpdates: Partial<{ websiteAddonEnabled: boolean; customDomainAddonEnabled: boolean }> = {};
    if (updates.websiteAddon !== undefined) addonUpdates.websiteAddonEnabled = updates.websiteAddon;
    if (updates.customDomainAddon !== undefined) addonUpdates.customDomainAddonEnabled = updates.customDomainAddon;
    if (Object.keys(addonUpdates).length > 0) {
      await db.update(schema.organisations)
        .set({ ...addonUpdates, updatedAt: new Date() })
        .where(eq(schema.organisations.id, org.id));
    }

    return reply.send({ updated: true });
  });

  // ── GET /api/v1/billing/status ────────────────────────────────────────────
  app.get('/status', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    const items = await db.select().from(schema.orgSubscriptionItems)
      .where(eq(schema.orgSubscriptionItems.orgId, org.id));

    return reply.send({
      data: {
        billingModel: org.billingModel,
        subscriptionStatus: org.subscriptionStatus,
        stripeSubscriptionId: org.stripeSubscriptionId ?? null,
        subscriptionCurrentPeriodEnd: org.subscriptionCurrentPeriodEnd ?? null,
        websiteAddonEnabled: org.websiteAddonEnabled,
        customDomainAddonEnabled: org.customDomainAddonEnabled,
        items: items.map((it) => ({
          deviceType: it.deviceType,
          quantity: it.quantity,
          unitAmountCents: it.unitAmountCents,
          monthlyTotalCents: it.quantity * it.unitAmountCents,
        })),
        monthlyTotalCents: items.reduce((sum, it) => sum + it.quantity * it.unitAmountCents, 0)
          + (org.websiteAddonEnabled ? ADDON_PRICE_CENTS['website']! : 0)
          + (org.customDomainAddonEnabled ? ADDON_PRICE_CENTS['customDomain']! : 0),
      },
    });
  });

  // ── GET /api/v1/billing/portal ─────────────────────────────────────────────
  app.get('/portal', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org?.stripeCustomerId) return reply.status(400).send({ error: 'No billing account found' });

    const stripe = getStripe();
    const returnUrl = process.env['DASHBOARD_URL'] ?? 'https://app.elevatedpos.com.au/dashboard/billing';
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: returnUrl,
    });
    return reply.send({ data: { url: session.url } });
  });

  // ── POST /api/v1/billing/webhook ──────────────────────────────────────────
  app.post('/webhook', { config: { rawBody: true } }, async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET_BILLING'];
    if (!sig || !webhookSecret) return reply.status(400).send({ error: 'Missing Stripe signature' });

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(
        (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body),
        sig as string,
        webhookSecret,
      );
    } catch {
      return reply.status(400).send({ error: 'Webhook signature verification failed' });
    }

    const sub = event.data.object as Stripe.Subscription;
    const orgId = sub.metadata?.['orgId'];
    if (!orgId) return reply.send({ received: true });

    const toStatus = (s: string): 'incomplete' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'paused' => {
      if (s === 'trialing') return 'trialing';
      if (s === 'active') return 'active';
      if (s === 'past_due') return 'past_due';
      if (s === 'canceled' || s === 'cancelled') return 'cancelled';
      return 'paused';
    };

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await db.update(schema.organisations)
          .set({
            subscriptionStatus: toStatus(sub.status),
            stripeSubscriptionId: sub.id,
            subscriptionCurrentPeriodEnd: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000),
            updatedAt: new Date(),
          })
          .where(eq(schema.organisations.id, orgId));
        break;

      case 'customer.subscription.deleted':
        await db.update(schema.organisations)
          .set({ subscriptionStatus: 'cancelled', updatedAt: new Date() })
          .where(eq(schema.organisations.id, orgId));
        break;
    }

    return reply.send({ received: true });
  });
}
