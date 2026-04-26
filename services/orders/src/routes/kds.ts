import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { db, schema } from '../db';
import { kdsConnections, broadcastToKDS } from '../index';

export async function kdsRoutes(app: FastifyInstance) {
  // GET /api/v1/kds/stream?locationId=xxx — WebSocket upgrade (public; KDS
  // devices authenticate via locationId in the query string; the deviceToken
  // is sent as the first message over the already-upgraded socket).
  //
  // v2.7.40 — on connect, the KDS app expects a `snapshot` message with the
  // currently-open tickets for the location. Before this release the server
  // sent `{type:'connected'}`, which the client ignored — so even after a
  // successful WebSocket handshake the KDS rendered an empty board until
  // a brand-new order arrived, and any order placed BEFORE the KDS reconnect
  // stayed invisible forever. Now we send the outstanding open orders up
  // front and the board hydrates immediately.
  app.get('/stream', { websocket: true }, async (socket, request) => {
    const q = request.query as { locationId?: string };
    const locationId = q.locationId ?? 'default';

    const ws = socket.socket;

    // Register connection
    if (!kdsConnections.has(locationId)) {
      kdsConnections.set(locationId, new Set());
    }
    kdsConnections.get(locationId)!.add(ws);
    app.log.info(`[KDS] client connected for location=${locationId} (total=${kdsConnections.get(locationId)!.size})`);

    // Build the initial snapshot of open orders for this location. Capped
    // to the 50 most-recent to keep the WS frame small; a busy kitchen
    // rarely has more than a handful outstanding at once.
    try {
      const open = await db.query.orders.findMany({
        where: and(
          eq(schema.orders.locationId, locationId),
          inArray(schema.orders.status, ['open'] as const),
        ),
        with: { lines: true },
        orderBy: [desc(schema.orders.createdAt)],
        limit: 50,
      });
      const tickets = open.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        channel: o.channel,
        // v2.7.44 — surface orderType (dine_in / takeaway / delivery /
        // retail) so the KDS mobile app can render the channel pill
        // next to the order number.
        orderType: o.orderType,
        items: o.lines.map((l) => ({
          name: l.name,
          qty: Number(l.quantity),
          modifiers: (l.modifiers as { name: string }[]).map((m) => m.name),
          notes: l.notes ?? undefined,
          station: l.kdsDestination ?? undefined,
        })),
        createdAt: o.createdAt.toISOString(),
        status: 'pending' as const,
      }));
      ws.send(JSON.stringify({ type: 'snapshot', tickets }));
    } catch (err) {
      app.log.warn(`[KDS] failed to build snapshot for location=${locationId}: ${(err as Error).message}`);
      // Fall back to an empty snapshot so the client still transitions
      // into the "connected, no tickets" state instead of hanging.
      ws.send(JSON.stringify({ type: 'snapshot', tickets: [] }));
    }

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

    // v2.7.40 — client listens for `ticket_bumped` (not `order_bumped`).
    // Keep the payload field `ticketId` so the KDS filter matches.
    broadcastToKDS(order.locationId, {
      type: 'ticket_bumped',
      ticketId: orderId,
      locationId: order.locationId,
      timestamp: new Date().toISOString(),
    });

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/kds/tickets/:ticketId/bump — v2.7.40 alias so the KDS mobile
  // app (which uses the tickets/ path) can bump without a 404. Internally
  // equivalent to /bump/:orderId. Ticket id === order id in this system.
  app.post('/tickets/:ticketId/bump', async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
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
        ? and(eq(schema.orders.id, ticketId), eq(schema.orders.orgId, orgId))
        : eq(schema.orders.id, ticketId),
    });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const bumpRows = await db
      .update(schema.orders)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(
        orgId
          ? and(eq(schema.orders.id, ticketId), eq(schema.orders.orgId, orgId))
          : eq(schema.orders.id, ticketId),
      )
      .returning();
    const updated = bumpRows[0]!;

    broadcastToKDS(order.locationId, {
      type: 'ticket_bumped',
      ticketId,
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

    // v2.7.40 — re-broadcast using the `ticket_created` envelope the KDS
    // app listens for. Same shape as a fresh order so the screen shows it
    // as a live ticket again (same createdAt preserves the elapsed timer).
    broadcastToKDS(order.locationId, {
      type: 'ticket_created',
      ticket: {
        id: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
        // v2.7.44 — see snapshot block above; same field for parity.
        orderType: order.orderType,
        items: order.lines.map((l) => ({
          name: l.name,
          qty: Number(l.quantity),
          modifiers: (l.modifiers as { name: string }[]).map((m) => m.name),
          notes: l.notes ?? undefined,
          station: l.kdsDestination ?? undefined,
        })),
        createdAt: order.createdAt.toISOString(),
        status: 'pending' as const,
      },
    });

    return reply.status(200).send({ data: updated });
  });
}
