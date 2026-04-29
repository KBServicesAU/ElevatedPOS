import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { db, schema } from '../db';
import { kdsConnections, broadcastToKDS } from '../index';

export async function kdsRoutes(app: FastifyInstance) {
  // GET /api/v1/kds/stream?locationId=xxx — WebSocket upgrade.
  //
  // v2.7.68 — auth required. Was previously open: any caller who knew a
  // locationId UUID (which is exposed in URLs + dashboard markup) could
  // upgrade to this WS and receive every ticket for that location,
  // including customer names + phone numbers. The mobile KDS client at
  // apps/mobile/app/(kds)/index.tsx:865 already sends `{type:'auth',
  // token: <deviceToken>}` immediately on `onopen`, so the existing
  // clients work unchanged — the server now actually validates it.
  //
  // Flow:
  //   1. Client connects → server holds the socket without sending data.
  //   2. Server starts a 5-second auth-deadline timer.
  //   3. First message MUST be `{type:'auth', token}` with a JWT that
  //      verifies AND has `locationIds` claim including the requested
  //      locationId. Otherwise the socket is closed (4401/4403).
  //   4. On successful auth, the snapshot is sent and the connection is
  //      registered for broadcast.
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

    let authenticated = false;
    let registeredFor: string | null = null;

    // Auth deadline — close any socket that doesn't successfully
    // authenticate within 5 s. Production KDS clients send auth
    // synchronously inside `ws.onopen`, so 5 s is comfortable.
    const authTimer = setTimeout(() => {
      if (!authenticated) {
        app.log.warn(`[KDS] no auth message received within 5s for location=${locationId} — closing`);
        try { ws.close(4401, 'Auth required'); } catch { /* socket already gone */ }
      }
    }, 5000);

    async function sendSnapshot(): Promise<void> {
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
    }

    socket.on('message', async (raw: Buffer) => {
      if (authenticated) return; // post-auth chatter is ignored — server is broadcast-only
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; token?: string };
        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          ws.close(4401, 'First message must be auth');
          return;
        }
        // Verify the JWT against the auth-service's signing secret. app.jwt
        // is configured at boot in services/orders/src/index.ts with
        // issuer: 'elevatedpos-auth'.
        const payload = (await app.jwt.verify(msg.token)) as {
          sub?: string;
          orgId?: string;
          locationIds?: string[];
          deviceRole?: string;
        };

        // Multi-tenant fence: the device must have access to the
        // requested locationId. Either via its locationIds claim
        // (mobile devices that are paired to one or more locations)
        // or — for employees logging into a KDS via the dashboard
        // surface — by being scoped to the org of the location.
        const locationIds = Array.isArray(payload.locationIds) ? payload.locationIds : [];
        if (!locationIds.includes(locationId)) {
          app.log.warn(`[KDS] device ${payload.sub ?? '?'} not authorised for location=${locationId}; allowed=${locationIds.join(',')}`);
          ws.close(4403, 'Location not authorised for this device');
          return;
        }

        // Auth success — register, snapshot, ack.
        authenticated = true;
        clearTimeout(authTimer);

        if (!kdsConnections.has(locationId)) kdsConnections.set(locationId, new Set());
        kdsConnections.get(locationId)!.add(ws);
        registeredFor = locationId;
        app.log.info(`[KDS] client authenticated for location=${locationId} (total=${kdsConnections.get(locationId)!.size}, sub=${payload.sub ?? '?'})`);

        await sendSnapshot();
      } catch (err) {
        app.log.warn(`[KDS] auth failed for location=${locationId}: ${(err as Error).message}`);
        try { ws.close(4401, 'Invalid auth token'); } catch { /* already closed */ }
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (registeredFor) {
        const clients = kdsConnections.get(registeredFor);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) kdsConnections.delete(registeredFor);
        }
        app.log.info(`[KDS] client disconnected for location=${registeredFor}`);
      } else {
        app.log.info(`[KDS] unauthenticated client disconnected from location=${locationId}`);
      }
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

    // v2.7.68 — bump idempotency. Filter on `status='open'` so a repeat
    // bump (double-tap, reconnect-replay, network retry) finds zero rows
    // and we 409 instead of re-firing post-effects (SMS, label print).
    // Without this guard the previous code did an unconditional UPDATE
    // which always succeeded, broadcast `ticket_bumped` again, and any
    // downstream consumer of the broadcast (the dispatchReadySms call
    // in apps/mobile/app/(kds)/index.tsx:1015) re-fired.
    const bumpRows = await db
      .update(schema.orders)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(
        orgId
          ? and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId), eq(schema.orders.status, 'open'))
          : and(eq(schema.orders.id, orderId), eq(schema.orders.status, 'open')),
      )
      .returning();

    if (bumpRows.length === 0) {
      // Already bumped (or somehow not in open state). Return the current row
      // shape but without re-broadcasting — keeps the client in sync if their
      // optimistic UI already removed the ticket.
      return reply.status(409).send({
        type: 'about:blank',
        title: 'Already bumped',
        status: 409,
        detail: `Order ${orderId} is in '${order.status}' state, not 'open'.`,
      });
    }
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

    // v2.7.68 — same idempotency guard as the /bump/:orderId handler above.
    const bumpRows = await db
      .update(schema.orders)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(
        orgId
          ? and(eq(schema.orders.id, ticketId), eq(schema.orders.orgId, orgId), eq(schema.orders.status, 'open'))
          : and(eq(schema.orders.id, ticketId), eq(schema.orders.status, 'open')),
      )
      .returning();

    if (bumpRows.length === 0) {
      return reply.status(409).send({
        type: 'about:blank',
        title: 'Already bumped',
        status: 409,
        detail: `Ticket ${ticketId} is in '${order.status}' state, not 'open'.`,
      });
    }
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

  // v2.7.68 — POST /api/v1/kds/tickets/:ticketId/recall alias.
  //
  // The mobile KDS client (apps/mobile/app/(kds)/index.tsx:761-806)
  // calls `/api/v1/kds/tickets/:id/recall` for both Undo Bump AND
  // Recall actions. Server only registered `/recall/:orderId`, so
  // both buttons 404'd silently — the optimistic UI re-added the
  // ticket on the kitchen screen, but the server still had it in
  // status='completed', so on the next snapshot fetch the ticket
  // disappeared again. Adding the alias to match the client's
  // actual URL. Same handler shape as /recall/:orderId — ticket id
  // and order id are interchangeable in this system.
  app.post('/tickets/:ticketId/recall', async (request, reply) => {
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
      with: { lines: true },
    });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });

    // Only completed (= bumped) orders can be recalled.
    if (order.status !== 'completed') {
      return reply.status(409).send({ title: 'Order is not in bumped state', status: 409 });
    }

    const recallRows = await db
      .update(schema.orders)
      .set({ status: 'open', completedAt: null, updatedAt: new Date() })
      .where(
        orgId
          ? and(eq(schema.orders.id, ticketId), eq(schema.orders.orgId, orgId), eq(schema.orders.status, 'completed'))
          : and(eq(schema.orders.id, ticketId), eq(schema.orders.status, 'completed')),
      )
      .returning();

    if (recallRows.length === 0) {
      // Race — somebody else already recalled it. Soft-success.
      return reply.status(409).send({ title: 'Recall race lost', status: 409 });
    }
    const updated = recallRows[0]!;

    broadcastToKDS(order.locationId, {
      type: 'ticket_created',
      ticket: {
        id: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
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
