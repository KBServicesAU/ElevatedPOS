import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
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
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      status: z.string().optional(),
      locationId: z.string().uuid().optional(),
      customerId: z.string().uuid().optional(),
    });
    const query = querySchema.parse(request.query);

    const whereClause = and(
      eq(schema.orders.orgId, orgId),
      query.locationId ? eq(schema.orders.locationId, query.locationId) : undefined,
      query.customerId ? eq(schema.orders.customerId, query.customerId) : undefined,
      query.status ? eq(schema.orders.status, query.status as any) : undefined,
    );

    const [orders, [countResult]] = await Promise.all([
      db.query.orders.findMany({
        where: whereClause,
        limit: query.limit,
        offset: query.offset,
        orderBy: [desc(schema.orders.createdAt)],
        with: { lines: true },
      }),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.orders)
        .where(whereClause),
    ]);

    const totalCount = countResult?.count ?? 0;
    return reply.status(200).send({
      data: orders,
      meta: {
        totalCount,
        hasMore: query.offset + orders.length < totalCount,
        limit: query.limit,
        offset: query.offset,
      },
    });
  });

  // GET /api/v1/orders/:id
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)),
      with: { lines: true, refunds: true },
    });

    if (!order) return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: order });
  });

  // POST /api/v1/orders
  app.post('/', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = createOrderSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

    const { lines, ...orderData } = body.data;

    // Compute totals in integer cents to avoid floating-point rounding errors
    const subtotalCents = lines.reduce((sum, l) => {
      const unitCents = Math.round(parseFloat(String(l.unitPrice)) * 100);
      const discountCents = Math.round(parseFloat(String(l.discountAmount ?? 0)) * 100);
      return sum + (l.quantity * unitCents - discountCents);
    }, 0);
    const discountTotalCents = lines.reduce((sum, l) => {
      return sum + Math.round(parseFloat(String(l.discountAmount ?? 0)) * 100);
    }, 0);
    const taxTotalCents = lines.reduce((sum, l) => {
      const unitCents = Math.round(parseFloat(String(l.unitPrice)) * 100);
      const discountCents = Math.round(parseFloat(String(l.discountAmount ?? 0)) * 100);
      const lineBaseCents = l.quantity * unitCents - discountCents;
      return sum + Math.round(lineBaseCents * (l.taxRate / 100));
    }, 0);
    const totalCents = subtotalCents + taxTotalCents;
    const subtotal = (subtotalCents / 100).toFixed(2);
    const discountTotal = (discountTotalCents / 100).toFixed(2);
    const taxTotal = (taxTotalCents / 100).toFixed(2);
    const total = (totalCents / 100).toFixed(2);

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
      subtotal: subtotal,
      discountTotal: discountTotal,
      taxTotal: taxTotal,
      total: total,
    }).returning();
    const order = orderRows[0]!;

    await db.insert(schema.orderLines).values(lines.map((l) => {
      const unitCents = Math.round(parseFloat(String(l.unitPrice)) * 100);
      const discountCents = Math.round(parseFloat(String(l.discountAmount ?? 0)) * 100);
      const lineBaseCents = l.quantity * unitCents - discountCents;
      const taxAmountCents = Math.round(lineBaseCents * (l.taxRate / 100));
      const lineTotalCents = lineBaseCents + taxAmountCents;
      const taxAmount = (taxAmountCents / 100).toFixed(2);
      const lineTotal = (lineTotalCents / 100).toFixed(2);
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
        taxAmount: taxAmount,
        discountAmount: String(l.discountAmount),
        lineTotal: lineTotal,
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
              // Items array consumed by inventory service to decrement stock
              items: created.lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId ?? undefined,
                quantity: Number(l.quantity),
              })),
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
    if (!body.success) return reply.status(422).send({ type: 'about:blank', title: 'Validation Error', status: 422 });

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });
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

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });

    if (order.status !== 'open') {
      return reply.code(422).send({
        type: 'about:blank', title: 'Invalid Status Transition', status: 422,
        detail: `Cannot hold an order with status '${order.status}'. Only open orders can be held.`,
      });
    }

    const [heldOrder] = await db.update(schema.orders).set({ status: 'held', updatedAt: new Date() }).where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId))).returning();
    return reply.status(200).send({ data: { id: heldOrder?.id ?? id, status: 'held' } });
  });

  // POST /api/v1/orders/:id/cancel
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });

    if (!['open', 'held'].includes(order.status)) {
      return reply.code(422).send({
        type: 'about:blank', title: 'Invalid Status Transition', status: 422,
        detail: `Cannot cancel an order with status '${order.status}'.`,
      });
    }

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

    const newRefundTotal = body.data.lines.reduce((sum, l) => sum + l.amount, 0);

    let refund: typeof schema.refunds.$inferSelect;
    try {
      refund = await db.transaction(async (trx) => {
        // Lock the order row to prevent concurrent refunds (TOCTOU protection)
        await trx.execute(sql`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`);

        // Re-fetch prior refund sum inside the transaction (after the lock)
        const previousRefunds = await trx.select({ total: sql<string>`SUM(total_amount)` })
          .from(schema.refunds)
          .where(eq(schema.refunds.originalOrderId, id));
        const alreadyRefunded = parseFloat(previousRefunds[0]?.total ?? '0');

        if (alreadyRefunded + newRefundTotal > parseFloat(order.total)) {
          throw Object.assign(new Error('Refund amount exceeds remaining refundable balance'), {
            statusCode: 422,
            alreadyRefunded,
            orderTotal: order.total,
          });
        }

        const refundRows = await trx.insert(schema.refunds).values({
          orgId,
          originalOrderId: id,
          refundNumber: generateRefundNumber(),
          reason: body.data.reason,
          lines: body.data.lines,
          refundMethod: body.data.refundMethod,
          totalAmount: String(newRefundTotal.toFixed(4)),
          approvedByEmployeeId,
        }).returning();

        const newTotalRefunded = alreadyRefunded + newRefundTotal;
        const finalStatus = newTotalRefunded >= parseFloat(order.total) ? 'refunded' : 'partially_refunded';

        await trx.update(schema.orders).set({ status: finalStatus, updatedAt: new Date() }).where(eq(schema.orders.id, id));

        return refundRows[0]!;
      });
    } catch (err: any) {
      if (err?.statusCode === 422) {
        return reply.status(422).send({
          title: 'Refund amount exceeds remaining refundable balance',
          status: 422,
          detail: `Already refunded: $${(err.alreadyRefunded as number).toFixed(2)}. Order total: $${err.orderTotal}`,
        });
      }
      throw err;
    }

    return reply.status(201).send({ data: refund });
  });

  // PATCH /api/v1/orders/:id/lines/:lineId/status
  app.patch('/:id/lines/:lineId/status', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id, lineId } = request.params as { id: string; lineId: string };
    const body = z.object({ status: z.enum(['pending', 'sent_to_kitchen', 'ready', 'served', 'void', 'comp']) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const lineRows = await db.update(schema.orderLines)
      .set({ status: body.data.status })
      .where(
        and(
          eq(schema.orderLines.id, lineId),
          // join to verify org ownership:
          inArray(schema.orderLines.orderId,
            db.select({ id: schema.orders.id })
              .from(schema.orders)
              .where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)))
          )
        )
      )
      .returning();
    if (lineRows.length === 0) return reply.status(404).send({ title: 'Order line not found', status: 404 });
    return reply.status(200).send({ data: lineRows[0] });
  });
}
