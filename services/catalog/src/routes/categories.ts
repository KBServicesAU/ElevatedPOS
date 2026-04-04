import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';

const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
  printerDestination: z.string().max(20).optional(),
  kdsDestination: z.string().max(20).optional(),
  customPrinterName: z.string().max(100).optional(),
  customKdsName: z.string().max(100).optional(),
  color: z.string().max(20).optional(),
});

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const categories = await db.query.categories.findMany({
      where: and(eq(schema.categories.orgId, orgId), eq(schema.categories.isActive, true)),
      orderBy: [schema.categories.sortOrder, schema.categories.name],
    });
    return reply.status(200).send({ data: categories });
  });

  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createCategorySchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });
    const {
      parentId: rawParentId,
      description: rawDescription,
      imageUrl: rawImageUrl,
      printerDestination: rawPrinterDest,
      kdsDestination: rawKdsDest,
      customPrinterName: rawCustomPrinterName,
      customKdsName: rawCustomKdsName,
      color: rawColor,
      ...categoryRest
    } = body.data;
    const slug = categoryRest.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const [created] = await db.insert(schema.categories).values({
      ...categoryRest,
      orgId,
      slug,
      parentId: rawParentId ?? null,
      description: rawDescription ?? null,
      imageUrl: rawImageUrl ?? null,
      printerDestination: rawPrinterDest ?? null,
      kdsDestination: rawKdsDest ?? null,
      customPrinterName: rawCustomPrinterName ?? null,
      customKdsName: rawCustomKdsName ?? null,
      color: rawColor ?? null,
    }).returning();
    return reply.status(201).send({ data: created });
  });

  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = createCategorySchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.name !== undefined) setData['name'] = body.data.name;
    if (body.data.parentId !== undefined) setData['parentId'] = body.data.parentId ?? null;
    if (body.data.description !== undefined) setData['description'] = body.data.description ?? null;
    if (body.data.imageUrl !== undefined) setData['imageUrl'] = body.data.imageUrl ?? null;
    if (body.data.sortOrder !== undefined) setData['sortOrder'] = body.data.sortOrder;
    if (body.data.printerDestination !== undefined) setData['printerDestination'] = body.data.printerDestination ?? null;
    if (body.data.kdsDestination !== undefined) setData['kdsDestination'] = body.data.kdsDestination ?? null;
    if (body.data.customPrinterName !== undefined) setData['customPrinterName'] = body.data.customPrinterName ?? null;
    if (body.data.customKdsName !== undefined) setData['customKdsName'] = body.data.customKdsName ?? null;
    if (body.data.color !== undefined) setData['color'] = body.data.color ?? null;
    type CategoryUpdate = typeof schema.categories.$inferInsert;
    const [updated] = await db.update(schema.categories).set(setData as unknown as CategoryUpdate).where(and(eq(schema.categories.id, id), eq(schema.categories.orgId, orgId))).returning();
    return reply.status(200).send({ data: updated });
  });

  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db.update(schema.categories).set({ isActive: false, updatedAt: new Date() }).where(and(eq(schema.categories.id, id), eq(schema.categories.orgId, orgId)));
    return reply.status(204).send();
  });
}
