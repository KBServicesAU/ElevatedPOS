import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  taxClassId: z.string().uuid().optional(),
  productType: z.enum(['standard', 'variant', 'kit', 'service']).default('standard'),
  sku: z.string().min(1).max(100),
  barcodes: z.array(z.string()).default([]),
  basePrice: z.number().min(0),
  costPrice: z.number().min(0).default(0),
  isSoldOnline: z.boolean().default(false),
  isSoldInstore: z.boolean().default(true),
  trackStock: z.boolean().default(true),
  reorderPoint: z.number().int().min(0).default(0),
  reorderQuantity: z.number().int().min(0).default(0),
  ageRestricted: z.boolean().default(false),
  ageRestrictionMinimum: z.number().int().optional(),
  weightBased: z.boolean().default(false),
  pluCode: z.string().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export async function productRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { search?: string; categoryId?: string; isActive?: string; limit?: string; cursor?: string };

    const limit = Math.min(Number(q.limit ?? 50), 200);

    const products = await db.query.products.findMany({
      where: and(
        eq(schema.products.orgId, orgId),
        q.isActive !== undefined ? eq(schema.products.isActive, q.isActive === 'true') : undefined,
        q.categoryId ? eq(schema.products.categoryId, q.categoryId) : undefined,
      ),
      with: { category: true, taxClass: true, variants: true },
      orderBy: [desc(schema.products.updatedAt)],
      limit,
    });

    const filtered = q.search
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q.search!.toLowerCase()) ||
            p.sku.toLowerCase().includes(q.search!.toLowerCase()) ||
            (p.barcodes as string[]).some((b) => b.includes(q.search!)),
        )
      : products;

    return reply.status(200).send({ data: filtered, meta: { totalCount: filtered.length, hasMore: filtered.length === limit } });
  });

  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const product = await db.query.products.findFirst({
      where: and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)),
      with: { category: true, taxClass: true, variants: true, modifierGroups: { with: { group: { with: { options: true } } } } },
    });

    if (!product) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: product });
  });

  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createProductSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

    const [created] = await db.insert(schema.products).values({ ...body.data, orgId }).returning();
    return reply.status(201).send({ data: created });
  });

  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = createProductSchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422 });

    const existing = await db.query.products.findFirst({ where: and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)) });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const [updated] = await db.update(schema.products).set({ ...body.data, updatedAt: new Date() }).where(and(eq(schema.products.id, id), eq(schema.products.orgId, orgId))).returning();
    return reply.status(200).send({ data: updated });
  });

  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db.update(schema.products).set({ isActive: false, updatedAt: new Date() }).where(and(eq(schema.products.id, id), eq(schema.products.orgId, orgId)));
    return reply.status(204).send();
  });
}
