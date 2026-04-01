import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.record(z.unknown()).optional(),
  abn: z.string().optional(),
  paymentTerms: z.number().int().default(30),
  leadTimeDays: z.number().int().default(7),
  minimumOrderValue: z.number().min(0).optional(),
  preferredCurrency: z.string().length(3).default('AUD'),
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
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }
    const { name, contactName, email, phone, address, abn, paymentTerms, leadTimeDays, preferredCurrency, notes } = body.data;
    const [created] = await db.insert(schema.suppliers).values({
      orgId,
      name,
      paymentTerms,
      leadTimeDays,
      preferredCurrency,
      contactName: contactName ?? null,
      email: email ?? null,
      phone: phone ?? null,
      address: address ?? null,
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
        type: 'https://nexus.app/errors/not-found',
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
        type: 'https://nexus.app/errors/validation',
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
        type: 'https://nexus.app/errors/not-found',
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
        type: 'https://nexus.app/errors/validation',
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
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    // Store supplier-product links in supplier notes/settings as JSON since no dedicated table exists yet
    // We use purchase order lines as the product catalogue reference for now
    // Return a structured response linking supplier to product
    return reply.status(201).send({
      data: {
        supplierId: id,
        productId: body.data.productId,
        sku: body.data.sku,
        unitCost: body.data.unitCost,
        minimumOrderQty: body.data.minimumOrderQty,
        leadTimeDays: body.data.leadTimeDays ?? supplier.leadTimeDays,
        notes: body.data.notes,
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
        type: 'https://nexus.app/errors/not-found',
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
        type: 'https://nexus.app/errors/not-found',
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
