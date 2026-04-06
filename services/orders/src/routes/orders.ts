import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';
import { generateOrderNumber, generateRefundNumber } from '../lib/orderNumber';
import { publishTypedEvent } from '../lib/kafka';
import { broadcastToKDS } from '../index';
import { createEvent, EVENT_TOPICS } from '@nexus/event-schemas';

const lineSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  name: z.string(),
  sku: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  costPrice: z.number().min(0).default(0),
  taxRate: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  modifiers: z.array(z.object({ groupId: z.string(), optionId: z.string(), name: z.string(), priceAdjustment: z.number() })).default([]),
  seatNumber: z.number().int().optional(),
  course: z.string().optional(),
  notes: z.string().optional(),
});

const createOrderSchema = z.object({
  locationId: z.string().uuid(),
  registerId: z.string().uuid(),
  channel: z.enum(['pos', 'online', 'kiosk', 'qr', 'marketplace', 'delivery', 'phone']).default('pos'),
  orderType: z.enum(['retail', 'dine_in', 'takeaway', 'delivery', 'pickup', 'layby', 'quote']).default('retail'),
  customerId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  covers: z.number().int().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

const refundSchema = z.object({
  reason: z.string().min(1),
  refundMethod: z.enum(['original', 'store_credit', 'cash', 'exchange']),
  lines: z.array(z.object({
    orderLineId: z.string().uuid(),
    quantity: z.number().positive(),
    amount: z.number().positive(),
  })).min(1),
});

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/orders
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { locationId?: string; status?: string; customerId?: string; from?: string; to?: string; limit?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);

    const results = await db.query.orders.findMany({
      where: and(
        eq(schema.orders.orgId, orgId),
        q.locationId ? eq(schema.orders.locationId, q.locationId) : undefined,
        q.customerId ? eq(schema.orders.customerId, q.customerId) : undefined,
      ),
      with: { lines: true },
      orderBy: [desc(schema.orders.createdAt)],
      limit,
    });

    return reply.status(200).send({ data: results, meta: { totalCount: results.length, hasMore: results.length === limit } });
  });

  // GET /api/v1/orders/:id
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)),
      with: { lines: true, refunds: true },
    });

    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: order });
  });

  // POST /api/v1/orders
  app.post('/', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = createOrderSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

    const { lines, ...orderData } = body.data;

    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice - l.discountAmount, 0);
    const discountTotal = lines.reduce((sum, l) => sum + l.discountAmount, 0);
    const taxTotal = lines.reduce((sum, l) => {
      const lineBase = l.quantity * l.unitPrice - l.discountAmount;
      return sum + lineBase * (l.taxRate / 100);
    }, 0);
    const total = subtotal + taxTotal;

    const orderRows = await db.insert(schema.orders).values({
      orgId,
      employeeId,
      locationId: orderData.locationId,
      registerId: orderData.registerId,
      orderNumber: generateOrderNumber(),
      channel: orderData.channel,
      orderType: orderData.orderType,
      ...(orderData.customerId !== undefined && { customerId: orderData.customerId }),
      ...(orderData.tableId !== undefined && { tableId: orderData.tableId }),
      ...(orderData.covers !== undefined && { covers: orderData.covers }),
      ...(orderData.notes !== undefined && { notes: orderData.notes }),
      subtotal: String(subtotal.toFixed(4)),
      discountTotal: String(discountTotal.toFixed(4)),
      taxTotal: String(taxTotal.toFixed(4)),
      total: String(total.toFixed(4)),
    }).returning();
    const order = orderRows[0]!;

    await db.insert(schema.orderLines).values(lines.map((l) => {
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
        costPrice: String(l.costPrice),
        taxRate: String(l.taxRate),
        taxAmount: String(taxAmount.toFixed(4)),
        discountAmount: String(l.discountAmount),
        lineTotal: String(lineTotal.toFixed(4)),
        modifiers: l.modifiers,
        ...(l.seatNumber !== undefined && { seatNumber: l.seatNumber }),
        ...(l.course !== undefined && { course: l.course }),
        ...(l.notes !== undefined && { notes: l.notes }),
      };
    }));

    const created = await db.query.orders.findFirst({
      where: eq(schema.orders.id, order.id),
      with: { lines: true },
    });

    // Publish typed event envelope — non-fatal if Kafka is unavailable
    if (created) {
      try {
        await publishTypedEvent(
          EVENT_TOPICS.ORDERS,
          createEvent(
            'order.created',
            orgId,
            {
              orderId: created.id,
              orderNumber: created.orderNumber,
              total: Number(created.total),
              customerId: created.customerId ?? undefined,
              lineCount: created.lines.length,
              channel: created.channel,
            },
            { locationId: created.locationId },
          ),
        );
      } catch (err) {
        console.error('[orders] Failed to publish order.created event', err);
      }
    }

    // Broadcast to connected KDS clients for this location
    if (created) {
      broadcastToKDS(created.locationId, {
        type: 'new_order',
        order: {
          orderId: created.id,
          orderNumber: created.orderNumber,
          orderType: created.orderType,
          channel: created.channel,
          tableId: created.tableId,
          locationId: created.locationId,
          lines: created.lines.map((l) => ({
            name: l.name,
            qty: Number(l.quantity),
            modifiers: (l.modifiers as { name: string }[]).map((m) => m.name),
            seatNumber: l.seatNumber,
            course: l.course,
            kdsDestination: l.kdsDestination ?? undefined,
          })),
          createdAt: created.createdAt.toISOString(),
          status: 'new',
        },
      });
    }

    return reply.status(201).send({ data: created });
  });

  // POST /api/v1/orders/:id/complete
  app.post('/:id/complete', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({ paidTotal: z.number(), changeGiven: z.number().default(0), receiptChannel: z.string().optional() }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (order.status !== 'open') return reply.status(409).send({ title: 'Order not open', status: 409 });

    const completeRows = await db.update(schema.orders).set({
      status: 'completed',
      paidTotal: String(body.data.paidTotal),
      changeGiven: String(body.data.changeGiven),
      ...(body.data.receiptChannel !== undefined && { receiptChannel: body.data.receiptChannel }),
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId))).returning();
    const updated = completeRows[0]!;

    try {
      await publishTypedEvent(
        EVENT_TOPICS.ORDERS,
        createEvent(
          'order.completed',
          orgId,
          {
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            total: Number(updated.total),
            paidTotal: body.data.paidTotal,
            customerId: updated.customerId ?? undefined,
            completedAt: updated.completedAt?.toISOString() ?? new Date().toISOString(),
          },
          { locationId: updated.locationId },
        ),
      );
    } catch (err) {
      console.error('[orders] Failed to publish order.completed event', err);
    }

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/orders/:id/hold
  app.post('/:id/hold', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db.update(schema.orders).set({ status: 'held', updatedAt: new Date() }).where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)));
    return reply.status(200).send({ data: { status: 'held' } });
  });

  // POST /api/v1/orders/:id/cancel
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    await db.update(schema.orders).set({ status: 'cancelled', cancellationReason: body.data.reason, cancelledAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)));
    return reply.status(200).send({ data: { status: 'cancelled' } });
  });

  // POST /api/v1/orders/:id/refund
  app.post('/:id/refund', async (request, reply) => {
    const { orgId, sub: approvedByEmployeeId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };
    const body = refundSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!['completed', 'partially_refunded'].includes(order.status)) return reply.status(409).send({ title: 'Cannot refund this order', status: 409, detail: `Order status is ${order.status}` });

    const totalRefundAmount = body.data.lines.reduce((sum, l) => sum + l.amount, 0);

    const refundRows = await db.insert(schema.refunds).values({
      orgId,
      originalOrderId: id,
      refundNumber: generateRefundNumber(),
      reason: body.data.reason,
      lines: body.data.lines,
      refundMethod: body.data.refundMethod,
      totalAmount: String(totalRefundAmount.toFixed(4)),
      approvedByEmployeeId,
    }).returning();
    const refund = refundRows[0]!;

    // Update order status
    await db.update(schema.orders).set({ status: 'partially_refunded', updatedAt: new Date() }).where(eq(schema.orders.id, id));

    return reply.status(201).send({ data: refund });
  });

  // PATCH /api/v1/orders/:id/lines/:lineId/status
  app.patch('/:id/lines/:lineId/status', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id, lineId } = request.params as { id: string; lineId: string };
    const body = z.object({ status: z.enum(['pending', 'sent_to_kitchen', 'ready', 'served', 'void', 'comp']) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const lineRows = await db.update(schema.orderLines).set({ status: body.data.status }).where(eq(schema.orderLines.id, lineId)).returning();
    const updated = lineRows[0]!;
    return reply.status(200).send({ data: updated });
  });
}
