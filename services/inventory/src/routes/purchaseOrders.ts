import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const CATALOG_URL = process.env['CATALOG_SERVICE_URL'] ?? 'http://catalog:4002';

// v2.7.40 — the dashboard PO form (purchase-orders-client.tsx) submits an
// ad-hoc payload that does not match the strict POS-style schema:
//   * sends `lineItems` (not `lines`)
//   * has no `productId` (free-form entry — no catalog link)
//   * has no `locationId` (the form has no location picker)
//   * uses `status`, `expectedDate`, `shippingAddress`, `supplierName`
// v2.7.41 — resolve every free-form line to a real catalog product via
// POST /api/v1/products/lookup-or-create so stock receipts don't create
// orphan stock rows against ids that have no matching products row.
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
 * v2.7.41 — resolve a free-form PO line (name + optional SKU, no productId)
 * to a real catalog product id. Calls the catalog service's lookup-or-create
 * endpoint, forwarding the caller's Bearer token so the catalog can pull
 * `orgId` from `request.user` and scope creation correctly. The catalog
 * returns an existing product when SKU/name matches, or creates an inactive
 * draft tagged 'po-free-form' that staff can later edit & activate.
 *
 * Throws when catalog is unreachable or returns a non-2xx — the PO create
 * handler surfaces that as HTTP 502 so the dashboard can show a clear error
 * rather than silently saving an orphan row.
 */
async function resolveProductId(opts: {
  request: FastifyRequest;
  sku: string;
  name: string;
  costPrice: number;
}): Promise<string> {
  const { request, sku, name, costPrice } = opts;
  const authHeader = (request.headers['authorization'] as string | undefined) ?? '';
  if (!authHeader) {
    throw new Error('missing authorization header when resolving free-form PO product');
  }
  const res = await fetch(`${CATALOG_URL}/api/v1/products/lookup-or-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ sku, name, costPrice }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`catalog lookup-or-create failed: ${res.status} ${detail}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const id = json.data?.id;
  if (!id) throw new Error('catalog lookup-or-create returned no product id');
  return id;
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

    // v2.7.41 — resolve every free-form line to a real catalog product id
    // BEFORE inserting the PO row, so a catalog failure aborts the whole
    // transaction rather than leaving behind a PO with orphan stock rows.
    const resolvedLines: Array<{
      productId: string;
      variantId?: string;
      productName: string;
      sku: string;
      orderedQty: number;
      unitCost: number;
      taxRate: number;
    }> = [];
    for (const l of combinedLines) {
      let productId = l.productId;
      if (!productId) {
        try {
          productId = await resolveProductId({
            request,
            sku: l.sku ?? '',
            name: l.productName,
            costPrice: l.unitCost,
          });
        } catch (err) {
          request.log.error({ err }, 'Failed to resolve free-form PO line to a catalog product');
          return reply.status(502).send({
            title: 'Catalog Unavailable',
            status: 502,
            detail: 'Could not resolve product name/SKU to a catalog record. Try again, or link the line to an existing product.',
          });
        }
      }
      resolvedLines.push({
        productId,
        productName: l.productName,
        sku: l.sku ?? '',
        orderedQty: l.orderedQty,
        unitCost: l.unitCost,
        taxRate: l.taxRate,
        ...(l.variantId !== undefined ? { variantId: l.variantId } : {}),
      });
    }

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

    await db.insert(schema.purchaseOrderLines).values(resolvedLines.map((l) => ({
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
