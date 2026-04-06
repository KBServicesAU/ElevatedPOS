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
    unitCost: z.number().positive().optional(),
  })),
});

const receiveTransferSchema = z.object({
  lines: z.array(z.object({
    lineId: z.string().uuid(),
    receivedQty: z.number().nonnegative(),
  })).optional(),
});

export async function transferRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET / — list transfers with optional filters
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { fromLocationId, toLocationId, status } = request.query as {
      fromLocationId?: string;
      toLocationId?: string;
      status?: string;
    };

    const conditions = [eq(schema.stockTransfers.orgId, orgId)];

    if (fromLocationId) {
      conditions.push(eq(schema.stockTransfers.fromLocationId, fromLocationId));
    }
    if (toLocationId) {
      conditions.push(eq(schema.stockTransfers.toLocationId, toLocationId));
    }
    if (status && ['requested', 'approved', 'dispatched', 'received', 'cancelled'].includes(status)) {
      conditions.push(eq(schema.stockTransfers.status, status as 'requested' | 'approved' | 'dispatched' | 'received' | 'cancelled'));
    }

    const transfers = await db.query.stockTransfers.findMany({
      where: and(...conditions),
      with: { lines: true },
      orderBy: [desc(schema.stockTransfers.createdAt)],
    });

    return reply.status(200).send({ data: transfers, meta: { totalCount: transfers.length } });
  });

  // POST / — create stock transfer request (status: requested, transfer number TRF-{year}-{seq})
  app.post('/', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = createTransferSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { lines, fromLocationId, toLocationId, notes } = body.data;
    const year = new Date().getFullYear();
    const seq = Date.now().toString().slice(-6);
    const transferNumber = `TRF-${year}-${seq}`;

    const transferRows = await db
      .insert(schema.stockTransfers)
      .values({
        orgId,
        fromLocationId,
        toLocationId,
        transferNumber,
        requestedByEmployeeId: employeeId,
        status: 'requested',
        ...(notes !== undefined ? { notes } : {}),
      })
      .returning();
    const transfer = transferRows[0]!;

    await db.insert(schema.stockTransferLines).values(
      lines.map((l) => ({
        transferId: transfer.id,
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        requestedQty: String(l.requestedQty),
        ...(l.variantId !== undefined ? { variantId: l.variantId } : {}),
      })),
    );

    const created = await db.query.stockTransfers.findFirst({
      where: eq(schema.stockTransfers.id, transfer.id),
      with: { lines: true },
    });

    return reply.status(201).send({ data: created });
  });

  // GET /:id — transfer detail with lines
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const transfer = await db.query.stockTransfers.findFirst({
      where: and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)),
      with: { lines: true },
    });

    if (!transfer) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    return reply.status(200).send({ data: transfer });
  });

  // POST /:id/send — draft/requested → dispatched, records dispatchedAt
  app.post('/:id/send', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.stockTransfers.findFirst({
      where: and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    if (!['requested', 'approved'].includes(existing.status)) {
      return reply.status(409).send({
        type: 'https://elevatedpos.com/errors/conflict',
        title: 'Transfer cannot be sent in its current status',
        status: 409,
        detail: `Current status: ${existing.status}`,
      });
    }

    const [updated] = await db
      .update(schema.stockTransfers)
      .set({
        status: 'dispatched',
        dispatchedAt: new Date(),
        approvedByEmployeeId: employeeId,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/receive — dispatched → received, records receivedAt, supports partial receiving
  app.post('/:id/receive', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = receiveTransferSchema.safeParse(request.body ?? {});

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const transfer = await db.query.stockTransfers.findFirst({
      where: and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)),
      with: { lines: true },
    });

    if (!transfer) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    if (transfer.status !== 'dispatched') {
      return reply.status(409).send({
        type: 'https://elevatedpos.com/errors/conflict',
        title: 'Transfer must be dispatched before receiving',
        status: 409,
        detail: `Current status: ${transfer.status}`,
      });
    }

    // Build received qty map from body, or fall back to dispatched/requested qty
    const lineQtyMap: Record<string, number> = {};
    if (body.data.lines) {
      for (const entry of body.data.lines) {
        lineQtyMap[entry.lineId] = entry.receivedQty;
      }
    }

    for (const line of transfer.lines) {
      const qty = lineQtyMap[line.id] ?? Number(line.dispatchedQty || line.requestedQty);

      // Update stock: deduct from source, add to destination
      const fromItem = await db.query.stockItems.findFirst({
        where: and(
          eq(schema.stockItems.locationId, transfer.fromLocationId),
          eq(schema.stockItems.productId, line.productId),
        ),
      });
      const toItem = await db.query.stockItems.findFirst({
        where: and(
          eq(schema.stockItems.locationId, transfer.toLocationId),
          eq(schema.stockItems.productId, line.productId),
        ),
      });

      if (fromItem) {
        await db
          .update(schema.stockItems)
          .set({ onHand: String(Math.max(0, Number(fromItem.onHand) - qty)), updatedAt: new Date() })
          .where(eq(schema.stockItems.id, fromItem.id));
      }

      if (toItem) {
        await db
          .update(schema.stockItems)
          .set({ onHand: String(Number(toItem.onHand) + qty), updatedAt: new Date() })
          .where(eq(schema.stockItems.id, toItem.id));
      } else {
        await db.insert(schema.stockItems).values({
          locationId: transfer.toLocationId,
          productId: line.productId,
          onHand: String(qty),
          ...(line.variantId !== null && line.variantId !== undefined ? { variantId: line.variantId } : {}),
        });
      }

      await db
        .update(schema.stockTransferLines)
        .set({ receivedQty: String(qty) })
        .where(eq(schema.stockTransferLines.id, line.id));
    }

    const [updated] = await db
      .update(schema.stockTransfers)
      .set({ status: 'received', receivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/cancel — cancel if still requested or approved
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.stockTransfers.findFirst({
      where: and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    if (!['requested', 'approved'].includes(existing.status)) {
      return reply.status(409).send({
        type: 'https://elevatedpos.com/errors/conflict',
        title: 'Only requested or approved transfers can be cancelled',
        status: 409,
        detail: `Current status: ${existing.status}`,
      });
    }

    const [updated] = await db
      .update(schema.stockTransfers)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/approve — approve a requested transfer
  app.post('/:id/approve', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.stockTransfers.findFirst({
      where: and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    const [updated] = await db
      .update(schema.stockTransfers)
      .set({ status: 'approved', approvedByEmployeeId: employeeId, updatedAt: new Date() })
      .where(and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });
}
