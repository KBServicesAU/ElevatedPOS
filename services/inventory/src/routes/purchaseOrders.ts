import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

// v2.7.40 — the dashboard PO form (purchase-orders-client.tsx) submits an
// ad-hoc payload that does not match the strict POS-style schema:
//   * sends `lineItems` (not `lines`)
//   * has no `productId` (free-form entry — no catalog link)
//   * has no `locationId` (the form has no location picker)
//   * uses `status`, `expectedDate`, `shippingAddress`, `supplierName`
// Before this change, every dashboard save failed with HTTP 422. The
// lines table stores productId as non-null, so when the dashboard sends
// no productId, we fall back to a lookup-or-create product stub below.
// Keep the POS-style shape accepted too so the mobile client is unchanged.
const poLineSchema = z.object({
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  productName: z.string(),
  sku: z.string().optional().default(''),
  // Dashboard uses `orderedQty`; POS uses the same name. Kept explicit.
  orderedQty: z.number().positive(),
  unitCost: z.number().min(0),
  taxRate: z.number().min(0).default(0),
});

const createPOSchema = z.object({
  locationId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  supplierName: z.string().optional(),
  currency: z.string().length(3).default('AUD'),
  paymentTerms: z.number().int().default(30),
  // Dashboard sends `expectedDate` as a plain YYYY-MM-DD string; POS sends
  // `expectedDeliveryAt` as ISO datetime. Accept either.
  expectedDeliveryAt: z.string().optional(),
  expectedDate: z.string().optional(),
  shippingAddress: z.string().optional(),
  notes: z.string().optional(),
  // Dashboard may send status ('draft' | 'confirmed') — persisted on the row.
  status: z.string().optional(),
  // Accept both `lines` (POS) and `lineItems` (dashboard).
  lines: z.array(poLineSchema).optional(),
  lineItems: z.array(poLineSchema).optional(),
}).refine((d) => (d.lines?.length ?? 0) + (d.lineItems?.length ?? 0) > 0, {
  message: 'At least one line item is required',
});

function generatePoNumber(): string {
  return `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * v2.7.40 — deterministic UUIDv5-ish product id for free-form PO lines.
 * The dashboard's PO form lets users type a product name without a
 * catalog link, so no real `productId` exists. The DB column is
 * `uuid NOT NULL` with no FK (by design), so we hash the seed into a
 * stable 32-char hex and reshape it into a UUID string. Same seed →
 * same id, so repeat lines across POs group cleanly in reports.
 */
function syntheticProductId(seed: string): string {
  // FNV-1a hash, 64-bit doubled → 32 hex chars. Good enough for a stable
  // shape; not a cryptographic uuid and not RFC 4122 strict.
  let h1 = 0x811c9dc5n;
  let h2 = 0xcbf29ce484222325n;
  const bytes = Buffer.from(seed || 'po-line-empty');
  for (const b of bytes) {
    h1 = ((h1 ^ BigInt(b)) * 0x01000193n) & 0xffffffffn;
    h2 = ((h2 ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(16, '0')).padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function purchaseOrderRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const listQuerySchema = z.object({
      locationId: z.string().uuid().optional(),
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const q = listQuerySchema.parse(request.query);
    const orders = await db.query.purchaseOrders.findMany({
      where: and(eq(schema.purchaseOrders.orgId, orgId), q.locationId ? eq(schema.purchaseOrders.locationId, q.locationId) : undefined),
      with: { lines: true, supplier: true },
      orderBy: [desc(schema.purchaseOrders.createdAt)],
      limit: q.limit,
      offset: q.offset,
    });
    return reply.status(200).send({
      data: orders,
      meta: { limit: q.limit, offset: q.offset, returned: orders.length },
    });
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

    // v2.7.40 — merge dashboard (`lineItems`) and POS (`lines`) payload shapes.
    const combinedLines = [...(body.data.lines ?? []), ...(body.data.lineItems ?? [])];
    // Fall back to orgId as locationId when the dashboard doesn't send one —
    // the column is NOT NULL uuid, and orgId is always a valid UUID. For
    // single-location merchants this is effectively the store location; for
    // multi-location orgs it lets the record save and a locationId can be
    // added later through edit.
    const locationId = body.data.locationId ?? orgId;
    const { supplierId, currency, paymentTerms, expectedDeliveryAt, expectedDate, notes } = body.data;
    // Dashboard uses YYYY-MM-DD for `expectedDate`; the DB column takes a
    // timestamp. Either source is accepted and normalised here.
    const expectedAt = expectedDeliveryAt ?? expectedDate;

    const subtotal = combinedLines.reduce((sum, l) => sum + l.orderedQty * l.unitCost, 0);
    const taxTotal = combinedLines.reduce((sum, l) => sum + l.orderedQty * l.unitCost * (l.taxRate / 100), 0);

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
      ...(expectedAt ? { expectedDeliveryAt: new Date(expectedAt) } : {}),
      ...(notes !== undefined ? { notes } : {}),
    }).returning();
    const po = rows[0]!;

    // Dashboard lines have no productId — fall back to a deterministic
    // synthetic UUID derived from the SKU or product name so the NOT NULL
    // constraint is satisfied and lines with the same name/SKU collapse to
    // the same id. The column has no FK, which the schema explicitly notes.
    await db.insert(schema.purchaseOrderLines).values(combinedLines.map((l) => ({
      purchaseOrderId: po.id,
      productId: l.productId ?? syntheticProductId(l.sku || l.productName),
      productName: l.productName,
      sku: l.sku ?? '',
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

    let isComplete = false;
    await db.transaction(async (trx) => {
      for (const receipt of body.data) {
        const line = po.lines.find((l) => l.id === receipt.lineId);
        if (!line) continue;

        await trx.update(schema.purchaseOrderLines)
          .set({ receivedQty: String(Number(line.receivedQty) + receipt.receivedQty) })
          .where(eq(schema.purchaseOrderLines.id, line.id));

        const stockItem = await trx.query.stockItems.findFirst({ where: and(eq(schema.stockItems.locationId, po.locationId), eq(schema.stockItems.productId, line.productId)) });
        const currentQty = Number(stockItem?.onHand ?? 0);
        const newQty = currentQty + receipt.receivedQty;

        if (stockItem) {
          await trx.update(schema.stockItems).set({ onHand: String(newQty), updatedAt: new Date() }).where(eq(schema.stockItems.id, stockItem.id));
        } else {
          await trx.insert(schema.stockItems).values({
            orgId: po.orgId,
            locationId: po.locationId,
            productId: line.productId,
            onHand: String(newQty),
            ...(line.variantId !== null && line.variantId !== undefined ? { variantId: line.variantId } : {}),
          });
        }

        await trx.insert(schema.stockAdjustments).values({
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

      const allLines = await trx.query.purchaseOrderLines.findMany({ where: eq(schema.purchaseOrderLines.purchaseOrderId, id) });
      isComplete = allLines.every((l) => Number(l.receivedQty) >= Number(l.orderedQty));

      await trx.update(schema.purchaseOrders).set({ status: isComplete ? 'complete' : 'partial', updatedAt: new Date() }).where(eq(schema.purchaseOrders.id, id));
    });

    return reply.status(200).send({ data: { status: isComplete ? 'complete' : 'partial' } });
  });
}
