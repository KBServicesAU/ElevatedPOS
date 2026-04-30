/**
 * Reservations API
 *
 * Supports two booking types:
 *   - restaurant: party size, table assignment, date/time, optional deposit
 *   - service:    staff member, service type, duration, date/time, optional deposit
 *
 * Public endpoints (no auth) are used by the embeddable booking widget.
 * Authenticated endpoints are used by the dashboard.
 *
 * Deposits are collected via Stripe PaymentIntents on the merchant's
 * connected Stripe account (ElevatedPOS Pay).
 */
import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { reservations, reservationSettings, stripeConnectAccounts, organisations } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', { apiVersion: '2024-06-20' });

// ── Default opening hours (Mon–Sun, 08:00–22:00) ──────────────────────────────
const DEFAULT_HOURS: Record<string, { open: string; close: string; closed: boolean }> = {
  mon: { open: '08:00', close: '22:00', closed: false },
  tue: { open: '08:00', close: '22:00', closed: false },
  wed: { open: '08:00', close: '22:00', closed: false },
  thu: { open: '08:00', close: '22:00', closed: false },
  fri: { open: '08:00', close: '22:00', closed: false },
  sat: { open: '09:00', close: '23:00', closed: false },
  sun: { open: '10:00', close: '21:00', closed: false },
};

export async function reservationsRoutes(app: FastifyInstance) {

  // ──────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED ROUTES (dashboard)
  // ──────────────────────────────────────────────────────────────────────────

  // GET /reservations — list reservations for org
  app.get('/reservations', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { from, to, status, type } = request.query as {
      from?: string; to?: string; status?: string; type?: string;
    };

    const conditions = [eq(reservations.orgId, orgId)];
    if (from) conditions.push(gte(reservations.scheduledAt, new Date(from)));
    if (to) conditions.push(lte(reservations.scheduledAt, new Date(to)));
    if (status) conditions.push(eq(reservations.status as Parameters<typeof eq>[0], status as never));
    if (type) conditions.push(eq(reservations.bookingType, type));

    const rows = await db.select().from(reservations)
      .where(and(...conditions))
      .orderBy(desc(reservations.scheduledAt))
      .limit(200);

    return reply.send({ reservations: rows });
  });

  // GET /reservations/count — v2.7.97. POS sidebar badge fuel: counts
  // upcoming bookings split by `bookingType` so a hospitality org sees
  // restaurant reservation pressure separately from a services org's
  // appointment book. "Upcoming" = scheduled today or in the future,
  // status not cancelled / no_show. Polled every 30s by the mobile app.
  app.get('/reservations/count', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const rows = await db.select({
      bookingType: reservations.bookingType,
      status: reservations.status,
      scheduledAt: reservations.scheduledAt,
    }).from(reservations).where(
      and(
        eq(reservations.orgId, orgId),
        gte(reservations.scheduledAt, startOfToday),
      ),
    );

    let restaurantToday = 0;
    let restaurantUpcoming = 0;
    let serviceToday = 0;
    let serviceUpcoming = 0;
    const tomorrowStart = new Date(startOfToday);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    for (const r of rows) {
      if (r.status === 'cancelled' || r.status === 'no_show') continue;
      const isToday = r.scheduledAt && r.scheduledAt < tomorrowStart;
      if (r.bookingType === 'service') {
        serviceUpcoming += 1;
        if (isToday) serviceToday += 1;
      } else {
        // 'restaurant' or any legacy/unknown type buckets to restaurant
        restaurantUpcoming += 1;
        if (isToday) restaurantToday += 1;
      }
    }

    return reply.send({
      data: {
        restaurant: { today: restaurantToday, upcoming: restaurantUpcoming },
        service:    { today: serviceToday,    upcoming: serviceUpcoming    },
      },
    });
  });

  // POST /reservations — create from dashboard
  app.post('/reservations', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = request.body as {
      bookingType: 'restaurant' | 'service';
      customerName: string; customerEmail: string; customerPhone?: string;
      scheduledAt: string; durationMinutes?: number;
      partySize?: number; tableId?: string;
      serviceId?: string; staffEmployeeId?: string;
      notes?: string; locationId?: string;
    };

    const endsAt = body.durationMinutes
      ? new Date(new Date(body.scheduledAt).getTime() + body.durationMinutes * 60_000)
      : undefined;

    const [row] = await db.insert(reservations).values({
      orgId,
      locationId: body.locationId ?? null,
      bookingType: body.bookingType,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone ?? null,
      scheduledAt: new Date(body.scheduledAt),
      endsAt: endsAt ?? null,
      partySize: body.partySize ?? null,
      tableId: body.tableId ?? null,
      serviceId: body.serviceId ?? null,
      staffEmployeeId: body.staffEmployeeId ?? null,
      durationMinutes: body.durationMinutes ?? null,
      notes: body.notes ?? null,
      source: 'dashboard',
    }).returning();

    return reply.status(201).send({ reservation: row });
  });

  // PATCH /reservations/:id — update status / table / notes
  app.patch('/reservations/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: string; tableId?: string; staffEmployeeId?: string;
      internalNotes?: string; notes?: string; scheduledAt?: string;
    };

    const rows = await db.select().from(reservations)
      .where(and(eq(reservations.id, id), eq(reservations.orgId, orgId))).limit(1);
    if (!rows[0]) return reply.status(404).send({ error: 'Reservation not found' });

    const updates: Partial<typeof reservations.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
    if (body.status) updates.status = body.status as NonNullable<typeof reservations.$inferInsert['status']>;
    if (body.tableId !== undefined) updates.tableId = body.tableId || null;
    if (body.staffEmployeeId !== undefined) updates.staffEmployeeId = body.staffEmployeeId || null;
    if (body.internalNotes !== undefined) updates.internalNotes = body.internalNotes;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.scheduledAt) updates.scheduledAt = new Date(body.scheduledAt);
    if (body.status === 'cancelled') updates.cancelledAt = new Date();

    const [updated] = await db.update(reservations).set(updates).where(eq(reservations.id, id)).returning();
    return reply.send({ reservation: updated });
  });

  // DELETE /reservations/:id — cancel + optional deposit refund
  app.delete('/reservations/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const rows = await db.select().from(reservations)
      .where(and(eq(reservations.id, id), eq(reservations.orgId, orgId))).limit(1);
    const row = rows[0];
    if (!row) return reply.status(404).send({ error: 'Reservation not found' });

    // Refund deposit if paid
    if (row.depositStatus === 'paid' && row.depositPaymentIntentId && row.depositStripeAccountId) {
      try {
        await stripe.refunds.create(
          { payment_intent: row.depositPaymentIntentId },
          { stripeAccount: row.depositStripeAccountId },
        );
        await db.update(reservations)
          .set({ depositStatus: 'refunded', depositRefundedAt: new Date(), status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(reservations.id, id));
        return reply.send({ cancelled: true, depositRefunded: true });
      } catch {
        // Fall through — cancel anyway but note refund failed
      }
    }

    await db.update(reservations)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(reservations.id, id));
    return reply.send({ cancelled: true, depositRefunded: false });
  });

  // GET /reservations/settings — get org reservation settings
  app.get('/reservations/settings', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    let settings = await db.query.reservationSettings.findFirst({
      where: eq(reservationSettings.orgId, orgId),
    });
    if (!settings) {
      // Auto-create default settings
      const [created] = await db.insert(reservationSettings).values({
        orgId, openingHours: DEFAULT_HOURS,
      }).returning();
      settings = created!;
    }
    return reply.send({ settings });
  });

  // PUT /reservations/settings — update reservation settings
  app.put('/reservations/settings', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = request.body as Partial<typeof reservationSettings.$inferInsert>;

    const existing = await db.query.reservationSettings.findFirst({
      where: eq(reservationSettings.orgId, orgId),
    });

    if (existing) {
      const [updated] = await db.update(reservationSettings)
        .set({ ...body, orgId, updatedAt: new Date() })
        .where(eq(reservationSettings.orgId, orgId))
        .returning();
      return reply.send({ settings: updated });
    } else {
      const [created] = await db.insert(reservationSettings)
        .values({ ...body, orgId, openingHours: body.openingHours ?? DEFAULT_HOURS })
        .returning();
      return reply.send({ settings: created });
    }
  });

  // GET /reservations/availability — compute available time slots
  app.get('/reservations/availability', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { date } = request.query as { date: string };
    if (!date) return reply.status(400).send({ error: 'date query param required (YYYY-MM-DD)' });

    const slots = await computeAvailableSlots(orgId, date);
    return reply.send({ date, slots });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PUBLIC ROUTES (widget — no auth, identified by org slug)
  // ──────────────────────────────────────────────────────────────────────────

  // GET /reservations/public/:slug/availability?date=YYYY-MM-DD
  app.get('/reservations/public/:slug/availability', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { date } = request.query as { date?: string };

    const org = await db.query.organisations.findFirst({ where: eq(organisations.slug, slug) });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    const slots = await computeAvailableSlots(org.id, date ?? new Date().toISOString().slice(0, 10));
    return reply.send({ date, slots });
  });

  // GET /reservations/public/:slug/settings — widget config (colors, deposit amounts)
  app.get('/reservations/public/:slug/settings', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await db.query.organisations.findFirst({ where: eq(organisations.slug, slug) });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    let settings = await db.query.reservationSettings.findFirst({
      where: eq(reservationSettings.orgId, org.id),
    });
    if (!settings) {
      settings = { id: '', orgId: org.id, restaurantEnabled: false, serviceEnabled: false,
        restaurantDepositRequired: false, restaurantDepositCents: 0,
        serviceDepositRequired: false, serviceDepositCents: 0,
        advanceBookingDays: 60, slotIntervalMinutes: 30, openingHours: DEFAULT_HOURS,
        widgetPrimaryColor: '#6366f1', widgetLogoUrl: null, widgetTitle: 'Book a Table',
        confirmationEmailEnabled: true, reminderEmailEnabled: true, reminderHoursBefore: 24,
        createdAt: new Date(), updatedAt: new Date() };
    }

    // Return only the public-safe subset
    return reply.send({
      restaurantEnabled: settings.restaurantEnabled,
      serviceEnabled: settings.serviceEnabled,
      restaurantDepositRequired: settings.restaurantDepositRequired,
      restaurantDepositCents: settings.restaurantDepositCents,
      serviceDepositRequired: settings.serviceDepositRequired,
      serviceDepositCents: settings.serviceDepositCents,
      advanceBookingDays: settings.advanceBookingDays,
      slotIntervalMinutes: settings.slotIntervalMinutes,
      openingHours: settings.openingHours,
      widgetPrimaryColor: settings.widgetPrimaryColor,
      widgetLogoUrl: settings.widgetLogoUrl,
      widgetTitle: settings.widgetTitle,
      orgName: org.name,
    });
  });

  // POST /reservations/public/:slug — create booking from widget
  app.post('/reservations/public/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = request.body as {
      bookingType: 'restaurant' | 'service';
      customerName: string; customerEmail: string; customerPhone?: string;
      scheduledAt: string; partySize?: number;
      serviceId?: string; staffEmployeeId?: string; durationMinutes?: number;
      notes?: string;
    };

    const org = await db.query.organisations.findFirst({ where: eq(organisations.slug, slug) });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    const settings = await db.query.reservationSettings.findFirst({
      where: eq(reservationSettings.orgId, org.id),
    });

    const endsAt = body.durationMinutes
      ? new Date(new Date(body.scheduledAt).getTime() + body.durationMinutes * 60_000)
      : undefined;

    // Determine if a deposit is required
    const needsDeposit = body.bookingType === 'restaurant'
      ? (settings?.restaurantDepositRequired && (settings?.restaurantDepositCents ?? 0) > 0)
      : (settings?.serviceDepositRequired && (settings?.serviceDepositCents ?? 0) > 0);
    const depositCents = body.bookingType === 'restaurant'
      ? (settings?.restaurantDepositCents ?? 0)
      : (settings?.serviceDepositCents ?? 0);

    // Create the reservation record
    const [reservation] = await db.insert(reservations).values({
      orgId: org.id,
      bookingType: body.bookingType,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone ?? null,
      scheduledAt: new Date(body.scheduledAt),
      endsAt: endsAt ?? null,
      partySize: body.partySize ?? null,
      serviceId: body.serviceId ?? null,
      staffEmployeeId: body.staffEmployeeId ?? null,
      durationMinutes: body.durationMinutes ?? null,
      notes: body.notes ?? null,
      source: 'widget',
      status: needsDeposit ? 'pending' : 'confirmed',
      depositStatus: needsDeposit ? 'pending' : 'none',
      depositAmountCents: needsDeposit ? depositCents : 0,
    }).returning();

    if (!needsDeposit) {
      return reply.status(201).send({
        reservationId: reservation!.id,
        depositRequired: false,
        status: 'confirmed',
      });
    }

    // Create Stripe PaymentIntent on the merchant's connected account
    const connectAccount = await db.query.stripeConnectAccounts.findFirst({
      where: eq(stripeConnectAccounts.orgId, org.id),
    });

    if (!connectAccount?.chargesEnabled) {
      // Fallback — confirm without deposit if Stripe not ready
      await db.update(reservations)
        .set({ status: 'confirmed', depositStatus: 'none', updatedAt: new Date() })
        .where(eq(reservations.id, reservation!.id));
      return reply.status(201).send({ reservationId: reservation!.id, depositRequired: false, status: 'confirmed' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: depositCents,
      currency: 'aud',
      payment_method_types: ['card'],
      metadata: { reservationId: reservation!.id, orgId: org.id, customerEmail: body.customerEmail },
      description: `Deposit for ${body.bookingType === 'restaurant' ? 'reservation' : 'appointment'} at ${org.name}`,
    }, { stripeAccount: connectAccount.stripeAccountId });

    await db.update(reservations)
      .set({
        depositStripeAccountId: connectAccount.stripeAccountId,
        depositPaymentIntentId: paymentIntent.id,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservation!.id));

    return reply.status(201).send({
      reservationId: reservation!.id,
      depositRequired: true,
      depositAmountCents: depositCents,
      clientSecret: paymentIntent.client_secret,
      stripePublishableKey: process.env['STRIPE_PUBLISHABLE_KEY'] ?? '',
      stripeAccountId: connectAccount.stripeAccountId,
      status: 'pending',
    });
  });

  // GET /reservations/public/:slug/deposit/:reservationId/status — poll deposit status
  app.get('/reservations/public/:slug/deposit/:reservationId/status', async (request, reply) => {
    const { reservationId } = request.params as { reservationId: string };
    const row = await db.query.reservations.findFirst({ where: eq(reservations.id, reservationId) });
    if (!row) return reply.status(404).send({ error: 'Reservation not found' });
    return reply.send({ depositStatus: row.depositStatus, status: row.status });
  });

  // POST /reservations/webhook/stripe — handles payment_intent.succeeded for deposits
  // Configure in Stripe Dashboard: events = payment_intent.succeeded, payment_intent.payment_failed
  app.post('/reservations/webhook/stripe', { config: { rawBody: true } }, async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    const secret = process.env['STRIPE_WEBHOOK_SECRET_RESERVATIONS'];
    if (!sig || !secret) return reply.status(400).send({ error: 'Missing webhook signature' });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body),
        sig as string, secret,
      );
    } catch {
      return reply.status(400).send({ error: 'Invalid webhook signature' });
    }

    const pi = event.data.object as Stripe.PaymentIntent;
    const reservationId = pi.metadata?.['reservationId'];
    if (!reservationId) return reply.send({ received: true });

    if (event.type === 'payment_intent.succeeded') {
      await db.update(reservations)
        .set({ depositStatus: 'paid', depositPaidAt: new Date(), status: 'confirmed', updatedAt: new Date() })
        .where(eq(reservations.id, reservationId));
    } else if (event.type === 'payment_intent.payment_failed') {
      await db.update(reservations)
        .set({ depositStatus: 'failed', status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(reservations.id, reservationId));
    }

    return reply.send({ received: true });
  });
}

// ── Availability slot calculator ───────────────────────────────────────────────

async function computeAvailableSlots(orgId: string, dateStr: string): Promise<string[]> {
  const settings = await db.query.reservationSettings.findFirst({
    where: eq(reservationSettings.orgId, orgId),
  });

  const hours = (settings?.openingHours as Record<string, { open: string; close: string; closed: boolean }>) ?? DEFAULT_HOURS;
  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(dateStr + 'T00:00:00').getDay()] ?? 'mon';
  const dayConfig = hours[dayKey];
  if (!dayConfig || dayConfig.closed) return [];

  const interval = settings?.slotIntervalMinutes ?? 30;
  const [openH, openM] = dayConfig.open.split(':').map(Number);
  const [closeH, closeM] = dayConfig.close.split(':').map(Number);
  const openMins = (openH ?? 8) * 60 + (openM ?? 0);
  const closeMins = (closeH ?? 22) * 60 + (closeM ?? 0);

  const slots: string[] = [];
  for (let m = openMins; m < closeMins; m += interval) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${dateStr}T${hh}:${mm}:00`);
  }

  // Filter out already-booked slots (simple: any confirmed/pending booking in the slot)
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59`);
  const existing = await db.select({ scheduledAt: reservations.scheduledAt })
    .from(reservations)
    .where(and(
      eq(reservations.orgId, orgId),
      gte(reservations.scheduledAt, dayStart),
      lte(reservations.scheduledAt, dayEnd),
    ));

  const bookedTimes = new Set(existing.map((r) => r.scheduledAt.toISOString().slice(0, 16)));
  return slots.filter((s) => !bookedTimes.has(s.slice(0, 16)));
}
