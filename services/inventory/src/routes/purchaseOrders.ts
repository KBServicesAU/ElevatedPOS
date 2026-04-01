import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const createPOSchema = z.object({
  locationId: z.string().uuid(),
  supplierId: z.string().uuid(),
  currency: z.string().length(3).default('AUD'),
  paymentTerms: z.number().int().default(30),
  expectedDeliveryAt: z.string().datetime().optional(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    productName: z.string(),
    sku: z.string(),
    orderedQty: z.number().positive(),
    unitCost: z.number().min(0),
    taxRate: z.number().min(0).default(0),
  })),
});

function generatePoNumber(): string {
  return `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function purchaseOrderRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { locationId?: string; status?: string };
    const orders = await db.query.purchaseOrders.findMany({
      where: and(eq(schema.purchaseOrders.orgId, orgId), q.locationId ? eq(schema.purchaseOrders.locationId, q.locationId) : undefined),
      with: { lines: true, supplier: true },
      orderBy: [desc(schema.purchaseOrders.createdAt)],
    });
    return reply.status(200).send({ data: orders });
  });

  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const order = await db.query.purchaseOrders.findFirst({
      where: and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.orgId, orgId)),
      with: { lines: true, supplier: true },
    });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: order });
  });

  app.post('/', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = createPOSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });

    const { lines, locationId, supplierId, currency, paymentTerms, expectedDeliveryAt, notes } = body.data;
    const subtotal = lines.reduce((sum, l) => sum + l.orderedQty * l.unitCost, 0);
    const taxTotal = lines.reduce((sum, l) => sum + l.orderedQty * l.unitCost * (l.taxRate / 100), 0);

    const rows = await db.insert(schema.purchaseOrders).values({
      orgId,
      locationId,
      supplierId,
      currency,
      paymentTerms,
      poNumber: generatePoNumber(),
      createdByEmployeeId: employeeId,
      subtotal: String(subtotal),
      taxTotal: String(taxTotal),
      total: String(subtotal + taxTotal),
      ...(expectedDeliveryAt !== undefined ? { expectedDeliveryAt: new Date(expectedDeliveryAt) } : {}),
      ...(notes !== undefined ? { notes } : {}),
    }).returning();
    const po = rows[0]!;

    await db.insert(schema.purchaseOrderLines).values(lines.map((l) => ({
      purchaseOrderId: po.id,
      productId: l.productId,
      productName: l.productName,
      sku: l.sku,
      orderedQty: String(l.orderedQty),
      unitCost: String(l.unitCost),
      taxRate: String(l.taxRate),
      lineTotal: String(l.orderedQty * l.unitCost),
      ...(l.variantId !== undefined ? { variantId: l.variantId } : {}),
    })));

    const created = await db.query.purchaseOrders.findFirst({ where: eq(schema.purchaseOrders.id, po.id), with: { lines: true, supplier: true } });
    return reply.status(201).send({ data: created });
  });

  app.post('/:id/receive', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };
    const body = z.array(z.object({ lineId: z.string().uuid(), receivedQty: z.number().min(0) })).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const po = await db.query.purchaseOrders.findFirst({ where: and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.orgId, orgId)), with: { lines: true } });
    if (!po) return reply.status(404).send({ title: 'Not Found', status: 404 });

    for (const receipt of body.data) {
      const line = po.lines.find((l) => l.id === receipt.lineId);
      if (!line) continue;

      await db.update(schema.purchaseOrderLines)
        .set({ receivedQty: String(Number(line.receivedQty) + receipt.receivedQty) })
        .where(eq(schema.purchaseOrderLines.id, line.id));

      const stockItem = await db.query.stockItems.findFirst({ where: and(eq(schema.stockItems.locationId, po.locationId), eq(schema.stockItems.productId, line.productId)) });
      const currentQty = Number(stockItem?.onHand ?? 0);
      const newQty = currentQty + receipt.receivedQty;

      if (stockItem) {
        await db.update(schema.stockItems).set({ onHand: String(newQty), updatedAt: new Date() }).where(eq(schema.stockItems.id, stockItem.id));
      } else {
        await db.insert(schema.stockItems).values({
          locationId: po.locationId,
          productId: line.productId,
          onHand: String(newQty),
          ...(line.variantId !== null && line.variantId !== undefined ? { variantId: line.variantId } : {}),
        });
      }

      await db.insert(schema.stockAdjustments).values({
        orgId,
        locationId: po.locationId,
        productId: line.productId,
        beforeQty: String(currentQty),
        afterQty: String(newQty),
        adjustment: String(receipt.receivedQty),
        reason: `Received against PO ${po.poNumber}`,
        referenceId: po.id,
        referenceType: 'purchase_order',
        employeeId,
        ...(line.variantId !== null && line.variantId !== undefined ? { variantId: line.variantId } : {}),
      });
    }

    const allLines = await db.query.purchaseOrderLines.findMany({ where: eq(schema.purchaseOrderLines.purchaseOrderId, id) });
    const isComplete = allLines.every((l) => Number(l.receivedQty) >= Number(l.orderedQty));

    await db.update(schema.purchaseOrders).set({ status: isComplete ? 'complete' : 'partial', updatedAt: new Date() }).where(eq(schema.purchaseOrders.id, id));

    return reply.status(200).send({ data: { status: isComplete ? 'complete' : 'partial' } });
  });
}
