import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const TERM_MAP: Record<string, number> = { COD: 0, Net7: 7, Net14: 14, Net30: 30, Net60: 60, Net90: 90 };

const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.union([z.record(z.unknown()), z.string()]).optional().transform((v) =>
    typeof v === 'string' ? (v ? { raw: v } : {}) : v ?? {},
  ),
  website: z.string().optional(),
  abn: z.string().optional(),
  paymentTerms: z.union([
    z.number().int(),
    z.string().transform((v) => (TERM_MAP[v] ?? parseInt(v, 10)) || 30),
  ]).default(30),
  leadTimeDays: z.union([z.number().int(), z.string().transform((v) => parseInt(v, 10) || 7)]).default(7),
  minimumOrderValue: z.number().min(0).optional(),
  preferredCurrency: z.string().max(3).default('AUD'),
  notes: z.string().optional(),
});

const supplierProductSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().optional(),
  unitCost: z.number().min(0),
  minimumOrderQty: z.number().min(0).default(1),
  leadTimeDays: z.number().int().optional(),
  notes: z.string().optional(),
});

export async function supplierRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET / — list active suppliers
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const suppliers = await db.query.suppliers.findMany({
      where: and(eq(schema.suppliers.orgId, orgId), eq(schema.suppliers.isActive, true)),
      orderBy: [desc(schema.suppliers.createdAt)],
    });
    return reply.status(200).send({ data: suppliers, meta: { totalCount: suppliers.length } });
  });

  // POST / — create supplier
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = supplierSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }
    const { name, contactName, email, phone, address, abn, paymentTerms, leadTimeDays, preferredCurrency, notes } = body.data;
    const [created] = await db.insert(schema.suppliers).values({
      orgId,
      name,
      paymentTerms: typeof paymentTerms === 'number' ? paymentTerms : 30,
      leadTimeDays: typeof leadTimeDays === 'number' ? leadTimeDays : 7,
      preferredCurrency,
      contactName: contactName ?? null,
      email: email && email !== '' ? email : null,
      phone: phone ?? null,
      address: address ?? {},
      abn: abn ?? null,
      notes: notes ?? null,
    }).returning();
    return reply.status(201).send({ data: created });
  });

  // GET /:id — supplier detail
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const supplier = await db.query.suppliers.findFirst({
      where: and(eq(schema.suppliers.id, id), eq(schema.suppliers.orgId, orgId)),
    });

    if (!supplier) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    return reply.status(200).send({ data: supplier });
  });

  // PATCH /:id — update supplier
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = supplierSchema.partial().safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }
    const { name, contactName, email, phone, address, abn, paymentTerms, leadTimeDays, preferredCurrency, notes } = body.data;
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) setData['name'] = name;
    if (contactName !== undefined) setData['contactName'] = contactName;
    if (email !== undefined) setData['email'] = email;
    if (phone !== undefined) setData['phone'] = phone;
    if (address !== undefined) setData['address'] = address;
    if (abn !== undefined) setData['abn'] = abn;
    if (paymentTerms !== undefined) setData['paymentTerms'] = paymentTerms;
    if (leadTimeDays !== undefined) setData['leadTimeDays'] = leadTimeDays;
    if (preferredCurrency !== undefined) setData['preferredCurrency'] = preferredCurrency;
    if (notes !== undefined) setData['notes'] = notes;

    const [updated] = await db
      .update(schema.suppliers)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(setData as any)
      .where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.orgId, orgId)))
      .returning();

    if (!updated) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    return reply.status(200).send({ data: updated });
  });

  // DELETE /:id — soft delete
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db
      .update(schema.suppliers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.orgId, orgId)));
    return reply.status(204).send();
  });

  // POST /:id/products — link a product to this supplier with cost and minimum order qty
  app.post('/:id/products', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = supplierProductSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const supplier = await db.query.suppliers.findFirst({
      where: and(eq(schema.suppliers.id, id), eq(schema.suppliers.orgId, orgId)),
    });

    if (!supplier) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    // Persist supplier-product links in the supplier's address jsonb field under a
    // dedicated "productLinks" key, since no dedicated junction table exists in the schema.
    const currentAddress = (supplier.address ?? {}) as Record<string, unknown>;
    const currentLinks: Array<Record<string, unknown>> = Array.isArray(currentAddress['productLinks'])
      ? (currentAddress['productLinks'] as Array<Record<string, unknown>>)
      : [];

    const newLink = {
      productId: body.data.productId,
      sku: body.data.sku ?? null,
      unitCost: body.data.unitCost,
      minimumOrderQty: body.data.minimumOrderQty,
      leadTimeDays: body.data.leadTimeDays ?? supplier.leadTimeDays,
      notes: body.data.notes ?? null,
      linkedAt: new Date().toISOString(),
    };

    // Upsert: replace existing entry for this productId or append
    const updatedLinks = [
      ...currentLinks.filter((l) => l['productId'] !== body.data.productId),
      newLink,
    ];

    await db
      .update(schema.suppliers)
      .set({
        address: { ...currentAddress, productLinks: updatedLinks },
        updatedAt: new Date(),
      })
      .where(eq(schema.suppliers.id, id));

    return reply.status(201).send({
      data: {
        supplierId: id,
        ...newLink,
      },
    });
  });

  // GET /:id/products — list products for this supplier (from purchase order lines)
  app.get('/:id/products', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const supplier = await db.query.suppliers.findFirst({
      where: and(eq(schema.suppliers.id, id), eq(schema.suppliers.orgId, orgId)),
    });

    if (!supplier) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    // Derive distinct products from purchase order lines for this supplier
    const purchaseOrders = await db.query.purchaseOrders.findMany({
      where: and(
        eq(schema.purchaseOrders.orgId, orgId),
        eq(schema.purchaseOrders.supplierId, id),
      ),
      with: { lines: true },
    });

    // Deduplicate by productId, keep most recent unitCost
    const productMap: Record<string, {
      productId: string;
      productName: string;
      sku: string;
      lastUnitCost: string;
      lastOrderedAt: string;
    }> = {};

    for (const po of purchaseOrders) {
      for (const line of po.lines) {
        const existing = productMap[line.productId];
        if (!existing || po.createdAt > new Date(existing.lastOrderedAt)) {
          productMap[line.productId] = {
            productId: line.productId,
            productName: line.productName,
            sku: line.sku,
            lastUnitCost: line.unitCost,
            lastOrderedAt: po.createdAt.toISOString(),
          };
        }
      }
    }

    return reply.status(200).send({ data: Object.values(productMap) });
  });

  // GET /:id/purchase-orders — list POs for this supplier
  app.get('/:id/purchase-orders', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const supplier = await db.query.suppliers.findFirst({
      where: and(eq(schema.suppliers.id, id), eq(schema.suppliers.orgId, orgId)),
    });

    if (!supplier) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    const orders = await db.query.purchaseOrders.findMany({
      where: and(
        eq(schema.purchaseOrders.orgId, orgId),
        eq(schema.purchaseOrders.supplierId, id),
      ),
      with: { lines: true },
      orderBy: [desc(schema.purchaseOrders.createdAt)],
    });

    return reply.status(200).send({ data: orders, meta: { totalCount: orders.length } });
  });
}
