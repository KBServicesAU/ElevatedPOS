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

// Flat unit amounts in cents (used for UI display / fallback when no Stripe key configured)
export const DEVICE_PRICE_CENTS: Record<string, number> = {
  pos:     4900,
  kds:     1900,
  kiosk:   4900,
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

export async function billingRoutes(app: FastifyInstance) {

  // ── POST /api/v1/billing/setup ────────────────────────────────────────────
  // Creates Stripe customer + subscription from a device selection.
  // Body: { pos, kds, kiosk, display, websiteAddon, customDomainAddon }
  // Called at the end of the onboarding wizard after Stripe Connect is done.
  app.post('/setup', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const parsed = deviceSelectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });

    const sel = parsed.data;
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, user.orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

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
