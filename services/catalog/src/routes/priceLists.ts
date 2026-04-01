import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';

const createPriceListSchema = z.object({
  name: z.string().min(1),
  currency: z.string().length(3).default('AUD'),
  channels: z.array(z.string()).default([]),
  locationIds: z.array(z.string().uuid()).default([]),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
});

export async function priceListRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const lists = await db.query.priceLists.findMany({
      where: and(eq(schema.priceLists.orgId, orgId), eq(schema.priceLists.isActive, true)),
      with: { entries: { with: { product: true } } },
    });
    return reply.status(200).send({ data: lists });
  });

  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createPriceListSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });
    const { startAt: rawStartAt, endAt: rawEndAt, ...priceListRest } = body.data;
    const [created] = await db.insert(schema.priceLists).values({
      ...priceListRest,
      orgId,
      startAt: rawStartAt ? new Date(rawStartAt) : null,
      endAt: rawEndAt ? new Date(rawEndAt) : null,
    }).returning();
    return reply.status(201).send({ data: created });
  });

  app.post('/:id/entries', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.array(z.object({ productId: z.string().uuid(), variantId: z.string().uuid().optional(), price: z.number().min(0) })).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const list = await db.query.priceLists.findFirst({ where: and(eq(schema.priceLists.id, id), eq(schema.priceLists.orgId, orgId)) });
    if (!list) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const firstPrice = String(body.data[0]!.price);
    await db.insert(schema.priceListEntries).values(body.data.map((e) => ({
      priceListId: id,
      productId: e.productId,
      variantId: e.variantId ?? null,
      price: String(e.price),
    }))).onConflictDoUpdate({ target: [schema.priceListEntries.priceListId, schema.priceListEntries.productId], set: { price: firstPrice } });

    return reply.status(200).send({ data: { updated: body.data.length } });
  });
}
