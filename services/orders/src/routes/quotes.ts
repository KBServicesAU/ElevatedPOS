import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';
import { generateOrderNumber } from '../lib/orderNumber';
import { publishEvent } from '../lib/kafka';

let quoteCounter = 1;
function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  const seq = String(quoteCounter++).padStart(6, '0');
  return `QUO-${year}-${seq}`;
}

// v2.7.37 — the dashboard quote form is ad-hoc: it captures customer
// name/email/phone, free-form line items (productName / qty / unitPrice,
// no catalog link), and `discountPct` rather than `discountPercent`.
// Before this change the Zod schema required `productId`, `sku`,
// `lineTotal`, `locationId`, and `discountPercent` — all of which the
// dashboard didn't send, so every save failed with HTTP 422
// "Validation Error". The quotes table stores items as JSONB so the
// flexibility is fine at the storage layer; just need to accept both
// shapes here.
const quoteItemSchema = z.object({
  // Catalog-linked (POS path) OR free-form (dashboard path) — either works.
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  // Dashboard sends `productName`; POS sends `name`. Accept either.
  name: z.string().optional(),
  productName: z.string().optional(),
  sku: z.string().optional(),
  // Dashboard uses `qty`; POS uses `quantity`. Accept either (normalized below).
  quantity: z.number().positive().optional(),
  qty: z.number().positive().optional(),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  lineTotal: z.number().min(0).optional(),
}).refine((i) => !!(i.name ?? i.productName), {
  message: 'Item requires a name or productName',
}).refine((i) => i.quantity !== undefined || i.qty !== undefined, {
  message: 'Item requires quantity (or qty)',
});

const createQuoteSchema = z.object({
  locationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  // Dashboard sends customerName/email/phone for ad-hoc quotes.
  // Stored verbatim as metadata inside the items JSONB — no DB migration.
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerPhone: z.string().optional(),
  items: z.array(quoteItemSchema).min(1),
  // Accept both the dashboard's `discountPct` and the POS's `discountPercent`.
  discountPercent: z.number().min(0).max(100).optional(),
  discountPct:     z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  // Dashboard can send '' when the user leaves the field blank; treat that
  // as "no expiry chosen" and fall back to 30 days from today so the quote
  // still has a validUntil on the row.
  validUntil: z.string().optional(),
  status: z.enum(['draft', 'sent']).optional(),
});

/** Normalize the two dashboard/POS shapes into a single POS-style shape. */
function normalizeItem(raw: z.infer<typeof quoteItemSchema>): {
  productId?: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountAmount: number;
  lineTotal: number;
} {
  const quantity = (raw.quantity ?? raw.qty ?? 0) as number;
  const unitPrice = raw.unitPrice;
  const discountAmount = raw.discountAmount ?? 0;
  const lineTotal = raw.lineTotal ?? (quantity * unitPrice - discountAmount);
  const name = (raw.name ?? raw.productName ?? 'Item') as string;
  return {
    ...(raw.productId !== undefined && { productId: raw.productId }),
    name,
    sku: raw.sku ?? '',
    quantity,
    unitPrice,
    taxRate: raw.taxRate ?? 0,
    discountAmount,
    lineTotal,
  };
}

const updateQuoteSchema = z.object({
  items: z.array(quoteItemSchema).min(1).optional(),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
  validUntil: z.string().optional(),
});

const convertQuoteSchema = z.object({
  locationId: z.string().uuid(),
  // Same fallback policy as createOrderSchema — devices paired without an
  // explicit register can still convert quotes; missing registerId becomes
  // locationId at the DB layer.
  registerId: z.string().uuid().optional(),
  channel: z.enum(['pos', 'online', 'kiosk', 'qr', 'marketplace', 'delivery', 'phone']).default('pos'),
});

function calcTotals(items: z.infer<typeof quoteItemSchema>[], discountPercent?: number | null) {
  // v2.7.37 — both `quantity` (POS) and `qty` (dashboard) are accepted,
  // so pick whichever is present. Same for discountAmount/taxRate which
  // have defaults baked into the schema.
  const qtyOf = (l: z.infer<typeof quoteItemSchema>) =>
    (l.quantity ?? l.qty ?? 0);
  const subtotal = items.reduce(
    (sum, l) => sum + qtyOf(l) * l.unitPrice - (l.discountAmount ?? 0),
    0,
  );
  const discountTotal = items.reduce((sum, l) => sum + (l.discountAmount ?? 0), 0);
  const percentDiscount = discountPercent ? subtotal * (discountPercent / 100) : 0;
  const taxableBase = subtotal - percentDiscount;
  const taxTotal = items.reduce((sum, l) => {
    const lineBase = qtyOf(l) * l.unitPrice - (l.discountAmount ?? 0);
    return sum + lineBase * ((l.taxRate ?? 0) / 100);
  }, 0);
  const total = taxableBase + taxTotal;
  return { subtotal, discountTotal: discountTotal + percentDiscount, taxTotal, total };
}

export async function quoteRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /api/v1/quotes — create quote from cart data
  app.post('/', async (request, reply) => {
    const { orgId, sub: createdBy } = request.user as { orgId: string; sub: string };
    const body = createQuoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    // v2.7.37 — locationId defaults
    // Dashboard ad-hoc quote form doesn't collect a location; POS always
    // sends one. When the dashboard omits it, fall back to the most
    // recent order's locationId for this org — cheaper than a cross-
    // service call into the auth service's locations table, and it's
    // guaranteed to be a real location the org operates at.
    let locationId = body.data.locationId ?? null;
    if (!locationId) {
      const lastOrder = await db.query.orders.findFirst({
        where: eq(schema.orders.orgId, orgId),
        orderBy: [desc(schema.orders.createdAt)],
        columns: { locationId: true },
      });
      locationId = lastOrder?.locationId ?? null;
    }
    if (!locationId) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'No location found',
        status: 422,
        detail: 'Create an order at any location first, or supply locationId in the quote payload.',
      });
    }

    // v2.7.37 — accept both `discountPct` (dashboard) and `discountPercent` (POS)
    const discountPct = body.data.discountPercent ?? body.data.discountPct ?? null;

    // Normalize items so calcTotals sees a consistent shape regardless of
    // whether the caller used POS-style or dashboard-style field names.
    const normalizedItems = body.data.items.map(normalizeItem);
    const { subtotal, discountTotal, taxTotal, total } = calcTotals(
      normalizedItems.map((n) => ({
        // Adapter back to the Zod item shape calcTotals expects.
        productId: n.productId,
        name: n.name,
        sku: n.sku,
        quantity: n.quantity,
        unitPrice: n.unitPrice,
        taxRate: n.taxRate,
        discountAmount: n.discountAmount,
        lineTotal: n.lineTotal,
      } as z.infer<typeof quoteItemSchema>)),
      discountPct,
    );

    // Default validUntil to 30 days from now if the caller omitted or sent empty string.
    const validUntilDate = body.data.validUntil
      ? new Date(body.data.validUntil)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Requested status: dashboard sends 'sent' to mean "email it"; both shapes
    // can just persist the status, we don't actually email here yet.
    const requestedStatus = body.data.status ?? 'draft';

    const quoteRows = await db.insert(schema.quotes).values({
      orgId,
      locationId,
      customerId: body.data.customerId ?? null,
      quoteNumber: generateQuoteNumber(),
      status: requestedStatus,
      // Preserve the caller's item shape in JSONB + stash ad-hoc customer
      // metadata in a sibling key so it round-trips on GET.
      items: {
        lineItems: normalizedItems,
        customer: body.data.customerId
          ? null
          : (body.data.customerName
            ? {
                name:  body.data.customerName,
                email: body.data.customerEmail || null,
                phone: body.data.customerPhone || null,
              }
            : null),
      } as unknown as object,
      subtotal: String(subtotal.toFixed(4)),
      discountTotal: String(discountTotal.toFixed(4)),
      taxTotal: String(taxTotal.toFixed(4)),
      total: String(total.toFixed(4)),
      discountPercent: discountPct != null ? String(discountPct) : null,
      notes: body.data.notes ?? null,
      validUntil: validUntilDate,
      createdBy,
    }).returning();
    const quote = quoteRows[0]!;

    await publishEvent('quote.created', {
      id: quote.id,
      orgId,
      quoteNumber: quote.quoteNumber,
      customerId: quote.customerId,
      total: quote.total,
      timestamp: new Date().toISOString(),
    });

    return reply.status(201).send({ data: quote });
  });

  // GET /api/v1/quotes — list quotes
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { status?: string; customerId?: string; limit?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);

    const results = await db.query.quotes.findMany({
      where: and(
        eq(schema.quotes.orgId, orgId),
        q.customerId ? eq(schema.quotes.customerId, q.customerId) : undefined,
      ),
      orderBy: [desc(schema.quotes.createdAt)],
      limit,
    });

    const filtered = q.status
      ? results.filter((r) => r.status === q.status)
      : results;

    return reply.status(200).send({ data: filtered, meta: { totalCount: filtered.length, hasMore: results.length === limit } });
  });

  // GET /api/v1/quotes/:id — get quote detail
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const quote = await db.query.quotes.findFirst({
      where: and(eq(schema.quotes.id, id), eq(schema.quotes.orgId, orgId)),
    });

    if (!quote) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: quote });
  });

  // PATCH /api/v1/quotes/:id — update quote
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = updateQuoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const quote = await db.query.quotes.findFirst({
      where: and(eq(schema.quotes.id, id), eq(schema.quotes.orgId, orgId)),
    });
    if (!quote) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!['draft', 'sent'].includes(quote.status)) {
      return reply.status(409).send({ title: 'Quote cannot be updated', status: 409, detail: `Quote status is ${quote.status}` });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (body.data.items) {
      const discountPercent = body.data.discountPercent !== undefined ? body.data.discountPercent : Number(quote.discountPercent ?? 0) || null;
      const { subtotal, discountTotal, taxTotal, total } = calcTotals(body.data.items, discountPercent);
      updateData['items'] = body.data.items;
      updateData['subtotal'] = String(subtotal.toFixed(4));
      updateData['discountTotal'] = String(discountTotal.toFixed(4));
      updateData['taxTotal'] = String(taxTotal.toFixed(4));
      updateData['total'] = String(total.toFixed(4));
    }

    if (body.data.discountPercent !== undefined) {
      updateData['discountPercent'] = body.data.discountPercent != null ? String(body.data.discountPercent) : null;
    }
    if (body.data.notes !== undefined) {
      updateData['notes'] = body.data.notes;
    }
    if (body.data.validUntil) {
      updateData['validUntil'] = new Date(body.data.validUntil);
    }

    const patchRows = await db.update(schema.quotes).set(updateData).where(
      and(eq(schema.quotes.id, id), eq(schema.quotes.orgId, orgId)),
    ).returning();
    const updated = patchRows[0]!;

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/quotes/:id/send — mark as sent
  app.post('/:id/send', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const quote = await db.query.quotes.findFirst({
      where: and(eq(schema.quotes.id, id), eq(schema.quotes.orgId, orgId)),
    });
    if (!quote) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (quote.status !== 'draft') {
      return reply.status(409).send({ title: 'Quote cannot be sent', status: 409, detail: `Quote status is ${quote.status}` });
    }

    const sentRows = await db.update(schema.quotes).set({
      status: 'sent',
      sentAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(schema.quotes.id, id), eq(schema.quotes.orgId, orgId))).returning();
    const updated = sentRows[0]!;

    await publishEvent('quote.sent', {
      id: updated.id,
      orgId,
      quoteNumber: updated.quoteNumber,
      customerId: updated.customerId,
      sentAt: updated.sentAt,
      timestamp: new Date().toISOString(),
    });

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/quotes/:id/convert — convert quote to order
  app.post('/:id/convert', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };
    const body = convertQuoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const quote = await db.query.quotes.findFirst({
      where: and(eq(schema.quotes.id, id), eq(schema.quotes.orgId, orgId)),
    });
    if (!quote) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!['draft', 'sent'].includes(quote.status)) {
      return reply.status(409).send({ title: 'Quote cannot be converted', status: 409, detail: `Quote status is ${quote.status}` });
    }

    // Create the order from quote items
    const items = quote.items as Array<{
      productId: string; variantId?: string; name: string; sku: string;
      quantity: number; unitPrice: number; taxRate: number; discountAmount: number; lineTotal: number;
    }>;

    const orderRows = await db.insert(schema.orders).values({
      orgId,
      locationId: body.data.locationId,
      registerId: body.data.registerId ?? body.data.locationId,
      orderNumber: generateOrderNumber('QUO'),
      channel: body.data.channel,
      orderType: 'quote',
      status: 'open',
      ...(quote.customerId != null && { customerId: quote.customerId }),
      employeeId,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      taxTotal: quote.taxTotal,
      total: quote.total,
      ...(quote.notes != null && { notes: quote.notes }),
    }).returning();
    const order = orderRows[0]!;

    await db.insert(schema.orderLines).values(items.map((l) => {
      const lineBase = l.quantity * l.unitPrice - l.discountAmount;
      const taxAmount = lineBase * (l.taxRate / 100);
      const lineTotal = lineBase + taxAmount;
      return {
        orderId: order.id,
        productId: l.productId,
        ...(l.variantId !== undefined && { variantId: l.variantId }),
        name: l.name,
        sku: l.sku,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        costPrice: '0',
        taxRate: String(l.taxRate),
        taxAmount: String(taxAmount.toFixed(4)),
        discountAmount: String(l.discountAmount),
        lineTotal: String(lineTotal.toFixed(4)),
        modifiers: [],
      };
    }));

    // Mark quote as accepted with reference to the new order
    const acceptedRows = await db.update(schema.quotes).set({
      status: 'accepted',
      acceptedAt: new Date(),
      convertedToOrderId: order.id,
      updatedAt: new Date(),
    }).where(and(eq(schema.quotes.id, id), eq(schema.quotes.orgId, orgId))).returning();
    const updatedQuote = acceptedRows[0]!;

    await publishEvent('quote.converted', {
      id: updatedQuote.id,
      orgId,
      quoteNumber: updatedQuote.quoteNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: updatedQuote.customerId,
      timestamp: new Date().toISOString(),
    });

    return reply.status(201).send({ data: { quote: updatedQuote, orderId: order.id, orderNumber: order.orderNumber } });
  });

  // POST /api/v1/quotes/:id/cancel — cancel quote
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const quote = await db.query.quotes.findFirst({
      where: and(eq(schema.quotes.id, id), eq(schema.quotes.orgId, orgId)),
    });
    if (!quote) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (['accepted', 'cancelled'].includes(quote.status)) {
      return reply.status(409).send({ title: 'Quote cannot be cancelled', status: 409, detail: `Quote status is ${quote.status}` });
    }

    const cancelledRows = await db.update(schema.quotes).set({
      status: 'cancelled',
      updatedAt: new Date(),
    }).where(and(eq(schema.quotes.id, id), eq(schema.quotes.orgId, orgId))).returning();
    const updated = cancelledRows[0]!;

    return reply.status(200).send({ data: updated });
  });
}
