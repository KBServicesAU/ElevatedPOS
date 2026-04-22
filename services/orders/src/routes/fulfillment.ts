import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { generateOrderNumber } from '../lib/orderNumber';

const CUSTOMERS_URL = process.env['CUSTOMERS_SERVICE_URL'] ?? 'http://customers:4006';
const NOTIFICATIONS_URL = process.env['NOTIFICATIONS_SERVICE_URL'] ?? 'http://notifications:4009';

/**
 * Resolve a customer for an ad-hoc click-and-collect order.
 *
 * v2.7.41 — when the merchant takes a phone/in-person C&C order without
 * selecting an existing customer, we now mint (or reuse) a real row in
 * the customers service so the order is properly linked for loyalty,
 * RFM, store credit, etc. Prior to this the contact details were only
 * stored in `order.notes` — which kept the DB clean but left the order
 * orphaned from the customer record.
 *
 * Strategy:
 *   1. If email present → search `GET /customers?search=<email>` and
 *      match exactly on `email` (ilike search may return fuzzy hits).
 *   2. If no match → POST `/customers` to create one.
 *   3. Return the resolved/created customerId, or null if the customers
 *      service is unreachable (caller continues — non-fatal, matches
 *      the existing loyalty + royalties graceful-degradation pattern).
 *
 * The caller's JWT is forwarded so auth stays in the user's context —
 * the customers service requires `iss: 'elevatedpos-auth'` on the token
 * so we can't use an internal service token with a different issuer.
 */
async function resolveOrCreateCustomer(opts: {
  orgId: string;
  authHeader: string;
  firstName: string;
  lastName: string;
  email?: string | undefined;
  phone?: string | undefined;
}): Promise<string | null> {
  const { authHeader, email, phone, firstName, lastName } = opts;
  const headers = { 'Content-Type': 'application/json', Authorization: authHeader };

  // 1. Look up by email — the customers search endpoint does ilike on
  // email so we match the returned row exactly below.
  if (email) {
    try {
      const res = await fetch(
        `${CUSTOMERS_URL}/api/v1/customers?search=${encodeURIComponent(email)}&limit=5`,
        { headers, signal: AbortSignal.timeout(3000) },
      );
      if (res.ok) {
        const body = (await res.json()) as { data?: Array<{ id: string; email: string | null }> };
        const hit = body.data?.find((c) => (c.email ?? '').toLowerCase() === email.toLowerCase());
        if (hit) return hit.id;
      }
    } catch {
      // Customers service unreachable — fall through to null (non-fatal)
      return null;
    }
  }

  // 2. No existing match — create one. Source = 'online' reflects the
  // C&C origin; merchant can re-tag later in the dashboard.
  try {
    const res = await fetch(`${CUSTOMERS_URL}/api/v1/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        firstName,
        lastName,
        ...(email && { email }),
        ...(phone && { phone }),
        source: 'online',
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { id?: string } };
      return body.data?.id ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Split a free-form "First Last" name into parts for the customers create
 * endpoint (which requires both). If only one word is supplied, use it as
 * the firstName and leave lastName empty but non-null.
 */
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { firstName: 'Customer', lastName: '' };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ') || '-';
  return { firstName, lastName };
}

/**
 * Parse the customer name/phone that the quick-create handler stashed in
 * a fulfillment's notes. Falls back to empty strings when a field is
 * missing (e.g. fulfillment created via the generic POST path without
 * our structured notes block).
 */
function parseFulfillmentContact(notes: string | null): { name: string; phone: string | null } {
  if (!notes) return { name: '', phone: null };
  const nameMatch = notes.match(/^Customer:\s*(.+)$/m);
  const phoneMatch = notes.match(/^Phone:\s*(.+)$/m);
  return {
    name: nameMatch?.[1]?.trim() ?? '',
    phone: phoneMatch?.[1]?.trim() ?? null,
  };
}

/**
 * Fire the "ready for pickup" notification for a C&C fulfillment that
 * just transitioned into `ready`. Best-effort — every step is wrapped
 * and swallowed so the status transition's 200 is never blocked.
 *
 * Resolution order for the customer's email:
 *   1. `order.customerId` → `GET /customers/:id` from the customers
 *      service (fresh, authoritative).
 *   2. Fall back to an email string embedded in the fulfillment's
 *      structured notes (the quick-create handler writes it there).
 *
 * SMS is sent alongside the email when a phone is available — the
 * notifications service has a mock-Twilio SMS route wired since v1,
 * so this works in dev without any carrier credentials.
 */
async function sendPickupReadyNotification(opts: {
  orgId: string;
  fulfillmentId: string;
  orderId: string;
  authHeader: string;
}): Promise<void> {
  const { orgId, fulfillmentId, orderId, authHeader } = opts;
  if (!authHeader.startsWith('Bearer ')) return;

  try {
    // Re-fetch the order + fulfillment so we have the freshest contact
    // info (customerId may have been written after the row was created).
    const [order, fulfillment] = await Promise.all([
      db.query.orders.findFirst({
        where: and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId)),
      }),
      db.query.fulfillmentRequests.findFirst({
        where: and(
          eq(schema.fulfillmentRequests.id, fulfillmentId),
          eq(schema.fulfillmentRequests.orgId, orgId),
        ),
      }),
    ]);
    if (!order || !fulfillment) return;

    const contact = parseFulfillmentContact(fulfillment.notes);

    let email: string | null = null;
    let customerName = contact.name || 'Customer';
    let phone: string | null = contact.phone;

    // Prefer the customers-service record when available. Falls back
    // to whatever was stashed in notes if the service is unreachable.
    if (order.customerId) {
      try {
        const res = await fetch(`${CUSTOMERS_URL}/api/v1/customers/${order.customerId}`, {
          headers: { Authorization: authHeader },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            data?: { email?: string | null; phone?: string | null; firstName?: string; lastName?: string };
          };
          if (body.data) {
            email = body.data.email ?? null;
            phone = body.data.phone ?? phone;
            const fn = (body.data.firstName ?? '').trim();
            const ln = (body.data.lastName ?? '').trim();
            if (fn || ln) customerName = `${fn} ${ln}`.trim() || customerName;
          }
        }
      } catch {
        // Fall through to notes-only fallback
      }
    }

    // If we still have no email, try pulling one out of the notes block.
    if (!email && fulfillment.notes) {
      const em = fulfillment.notes.match(/^Email:\s*(.+)$/m);
      if (em?.[1]) email = em[1].trim();
    }

    if (!email) return; // nothing to send

    const subject = `Your order ${order.orderNumber} is ready for pickup`;
    const message = `Hi ${customerName}, your order ${order.orderNumber} is ready to collect. See you soon!`;

    // Email — use the `custom` template (no purpose-built one exists
    // and spec says don't add one unless needed). Body is HTML.
    void fetch(`${NOTIFICATIONS_URL}/api/v1/notifications/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        to: email,
        subject,
        template: 'pickup_ready',
        orgId,
        data: {
          customerName,
          orderNumber: order.orderNumber,
        },
      }),
      signal: AbortSignal.timeout(3000),
    }).catch((err) => {
      console.error('[fulfillment] pickup-ready email failed', err instanceof Error ? err.message : err);
    });

    // SMS — best-effort, only when a phone is on file. Notifications
    // service has SMS plumbed (mock-Twilio) since v1.
    if (phone) {
      void fetch(`${NOTIFICATIONS_URL}/api/v1/notifications/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ to: phone, message, orgId }),
        signal: AbortSignal.timeout(3000),
      }).catch((err) => {
        console.error('[fulfillment] pickup-ready sms failed', err instanceof Error ? err.message : err);
      });
    }
  } catch (err) {
    console.error('[fulfillment] pickup-ready notification error', err instanceof Error ? err.message : err);
  }
}

const createFulfillmentSchema = z.object({
  orderId: z.string().uuid(),
  type: z.enum(['click_and_collect', 'ship_from_store', 'endless_aisle']),
  sourceLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const assignSchema = z.object({
  fulfillmentId: z.string().uuid(),
  employeeId: z.string().uuid(),
});

const clickAndCollectSchema = z.object({
  orderId: z.string().uuid(),
  pickupLocationId: z.string().uuid(),
  estimatedPickupAt: z.string().datetime().optional(),
});

// v2.7.40 — quick-create path used by the dashboard Click & Collect form.
// Dashboard doesn't have catalog-linked items (like POS does), it sends
// free-form line items (same shape as the quotes form: productName/qty/unitPrice).
// This creates an online channel order + click-and-collect fulfillment request
// in one call so merchants can take a phone/in-person C&C order without
// going through POS.
const quickCollectItemSchema = z.object({
  productName: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
});

const quickCollectSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerPhone: z.string().optional(),
  pickupLocationId: z.string().uuid().optional(),
  items: z.array(quickCollectItemSchema).min(1),
  notes: z.string().optional(),
  // ISO datetime — when the merchant expects to have it ready.
  pickupReadyAt: z.string().optional(),
});

export async function fulfillmentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /api/v1/fulfillment/click-and-collect/quick — create an ad-hoc
  // click-and-collect order from the dashboard form.
  //
  // Creates an `online` channel order + `click_and_collect` fulfillment
  // request in a single transaction so merchants can take phone/online
  // C&C orders without going through POS. Items are free-form (no catalog
  // link needed) and customer details are stored inline on the order/line
  // notes — no customers row is created.
  app.post('/click-and-collect/quick', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = quickCollectSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    // Resolve pickup location: caller-supplied wins; otherwise fall back to
    // the most recent order's locationId for this org (same pattern the
    // quotes endpoint uses for ad-hoc creation).
    let pickupLocationId = body.data.pickupLocationId ?? null;
    if (!pickupLocationId) {
      const lastOrder = await db.query.orders.findFirst({
        where: eq(schema.orders.orgId, orgId),
        orderBy: [desc(schema.orders.createdAt)],
        columns: { locationId: true },
      });
      pickupLocationId = lastOrder?.locationId ?? null;
    }
    if (!pickupLocationId) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'No pickup location found',
        status: 422,
        detail: 'Supply pickupLocationId or create any order first.',
      });
    }

    // Totals — inc-GST, same treatment as POS orders but simpler (no taxRate
    // on free-form items; it's an ad-hoc quick path, merchant can reconcile
    // via the full order editor if needed).
    const subtotalCents = body.data.items.reduce((sum, it) => {
      return sum + Math.round(it.qty * it.unitPrice * 100);
    }, 0);
    const subtotal = (subtotalCents / 100).toFixed(2);

    // Contact metadata is kept on the order's `notes` so it survives round-
    // trip without a schema change. Format is deliberately parseable.
    const customerLines = [
      `Customer: ${body.data.customerName}`,
      body.data.customerEmail ? `Email: ${body.data.customerEmail}` : null,
      body.data.customerPhone ? `Phone: ${body.data.customerPhone}` : null,
      body.data.pickupReadyAt ? `Pickup ready: ${body.data.pickupReadyAt}` : null,
      body.data.notes ? `Notes: ${body.data.notes}` : null,
    ].filter(Boolean).join('\n');

    // v2.7.41 — when the merchant hasn't pre-linked a customer, try to
    // resolve/create one in the customers service so loyalty/RFM/store-
    // credit actually see this order. Non-fatal: if the customers
    // service is down or the lookup fails we fall back to the legacy
    // notes-only behaviour so the slip still gets created.
    const authHeader = request.headers.authorization ?? '';
    const { firstName, lastName } = splitName(body.data.customerName);
    const emailClean = body.data.customerEmail && body.data.customerEmail.length > 0
      ? body.data.customerEmail
      : undefined;
    const resolvedCustomerId = authHeader.startsWith('Bearer ')
      ? await resolveOrCreateCustomer({
          orgId,
          authHeader,
          firstName,
          lastName,
          email: emailClean,
          phone: body.data.customerPhone,
        })
      : null;

    const orderRows = await db.insert(schema.orders).values({
      orgId,
      employeeId,
      locationId: pickupLocationId,
      registerId: pickupLocationId,
      orderNumber: generateOrderNumber('CNC'),
      channel: 'online',
      orderType: 'pickup',
      status: 'open',
      ...(resolvedCustomerId !== null && { customerId: resolvedCustomerId }),
      subtotal,
      discountTotal: '0.00',
      taxTotal: '0.00',
      total: subtotal,
      notes: customerLines,
    }).returning();
    const order = orderRows[0]!;

    // Insert line items. Placeholder UUID for productId since these are
    // free-form — the column is NOT NULL. Real catalog linking happens in
    // POS; this is just an ad-hoc slip.
    await db.insert(schema.orderLines).values(body.data.items.map((it) => {
      const lineTotalCents = Math.round(it.qty * it.unitPrice * 100);
      return {
        orderId: order.id,
        productId: '00000000-0000-0000-0000-000000000000',
        name: it.productName,
        sku: '',
        quantity: String(it.qty),
        unitPrice: String(it.unitPrice),
        costPrice: '0',
        taxRate: '0',
        taxAmount: '0.00',
        discountAmount: '0',
        lineTotal: (lineTotalCents / 100).toFixed(2),
        modifiers: [],
      };
    }));

    // Build the fulfillment request notes (structured so the list view can
    // surface customer name + pickup time without a JOIN).
    const fulfillmentNotes = [
      `Customer: ${body.data.customerName}`,
      body.data.customerEmail ? `Email: ${body.data.customerEmail}` : null,
      body.data.customerPhone ? `Phone: ${body.data.customerPhone}` : null,
      body.data.pickupReadyAt ? `Pickup ready: ${body.data.pickupReadyAt}` : null,
      body.data.notes ? `Notes: ${body.data.notes}` : null,
    ].filter(Boolean).join('\n');

    const fulfillmentRows = await db.insert(schema.fulfillmentRequests).values({
      orgId,
      orderId: order.id,
      type: 'click_and_collect',
      sourceLocationId: pickupLocationId,
      notes: fulfillmentNotes,
    }).returning();
    const fulfillment = fulfillmentRows[0]!;

    return reply.status(201).send({ data: { order, fulfillment } });
  });

  // GET /api/v1/fulfillment/click-and-collect/list — list C&C fulfillment
  // requests with order + customer context attached. Returns the exact
  // shape the dashboard needs — orderNumber, customer name, items
  // summary, status, readyAt — so the client doesn't have to JOIN.
  app.get('/click-and-collect/list', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 100), 200);

    const requests = await db.query.fulfillmentRequests.findMany({
      where: and(
        eq(schema.fulfillmentRequests.orgId, orgId),
        eq(schema.fulfillmentRequests.type, 'click_and_collect'),
      ),
      orderBy: [desc(schema.fulfillmentRequests.createdAt)],
      limit,
    });

    if (requests.length === 0) {
      return reply.status(200).send({ data: [], meta: { totalCount: 0 } });
    }

    // Parallel-fetch the referenced orders + their lines.
    const orderIds = [...new Set(requests.map((r) => r.orderId))];
    const [orders, lines] = await Promise.all([
      db.query.orders.findMany({
        where: and(eq(schema.orders.orgId, orgId), inArray(schema.orders.id, orderIds)),
      }),
      db.query.orderLines.findMany({
        where: inArray(schema.orderLines.orderId, orderIds),
      }),
    ]);
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const linesByOrder = new Map<string, typeof lines>();
    for (const l of lines) {
      const existing = linesByOrder.get(l.orderId);
      if (existing) existing.push(l);
      else linesByOrder.set(l.orderId, [l]);
    }

    // Parse customer name + pickup ready time from the fulfillment notes
    // (structured in the quick-create handler above).
    function parseNotes(notes: string | null): { customerName: string; pickupReadyAt: string | null } {
      if (!notes) return { customerName: 'Unknown', pickupReadyAt: null };
      const nameMatch = notes.match(/^Customer:\s*(.+)$/m);
      const pickupMatch = notes.match(/^Pickup ready:\s*(.+)$/m);
      return {
        customerName: nameMatch?.[1]?.trim() ?? 'Unknown',
        pickupReadyAt: pickupMatch?.[1]?.trim() ?? null,
      };
    }

    const data = requests.map((r) => {
      const order = orderById.get(r.orderId);
      const orderLines = linesByOrder.get(r.orderId) ?? [];
      const { customerName, pickupReadyAt } = parseNotes(r.notes);
      const itemsSummary = orderLines
        .map((l) => `${l.name}${Number(l.quantity) > 1 ? ` ×${Number(l.quantity)}` : ''}`)
        .join(', ');
      return {
        id: r.id,
        fulfillmentId: r.id,
        orderId: r.orderId,
        orderNumber: order?.orderNumber ?? '-',
        customerName,
        status: r.status,
        itemCount: orderLines.length,
        itemsSummary: itemsSummary || '—',
        total: order?.total ?? '0.00',
        sourceLocationId: r.sourceLocationId,
        pickupReadyAt,
        notes: r.notes,
        readyAt: r.readyAt,
        createdAt: r.createdAt,
      };
    });

    return reply.status(200).send({ data, meta: { totalCount: data.length } });
  });

  // POST /api/v1/fulfillment/click-and-collect — create a click-and-collect fulfillment request
  app.post('/click-and-collect', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = clickAndCollectSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, body.data.orderId), eq(schema.orders.orgId, orgId)),
    });
    if (!order) return reply.status(404).send({ title: 'Order Not Found', status: 404 });

    const clickCollectRows = await db
      .insert(schema.fulfillmentRequests)
      .values({
        orgId,
        orderId: body.data.orderId,
        type: 'click_and_collect',
        sourceLocationId: body.data.pickupLocationId,
        ...(body.data.estimatedPickupAt !== undefined && {
          notes: `Estimated pickup: ${body.data.estimatedPickupAt}`,
        }),
      })
      .returning();
    const created = clickCollectRows[0]!;

    return reply.status(201).send({ data: created });
  });

  // GET /api/v1/fulfillment/collect-queue — orders ready for collection at a location
  app.get('/collect-queue', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { locationId?: string };

    if (!q.locationId) {
      return reply.status(400).send({ title: 'Bad Request', status: 400, detail: 'locationId is required' });
    }

    const results = await db.query.fulfillmentRequests.findMany({
      where: and(
        eq(schema.fulfillmentRequests.orgId, orgId),
        eq(schema.fulfillmentRequests.status, 'ready'),
        eq(schema.fulfillmentRequests.sourceLocationId, q.locationId),
      ),
      orderBy: [desc(schema.fulfillmentRequests.readyAt)],
    });

    return reply.status(200).send({ data: results, meta: { totalCount: results.length } });
  });

  // POST /api/v1/fulfillment/assign — assign fulfillment to employee
  app.post('/assign', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = assignSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(
        eq(schema.fulfillmentRequests.id, body.data.fulfillmentId),
        eq(schema.fulfillmentRequests.orgId, orgId),
      ),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const assignRows = await db
      .update(schema.fulfillmentRequests)
      .set({ assignedToEmployeeId: body.data.employeeId, updatedAt: new Date() })
      .where(and(eq(schema.fulfillmentRequests.id, body.data.fulfillmentId), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();
    const updated = assignRows[0]!;

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/fulfillment — create a fulfillment request for an order
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createFulfillmentSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    // Verify the order belongs to this org
    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, body.data.orderId), eq(schema.orders.orgId, orgId)),
    });
    if (!order) return reply.status(404).send({ title: 'Order Not Found', status: 404 });

    const createRows = await db
      .insert(schema.fulfillmentRequests)
      .values({
        orgId,
        orderId: body.data.orderId,
        type: body.data.type,
        sourceLocationId: body.data.sourceLocationId,
        ...(body.data.destinationLocationId !== undefined && { destinationLocationId: body.data.destinationLocationId }),
        ...(body.data.notes !== undefined && { notes: body.data.notes }),
      })
      .returning();
    const created = createRows[0]!;

    return reply.status(201).send({ data: created });
  });

  // GET /api/v1/fulfillment — list fulfillment requests
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as {
      type?: string;
      status?: string;
      sourceLocationId?: string;
      assignedToEmployeeId?: string;
      limit?: string;
    };
    const limit = Math.min(Number(q.limit ?? 50), 200);

    const results = await db.query.fulfillmentRequests.findMany({
      where: and(
        eq(schema.fulfillmentRequests.orgId, orgId),
        q.type ? eq(schema.fulfillmentRequests.type, q.type as 'click_and_collect' | 'ship_from_store' | 'endless_aisle') : undefined,
        q.status ? eq(schema.fulfillmentRequests.status, q.status as 'pending' | 'picked' | 'packed' | 'ready' | 'dispatched' | 'collected' | 'cancelled') : undefined,
        q.sourceLocationId ? eq(schema.fulfillmentRequests.sourceLocationId, q.sourceLocationId) : undefined,
        q.assignedToEmployeeId ? eq(schema.fulfillmentRequests.assignedToEmployeeId, q.assignedToEmployeeId) : undefined,
      ),
      orderBy: [desc(schema.fulfillmentRequests.createdAt)],
      limit,
    });

    return reply.status(200).send({ data: results, meta: { totalCount: results.length, hasMore: results.length === limit } });
  });

  // GET /api/v1/fulfillment/:id — get fulfillment detail
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const result = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });

    if (!result) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: result });
  });

  // POST /api/v1/fulfillment/:id/pick — mark as picked
  app.post('/:id/pick', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (existing.status !== 'pending') {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot pick from status '${existing.status}'` });
    }

    const pickRows = await db
      .update(schema.fulfillmentRequests)
      .set({ status: 'picked', pickedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();
    const updatedPick = pickRows[0]!;

    return reply.status(200).send({ data: updatedPick });
  });

  // POST /api/v1/fulfillment/:id/pack — mark as packed
  app.post('/:id/pack', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (existing.status !== 'picked') {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot pack from status '${existing.status}'` });
    }

    const packRows = await db
      .update(schema.fulfillmentRequests)
      .set({ status: 'packed', packedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();
    const updatedPack = packRows[0]!;

    return reply.status(200).send({ data: updatedPack });
  });

  // POST /api/v1/fulfillment/:id/ready — mark ready for collection
  app.post('/:id/ready', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (existing.status !== 'packed') {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot mark ready from status '${existing.status}'` });
    }

    const now = new Date();
    const readyRows = await db
      .update(schema.fulfillmentRequests)
      .set({ status: 'ready', readyAt: now, customerNotifiedAt: now, updatedAt: now })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();
    const updatedReady = readyRows[0]!;

    // v2.7.41 — on transition to 'ready', fire a best-effort pickup-ready
    // email (and SMS if a phone is on file). Non-fatal: if the order has
    // no customer, the customer has no email, or the notifications/
    // customers service is unreachable, we log and return 200 as
    // before. The state transition has already been committed.
    void sendPickupReadyNotification({
      orgId,
      fulfillmentId: updatedReady.id,
      orderId: updatedReady.orderId,
      authHeader: request.headers.authorization ?? '',
    });

    return reply.status(200).send({ data: updatedReady });
  });

  // POST /api/v1/fulfillment/:id/dispatch — mark dispatched
  app.post('/:id/dispatch', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({
      trackingNumber: z.string().optional(),
      shippingCarrier: z.string().optional(),
      shippingLabel: z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!['packed', 'ready'].includes(existing.status)) {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot dispatch from status '${existing.status}'` });
    }

    const dispatchRows = await db
      .update(schema.fulfillmentRequests)
      .set({
        status: 'dispatched',
        dispatchedAt: new Date(),
        trackingNumber: body.data.trackingNumber ?? existing.trackingNumber,
        shippingCarrier: body.data.shippingCarrier ?? existing.shippingCarrier,
        shippingLabel: body.data.shippingLabel ?? existing.shippingLabel,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();
    const updatedDispatch = dispatchRows[0]!;

    return reply.status(200).send({ data: updatedDispatch });
  });

  // POST /api/v1/fulfillment/:id/collect — mark collected/delivered
  app.post('/:id/collect', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!['ready', 'dispatched'].includes(existing.status)) {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot collect from status '${existing.status}'` });
    }

    const collectRows = await db
      .update(schema.fulfillmentRequests)
      .set({ status: 'collected', collectedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();
    const updatedCollect = collectRows[0]!;

    return reply.status(200).send({ data: updatedCollect });
  });

  // POST /api/v1/fulfillment/:id/cancel — cancel
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().optional() }).safeParse(request.body ?? {});

    const existing = await db.query.fulfillmentRequests.findFirst({
      where: and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (['collected', 'cancelled'].includes(existing.status)) {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot cancel from status '${existing.status}'` });
    }

    const cancelRows = await db
      .update(schema.fulfillmentRequests)
      .set({
        status: 'cancelled',
        notes: body.success && body.data.reason ? body.data.reason : existing.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.fulfillmentRequests.id, id), eq(schema.fulfillmentRequests.orgId, orgId)))
      .returning();
    const updatedCancel = cancelRows[0]!;

    return reply.status(200).send({ data: updatedCancel });
  });
}
