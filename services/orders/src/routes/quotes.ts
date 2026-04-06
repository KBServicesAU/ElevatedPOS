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

const quoteItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  name: z.string(),
  sku: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  lineTotal: z.number().min(0),
});

const createQuoteSchema = z.object({
  locationId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  items: z.array(quoteItemSchema).min(1),
  discountPercent: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  validUntil: z.string(),
});

const updateQuoteSchema = z.object({
  items: z.array(quoteItemSchema).min(1).optional(),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
  validUntil: z.string().optional(),
});

const convertQuoteSchema = z.object({
  locationId: z.string().uuid(),
  registerId: z.string().uuid(),
  channel: z.enum(['pos', 'online', 'kiosk', 'qr', 'marketplace', 'delivery', 'phone']).default('pos'),
});

function calcTotals(items: z.infer<typeof quoteItemSchema>[], discountPercent?: number | null) {
  const subtotal = items.reduce((sum, l) => sum + l.quantity * l.unitPrice - l.discountAmount, 0);
  const discountTotal = items.reduce((sum, l) => sum + l.discountAmount, 0);
  const percentDiscount = discountPercent ? subtotal * (discountPercent / 100) : 0;
  const taxableBase = subtotal - percentDiscount;
  const taxTotal = items.reduce((sum, l) => {
    const lineBase = l.quantity * l.unitPrice - l.discountAmount;
    return sum + lineBase * (l.taxRate / 100);
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

    const { subtotal, discountTotal, taxTotal, total } = calcTotals(body.data.items, body.data.discountPercent);

    const quoteRows = await db.insert(schema.quotes).values({
      orgId,
      locationId: body.data.locationId,
      customerId: body.data.customerId ?? null,
      quoteNumber: generateQuoteNumber(),
      status: 'draft',
      items: body.data.items,
      subtotal: String(subtotal.toFixed(4)),
      discountTotal: String(discountTotal.toFixed(4)),
      taxTotal: String(taxTotal.toFixed(4)),
      total: String(total.toFixed(4)),
      discountPercent: body.data.discountPercent != null ? String(body.data.discountPercent) : null,
      notes: body.data.notes ?? null,
      validUntil: new Date(body.data.validUntil),
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
      registerId: body.data.registerId,
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
