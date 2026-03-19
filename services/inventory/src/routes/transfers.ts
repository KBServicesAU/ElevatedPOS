import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const createTransferSchema = z.object({
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    productName: z.string(),
    sku: z.string(),
    requestedQty: z.number().positive(),
  })),
});

export async function transferRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const transfers = await db.query.stockTransfers.findMany({
      where: eq(schema.stockTransfers.orgId, orgId),
      with: { lines: true },
      orderBy: [desc(schema.stockTransfers.createdAt)],
    });
    return reply.status(200).send({ data: transfers });
  });

  app.post('/', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = createTransferSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const { lines, ...transferData } = body.data;
    const transferNumber = `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    const [transfer] = await db.insert(schema.stockTransfers).values({ ...transferData, orgId, transferNumber, requestedByEmployeeId: employeeId }).returning();
    await db.insert(schema.stockTransferLines).values(lines.map((l) => ({ ...l, transferId: transfer.id, requestedQty: String(l.requestedQty) })));

    const created = await db.query.stockTransfers.findFirst({ where: eq(schema.stockTransfers.id, transfer.id), with: { lines: true } });
    return reply.status(201).send({ data: created });
  });

  app.post('/:id/approve', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };
    await db.update(schema.stockTransfers).set({ status: 'approved', approvedByEmployeeId: employeeId, updatedAt: new Date() }).where(and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)));
    return reply.status(200).send({ data: { status: 'approved' } });
  });

  app.post('/:id/dispatch', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db.update(schema.stockTransfers).set({ status: 'dispatched', dispatchedAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)));
    return reply.status(200).send({ data: { status: 'dispatched' } });
  });

  app.post('/:id/receive', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const transfer = await db.query.stockTransfers.findFirst({ where: and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)), with: { lines: true } });
    if (!transfer) return reply.status(404).send({ title: 'Not Found', status: 404 });

    for (const line of transfer.lines) {
      const qty = Number(line.dispatchedQty || line.requestedQty);
      const fromItem = await db.query.stockItems.findFirst({ where: and(eq(schema.stockItems.locationId, transfer.fromLocationId), eq(schema.stockItems.productId, line.productId)) });
      const toItem = await db.query.stockItems.findFirst({ where: and(eq(schema.stockItems.locationId, transfer.toLocationId), eq(schema.stockItems.productId, line.productId)) });
      if (fromItem) await db.update(schema.stockItems).set({ onHand: String(Math.max(0, Number(fromItem.onHand) - qty)), updatedAt: new Date() }).where(eq(schema.stockItems.id, fromItem.id));
      if (toItem) { await db.update(schema.stockItems).set({ onHand: String(Number(toItem.onHand) + qty), updatedAt: new Date() }).where(eq(schema.stockItems.id, toItem.id)); } else { await db.insert(schema.stockItems).values({ locationId: transfer.toLocationId, productId: line.productId, variantId: line.variantId, onHand: String(qty) }); }
      await db.update(schema.stockTransferLines).set({ receivedQty: String(qty) }).where(eq(schema.stockTransferLines.id, line.id));
    }

    await db.update(schema.stockTransfers).set({ status: 'received', receivedAt: new Date(), updatedAt: new Date() }).where(eq(schema.stockTransfers.id, id));
    return reply.status(200).send({ data: { status: 'received' } });
  });
}
