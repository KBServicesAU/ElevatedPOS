import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { stripeConnectAccounts, hardwareOrders } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
  apiVersion: '2024-06-20',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve the Stripe Connect account ID for the requesting org. */
async function getStripeAccountId(orgId: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ stripeAccountId: stripeConnectAccounts.stripeAccountId })
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId))
      .limit(1);

    return rows[0]?.stripeAccountId ?? null;
  } catch {
    return null;
  }
}

// ── Hardware catalog (hardcoded — Stripe hardware varies by region) ───────────

const HARDWARE_CATALOG = [
  {
    id: 'bbpos_wisepos_e',
    name: 'Stripe Reader S700',
    description: 'Smart countertop reader with a 5" touchscreen. Supports tap, chip and swipe. WiFi + Ethernet.',
    price_cents: 34900,
    currency: 'aud',
    image: 'https://images.ctfassets.net/fzn2n1nzq965/5WMvMBVFkClJPFfzFYcbH7/2f27e3a94b4823ee95d8b10e5fd6b2ed/S700.png',
    features: ['Tap to Pay', 'Chip & PIN', 'Swipe', 'WiFi', 'Ethernet', '5" display'],
    available: true,
  },
  {
    id: 'stripe_m2',
    name: 'Stripe Reader M2',
    description: 'Compact Bluetooth card reader. Works with iOS and Android. Tap, chip and swipe.',
    price_cents: 9900,
    currency: 'aud',
    image: 'https://images.ctfassets.net/fzn2n1nzq965/6J9e38GOQ0S3EbHxaI1AuH/7e71d64a0ed6ada3e6ed636bc7f62d40/M2.png',
    features: ['Tap to Pay', 'Chip & PIN', 'Swipe', 'Bluetooth'],
    available: true,
  },
  {
    id: 'bbpos_chipper_2x_bt',
    name: 'BBPOS Chipper 2X BT',
    description: 'Slim, portable Bluetooth reader. Supports tap and chip.',
    price_cents: 7900,
    currency: 'aud',
    image: 'https://images.ctfassets.net/fzn2n1nzq965/h1v6R6w2b1l7oCCKiWPg7/f3def43eba67f7fd012b7432f7f8aaf0/Chipper.png',
    features: ['Tap to Pay', 'Chip & PIN', 'Bluetooth'],
    available: true,
  },
  {
    id: 'verifone_p400',
    name: 'Verifone Reader P400',
    description: 'Customer-facing countertop reader with a 3.5" display. USB-C connectivity.',
    price_cents: 24900,
    currency: 'aud',
    image: 'https://images.ctfassets.net/fzn2n1nzq965/4BFhF5FwMvpT0N7pPxaJr0/a6c67843f64d5faa62bbd7d03551bb22/P400.png',
    features: ['Tap to Pay', 'Chip & PIN', 'Swipe', 'USB-C', '3.5" display'],
    available: false,
  },
];

// ── Route plugin ─────────────────────────────────────────────────────────────

export async function terminalHardwareRoutes(app: FastifyInstance) {

  // ── Readers ──────────────────────────────────────────────────────────────

  /** List all registered readers for the connected account. */
  app.get('/connect/terminal/readers', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const accountId = await getStripeAccountId(orgId);
    if (!accountId) return reply.status(404).send({ error: 'No Stripe account found' });

    try {
      const readers = await stripe.terminal.readers.list(
        { limit: 100 },
        { stripeAccount: accountId },
      );
      return { readers: readers.data };
    } catch (err) {
      app.log.error({ err }, '[terminal] list readers failed');
      return reply.status(502).send({ error: 'Failed to list readers' });
    }
  });

  /** Register a new reader using a registration code. */
  app.post<{
    Body: { registration_code: string; label?: string; location?: string };
  }>('/connect/terminal/readers', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { registration_code, label, location } = request.body;

    if (!registration_code) {
      return reply.status(400).send({ error: 'registration_code is required' });
    }

    const accountId = await getStripeAccountId(orgId);
    if (!accountId) return reply.status(404).send({ error: 'No Stripe account found' });

    try {
      const reader = await stripe.terminal.readers.create(
        {
          registration_code,
          ...(label ? { label } : {}),
          ...(location ? { location } : {}),
        },
        { stripeAccount: accountId },
      );
      return reply.status(201).send({ reader });
    } catch (err) {
      const stripeErr = err as { code?: string; message?: string };
      app.log.error({ err }, '[terminal] register reader failed');
      return reply.status(422).send({ error: stripeErr.message ?? 'Failed to register reader' });
    }
  });

  /** Delete (deregister) a reader. */
  app.delete<{ Params: { readerId: string } }>(
    '/connect/terminal/readers/:readerId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId } = request.user as { orgId: string };
      const { readerId } = request.params;

      const accountId = await getStripeAccountId(orgId);
      if (!accountId) return reply.status(404).send({ error: 'No Stripe account found' });

      try {
        await stripe.terminal.readers.del(readerId, { stripeAccount: accountId });
        return reply.status(204).send();
      } catch (err) {
        app.log.error({ err }, '[terminal] delete reader failed');
        return reply.status(502).send({ error: 'Failed to delete reader' });
      }
    },
  );

  // ── Locations ─────────────────────────────────────────────────────────────

  /** List all terminal locations for the connected account. */
  app.get('/connect/terminal/locations', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const accountId = await getStripeAccountId(orgId);
    if (!accountId) return reply.status(404).send({ error: 'No Stripe account found' });

    try {
      const locations = await stripe.terminal.locations.list(
        { limit: 100 },
        { stripeAccount: accountId },
      );
      return { locations: locations.data };
    } catch (err) {
      app.log.error({ err }, '[terminal] list locations failed');
      return reply.status(502).send({ error: 'Failed to list locations' });
    }
  });

  /** Create a new terminal location under the connected account. */
  app.post<{
    Body: {
      display_name: string;
      address: {
        line1: string;
        city: string;
        state: string;
        postal_code: string;
        country: string;
      };
    };
  }>('/connect/terminal/locations', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { display_name, address } = request.body;

    if (!display_name || !address?.line1) {
      return reply.status(400).send({ error: 'display_name and address.line1 are required' });
    }

    const accountId = await getStripeAccountId(orgId);
    if (!accountId) return reply.status(404).send({ error: 'No Stripe account found' });

    try {
      const location = await stripe.terminal.locations.create(
        { display_name, address },
        { stripeAccount: accountId },
      );
      return reply.status(201).send({ location });
    } catch (err) {
      const stripeErr = err as { message?: string };
      app.log.error({ err }, '[terminal] create location failed');
      return reply.status(422).send({ error: stripeErr.message ?? 'Failed to create location' });
    }
  });

  // ── Reader Display Configuration (splash screen) ──────────────────────────

  /**
   * Get the current reader configuration for the connected account.
   * Returns the account-default Configuration including the splash screen URL if set.
   */
  app.get('/connect/terminal/config', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const accountId = await getStripeAccountId(orgId);
    if (!accountId) return reply.status(404).send({ error: 'No Stripe account found' });

    try {
      // Fetch the account-default configuration
      const configs = await (stripe.terminal.configurations as unknown as {
        list: (
          params: { is_account_default?: boolean; limit?: number },
          options: { stripeAccount: string },
        ) => Promise<{ data: Array<{ id: string; splashscreen?: unknown }> }>;
      }).list({ is_account_default: true, limit: 1 }, { stripeAccount: accountId });

      const config = configs.data[0] ?? null;
      return { config };
    } catch (err) {
      app.log.error({ err }, '[terminal] get config failed');
      return reply.status(502).send({ error: 'Failed to fetch configuration' });
    }
  });

  /**
   * Update the reader display config — sets a splash screen image URL.
   * The image must be publicly accessible HTTPS, ≤4096×4096, JPEG or PNG.
   * Stripe resizes it to fit the reader display automatically.
   */
  app.put<{
    Body: {
      splash_screen_url?: string;
      /**
       * Set to true to clear the splash screen and revert to the default Stripe logo.
       */
      clear_splash_screen?: boolean;
    };
  }>('/connect/terminal/config', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { splash_screen_url, clear_splash_screen } = request.body;

    const accountId = await getStripeAccountId(orgId);
    if (!accountId) return reply.status(404).send({ error: 'No Stripe account found' });

    // Validate URL if provided
    if (splash_screen_url) {
      try {
        const url = new URL(splash_screen_url);
        if (url.protocol !== 'https:') {
          return reply.status(400).send({ error: 'splash_screen_url must be an HTTPS URL' });
        }
      } catch {
        return reply.status(400).send({ error: 'Invalid splash_screen_url' });
      }
    }

    type StripeConfigurations = {
      list: (
        params: { is_account_default?: boolean; limit?: number },
        options: { stripeAccount: string },
      ) => Promise<{ data: Array<{ id: string }> }>;
      create: (
        params: Record<string, unknown>,
        options: { stripeAccount: string },
      ) => Promise<{ id: string }>;
      update: (
        id: string,
        params: Record<string, unknown>,
        options: { stripeAccount: string },
      ) => Promise<{ id: string }>;
    };

    const configurationsApi = stripe.terminal.configurations as unknown as StripeConfigurations;

    try {
      // Look up existing account-default config
      const existing = await configurationsApi.list(
        { is_account_default: true, limit: 1 },
        { stripeAccount: accountId },
      );

      const splashParams = clear_splash_screen
        ? {}
        : splash_screen_url
          ? { splashscreen: { landscape_url: splash_screen_url } }
          : null;

      if (splashParams === null) {
        return reply.status(400).send({ error: 'Provide splash_screen_url or clear_splash_screen: true' });
      }

      let updatedConfig: { id: string };
      if (existing.data.length > 0) {
        // Update existing account-default config
        updatedConfig = await configurationsApi.update(
          existing.data[0]!.id,
          splashParams,
          { stripeAccount: accountId },
        );
      } else {
        // Create a new config (becomes account-default)
        updatedConfig = await configurationsApi.create(
          { ...splashParams, is_account_default: true },
          { stripeAccount: accountId },
        );
      }

      return { config: updatedConfig };
    } catch (err) {
      const stripeErr = err as { message?: string };
      app.log.error({ err }, '[terminal] update config failed');
      return reply.status(422).send({ error: stripeErr.message ?? 'Failed to update configuration' });
    }
  });

  // ── Hardware catalog & order requests ─────────────────────────────────────

  /** Return the hardcoded hardware catalog. */
  app.get('/connect/hardware/catalog', { preHandler: [app.authenticate] }, async (_request, _reply) => {
    return { catalog: HARDWARE_CATALOG };
  });

  /**
   * Submit a hardware order request.
   * Since Stripe's Hardware Orders API is in preview and requires special approval,
   * we store the request in our database for manual fulfillment by the ElevatedPOS team.
   */
  app.post<{
    Body: {
      items: Array<{ catalog_object_id: string; quantity: number }>;
      shipping: {
        address: {
          line1: string;
          line2?: string;
          city: string;
          state: string;
          postal_code: string;
          country: string;
        };
        name: string;
        phone?: string;
        email: string;
      };
    };
  }>('/connect/hardware/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { items, shipping } = request.body;

    if (!items?.length || !shipping?.address?.line1 || !shipping?.name || !shipping?.email) {
      return reply.status(400).send({
        error: 'items, shipping.address, shipping.name, and shipping.email are required',
      });
    }

    // Validate all requested items are in the catalog and available
    for (const item of items) {
      const catalogItem = HARDWARE_CATALOG.find((c) => c.id === item.catalog_object_id);
      if (!catalogItem) {
        return reply.status(400).send({ error: `Unknown catalog item: ${item.catalog_object_id}` });
      }
      if (!catalogItem.available) {
        return reply.status(400).send({ error: `${catalogItem.name} is currently unavailable` });
      }
    }

    // Calculate order total
    const lineItems = items.map((item) => {
      const catalogItem = HARDWARE_CATALOG.find((c) => c.id === item.catalog_object_id)!;
      return {
        catalog_object_id: item.catalog_object_id,
        name: catalogItem.name,
        unit_price_cents: catalogItem.price_cents,
        quantity: item.quantity,
        subtotal_cents: catalogItem.price_cents * item.quantity,
      };
    });
    const total_cents = lineItems.reduce((sum, l) => sum + l.subtotal_cents, 0);

    try {
      // Store the order request for manual fulfillment
      const [order] = await db
        .insert(hardwareOrders)
        .values({
          orgId,
          status: 'pending',
          lineItems: JSON.stringify(lineItems),
          shippingName: shipping.name,
          shippingEmail: shipping.email,
          shippingPhone: shipping.phone ?? null,
          shippingAddressLine1: shipping.address.line1,
          shippingAddressLine2: shipping.address.line2 ?? null,
          shippingCity: shipping.address.city,
          shippingState: shipping.address.state,
          shippingPostalCode: shipping.address.postal_code,
          shippingCountry: shipping.address.country,
          totalCents: total_cents,
          currency: 'aud',
        })
        .returning();

      app.log.info({ orderId: order?.id, orgId, total_cents }, '[terminal] hardware order submitted');

      return reply.status(201).send({
        order: {
          id: order?.id,
          status: 'pending',
          line_items: lineItems,
          total_cents,
          currency: 'aud',
          message: 'Your order has been received. Our team will contact you within 1–2 business days to confirm and process your hardware order.',
        },
      });
    } catch (err) {
      app.log.error({ err }, '[terminal] hardware order insert failed');
      // Even if DB insert fails, acknowledge the request — operator can follow up
      return reply.status(202).send({
        order: {
          status: 'received',
          line_items: lineItems,
          total_cents,
          currency: 'aud',
          message: 'Your order has been received. Our team will contact you shortly.',
        },
      });
    }
  });

  /** List hardware orders for the requesting org. */
  app.get('/connect/hardware/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    try {
      const orders = await db
        .select()
        .from(hardwareOrders)
        .where(eq(hardwareOrders.orgId, orgId))
        .orderBy(desc(hardwareOrders.createdAt))
        .limit(50);

      return { orders };
    } catch (err) {
      app.log.error({ err }, '[terminal] list hardware orders failed');
      return reply.status(502).send({ error: 'Failed to list orders' });
    }
  });
}
