import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { kdsConnections, broadcastToKDS } from '../index';

export async function kdsRoutes(app: FastifyInstance) {
  // GET /api/v1/kds/stream?locationId=xxx — WebSocket upgrade (public; KDS devices authenticate via locationId)
  app.get('/stream', { websocket: true }, (socket, request) => {
    const q = request.query as { locationId?: string };
    const locationId = q.locationId ?? 'default';

    const ws = socket.socket;

    // Register connection
    if (!kdsConnections.has(locationId)) {
      kdsConnections.set(locationId, new Set());
    }
    kdsConnections.get(locationId)!.add(ws);
    app.log.info(`[KDS] client connected for location=${locationId} (total=${kdsConnections.get(locationId)!.size})`);

    // Greet client
    ws.send(JSON.stringify({ type: 'connected', locationId }));

    socket.on('close', () => {
      const clients = kdsConnections.get(locationId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) kdsConnections.delete(locationId);
      }
      app.log.info(`[KDS] client disconnected for location=${locationId}`);
    });

    socket.on('error', (err: Error) => {
      app.log.warn(`[KDS] socket error for location=${locationId}: ${err.message}`);
    });
  });

  // POST /api/v1/kds/bump/:orderId — mark order as bumped/ready, broadcast.
  // Accepts either a valid JWT (staff/POS) or the x-internal-secret header
  // (KDS displays, which are dedicated hardware without user sessions).
  app.post('/bump/:orderId', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const internalSecret = process.env['INTERNAL_SECRET'];
    const providedSecret = request.headers['x-internal-secret'];
    const isInternalCall = internalSecret && providedSecret === internalSecret;

    let orgId: string | null = null;

    if (isInternalCall) {
      // Trusted internal call from KDS proxy — no JWT required.
      // orgId is not available; skip tenant-scoping for this operation.
      orgId = null;
    } else {
      // Require valid JWT for non-internal callers.
      try {
        await request.jwtVerify();
        orgId = (request.user as { orgId: string }).orgId;
      } catch {
        return reply.status(401).send({ title: 'Unauthorized', status: 401 });
      }
    }

    const order = await db.query.orders.findFirst({
      where: orgId
        ? and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId))
        : eq(schema.orders.id, orderId),
    });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const bumpRows = await db
      .update(schema.orders)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(
        orgId
          ? and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId))
          : eq(schema.orders.id, orderId),
      )
      .returning();
    const updated = bumpRows[0]!;

    broadcastToKDS(order.locationId, {
      type: 'order_bumped',
      orderId,
      locationId: order.locationId,
      timestamp: new Date().toISOString(),
    });

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/kds/recall/:orderId — reverse a bump: set order back to open, re-broadcast to KDS.
  // Accepts either a valid JWT (staff/POS) or the x-internal-secret header.
  app.post('/recall/:orderId', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const internalSecret = process.env['INTERNAL_SECRET'];
    const providedSecret = request.headers['x-internal-secret'];
    const isInternalCall = internalSecret && providedSecret === internalSecret;

    let orgId: string | null = null;

    if (isInternalCall) {
      orgId = null;
    } else {
      try {
        await request.jwtVerify();
        orgId = (request.user as { orgId: string }).orgId;
      } catch {
        return reply.status(401).send({ title: 'Unauthorized', status: 401 });
      }
    }

    const order = await db.query.orders.findFirst({
      where: orgId
        ? and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId))
        : eq(schema.orders.id, orderId),
      with: { lines: true },
    });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });

    // Only allow recalling orders that were bumped (status === 'completed')
    if (order.status !== 'completed') {
      return reply.status(409).send({ title: 'Order is not in bumped state', status: 409 });
    }

    const recallRows = await db
      .update(schema.orders)
      .set({ status: 'open', completedAt: null, updatedAt: new Date() })
      .where(
        orgId
          ? and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId))
          : eq(schema.orders.id, orderId),
      )
      .returning();
    const updated = recallRows[0]!;

    // Re-broadcast as new_order so all KDS clients pick it up again
    broadcastToKDS(order.locationId, {
      type: 'new_order',
      order: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        channel: order.channel,
        tableId: order.tableId,
        locationId: order.locationId,
        lines: order.lines.map((l) => ({
          name: l.name,
          qty: Number(l.quantity),
          modifiers: (l.modifiers as { name: string }[]).map((m) => m.name),
          seatNumber: l.seatNumber,
          course: l.course,
          kdsDestination: l.kdsDestination ?? undefined,
        })),
        createdAt: order.createdAt.toISOString(),
        status: 'new',
      },
    });

    return reply.status(200).send({ data: updated });
  });
}
