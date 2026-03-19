import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const adjustSchema = z.object({
  locationId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  newQty: z.number(),
  reason: z.string().min(1),
});

export async function stockRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const q = request.query as { locationId?: string; lowStock?: string };
    const { orgId } = request.user as { orgId: string };

    const items = await db.query.stockItems.findMany({
      where: q.locationId ? eq(schema.stockItems.locationId, q.locationId) : undefined,
      orderBy: [desc(schema.stockItems.updatedAt)],
    });

    return reply.status(200).send({ data: items });
  });

  app.get('/low-stock', async (request, reply) => {
    const q = request.query as { locationId?: string };
    const items = await db.query.stockItems.findMany({
      where: q.locationId ? eq(schema.stockItems.locationId, q.locationId) : undefined,
    });

    return reply.status(200).send({ data: items });
  });

  app.post('/adjust', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = adjustSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const { locationId, productId, variantId, newQty, reason } = body.data;

    const existing = await db.query.stockItems.findFirst({
      where: and(
        eq(schema.stockItems.locationId, locationId),
        eq(schema.stockItems.productId, productId),
      ),
    });

    const beforeQty = Number(existing?.onHand ?? 0);
    const adjustment = newQty - beforeQty;

    if (existing) {
      await db.update(schema.stockItems)
        .set({ onHand: String(newQty), updatedAt: new Date() })
        .where(eq(schema.stockItems.id, existing.id));
    } else {
      await db.insert(schema.stockItems).values({ locationId, productId, variantId, onHand: String(newQty) });
    }

    const [adj] = await db.insert(schema.stockAdjustments).values({
      orgId, locationId, productId, variantId,
      beforeQty: String(beforeQty),
      afterQty: String(newQty),
      adjustment: String(adjustment),
      reason,
      employeeId,
    }).returning();

    return reply.status(200).send({ data: adj });
  });
}
