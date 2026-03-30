import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const bundleComponentSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().positive().default(1),
  isRequired: z.boolean().default(true),
  allowSubstitutes: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const createBundleSchema = z.object({
  productId: z.string().uuid(),
  bundleType: z.enum(['fixed', 'dynamic']).default('fixed'),
  name: z.string().min(1),
  description: z.string().optional(),
  fixedPrice: z.number().positive().optional(),
  discountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  discountValue: z.number().min(0).default(0),
  components: z.array(bundleComponentSchema).min(1),
});

const updateBundleSchema = createBundleSchema.partial().omit({ components: true }).extend({
  components: z.array(bundleComponentSchema).min(1).optional(),
});

export async function bundleRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST / — create bundle
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createBundleSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { components, ...bundleData } = body.data;

    const [bundle] = await db
      .insert(schema.productBundles)
      .values({
        ...bundleData,
        orgId,
        fixedPrice: bundleData.fixedPrice != null ? String(bundleData.fixedPrice) : null,
        discountValue: String(bundleData.discountValue),
      })
      .returning();

    const componentRows = components.map((c) => ({
      bundleId: bundle.id,
      productId: c.productId,
      variantId: c.variantId,
      quantity: String(c.quantity),
      isRequired: c.isRequired,
      allowSubstitutes: c.allowSubstitutes,
      sortOrder: c.sortOrder,
    }));

    const createdComponents = await db
      .insert(schema.bundleComponents)
      .values(componentRows)
      .returning();

    return reply.status(201).send({ data: { ...bundle, components: createdComponents } });
  });

  // GET / — list bundles for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { isActive?: string };

    const bundles = await db.query.productBundles.findMany({
      where: and(
        eq(schema.productBundles.orgId, orgId),
        q.isActive !== undefined
          ? eq(schema.productBundles.isActive, q.isActive === 'true')
          : undefined,
      ),
      orderBy: [desc(schema.productBundles.updatedAt)],
    });

    return reply.status(200).send({ data: bundles, meta: { totalCount: bundles.length } });
  });

  // GET /:id — get bundle with components and computed price
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const bundle = await db.query.productBundles.findFirst({
      where: and(eq(schema.productBundles.id, id), eq(schema.productBundles.orgId, orgId)),
    });

    if (!bundle) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const components = await db.query.bundleComponents.findMany({
      where: eq(schema.bundleComponents.bundleId, id),
    });

    // Compute price: look up current base prices for each component product
    let componentsWithPrice: Array<typeof components[0] & { unitPrice: number; lineTotal: number }> = [];
    let sumPrice = 0;

    for (const comp of components) {
      const product = await db.query.products.findFirst({
        where: eq(schema.products.id, comp.productId),
      });
      const unitPrice = Number(product?.basePrice ?? 0);
      const qty = Number(comp.quantity);
      const lineTotal = unitPrice * qty;
      sumPrice += lineTotal;
      componentsWithPrice.push({ ...comp, unitPrice, lineTotal });
    }

    let computedPrice = sumPrice;
    if (bundle.fixedPrice != null) {
      computedPrice = Number(bundle.fixedPrice);
    } else if (bundle.discountType === 'percentage') {
      computedPrice = sumPrice * (1 - Number(bundle.discountValue) / 100);
    } else if (bundle.discountType === 'fixed') {
      computedPrice = Math.max(0, sumPrice - Number(bundle.discountValue));
    }

    return reply.status(200).send({
      data: {
        ...bundle,
        components: componentsWithPrice,
        priceBreakdown: {
          componentSum: sumPrice,
          discountType: bundle.discountType,
          discountValue: Number(bundle.discountValue),
          finalPrice: computedPrice,
        },
      },
    });
  });

  // PATCH /:id — update bundle
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = updateBundleSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.productBundles.findFirst({
      where: and(eq(schema.productBundles.id, id), eq(schema.productBundles.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const { components, fixedPrice, discountValue, ...rest } = body.data;

    const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (fixedPrice !== undefined) updateData['fixedPrice'] = fixedPrice != null ? String(fixedPrice) : null;
    if (discountValue !== undefined) updateData['discountValue'] = String(discountValue);

    const [updated] = await db
      .update(schema.productBundles)
      .set(updateData)
      .where(and(eq(schema.productBundles.id, id), eq(schema.productBundles.orgId, orgId)))
      .returning();

    if (components) {
      await db.delete(schema.bundleComponents).where(eq(schema.bundleComponents.bundleId, id));
      await db.insert(schema.bundleComponents).values(
        components.map((c) => ({
          bundleId: id,
          productId: c.productId,
          variantId: c.variantId,
          quantity: String(c.quantity),
          isRequired: c.isRequired,
          allowSubstitutes: c.allowSubstitutes,
          sortOrder: c.sortOrder,
        })),
      );
    }

    const updatedComponents = await db.query.bundleComponents.findMany({
      where: eq(schema.bundleComponents.bundleId, id),
    });

    return reply.status(200).send({ data: { ...updated, components: updatedComponents } });
  });

  // DELETE /:id — soft delete
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.productBundles.findFirst({
      where: and(eq(schema.productBundles.id, id), eq(schema.productBundles.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    await db
      .update(schema.productBundles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.productBundles.id, id), eq(schema.productBundles.orgId, orgId)));

    return reply.status(204).send();
  });

  // GET /:id/price — compute bundle price breakdown
  app.get('/:id/price', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const bundle = await db.query.productBundles.findFirst({
      where: and(eq(schema.productBundles.id, id), eq(schema.productBundles.orgId, orgId)),
    });
    if (!bundle) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const components = await db.query.bundleComponents.findMany({
      where: eq(schema.bundleComponents.bundleId, id),
    });

    let sumPrice = 0;
    const lines: Array<{ productId: string; quantity: number; unitPrice: number; lineTotal: number }> = [];

    for (const comp of components) {
      const product = await db.query.products.findFirst({
        where: eq(schema.products.id, comp.productId),
      });
      const unitPrice = Number(product?.basePrice ?? 0);
      const qty = Number(comp.quantity);
      const lineTotal = unitPrice * qty;
      sumPrice += lineTotal;
      lines.push({ productId: comp.productId, quantity: qty, unitPrice, lineTotal });
    }

    let finalPrice = sumPrice;
    let discountAmount = 0;
    if (bundle.fixedPrice != null) {
      finalPrice = Number(bundle.fixedPrice);
      discountAmount = sumPrice - finalPrice;
    } else if (bundle.discountType === 'percentage') {
      discountAmount = sumPrice * (Number(bundle.discountValue) / 100);
      finalPrice = sumPrice - discountAmount;
    } else if (bundle.discountType === 'fixed') {
      discountAmount = Number(bundle.discountValue);
      finalPrice = Math.max(0, sumPrice - discountAmount);
    }

    return reply.status(200).send({
      data: {
        bundleId: id,
        componentSum: sumPrice,
        discountType: bundle.discountType,
        discountValue: Number(bundle.discountValue),
        discountAmount,
        finalPrice,
        lines,
      },
    });
  });
}
