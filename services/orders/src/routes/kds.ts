import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { kdsConnections, broadcastToKDS } from '../index';

export async function kdsRoutes(app: FastifyInstance) {
  // GET /api/v1/kds/stream?locationId=xxx — WebSocket upgrade (public; KDS devices authenticate via locationId)
  app.get('/stream', { websocket: true }, (socket, request) => {
    const q = request.query as { locationId?: string };
    const locationId = q.locationId ?? 'default';

    // Register connection
    if (!kdsConnections.has(locationId)) {
      kdsConnections.set(locationId, new Set());
    }
    kdsConnections.get(locationId)!.add(socket);
    app.log.info(`[KDS] client connected for location=${locationId} (total=${kdsConnections.get(locationId)!.size})`);

    // Greet client
    socket.send(JSON.stringify({ type: 'connected', locationId }));

    socket.on('close', () => {
      const clients = kdsConnections.get(locationId);
      if (clients) {
        clients.delete(socket);
        if (clients.size === 0) kdsConnections.delete(locationId);
      }
      app.log.info(`[KDS] client disconnected for location=${locationId}`);
    });

    socket.on('error', (err: Error) => {
      app.log.warn(`[KDS] socket error for location=${locationId}: ${err.message}`);
    });
  });

  // POST /api/v1/kds/bump/:orderId — mark order as bumped/ready, broadcast
  app.post('/bump/:orderId', { onRequest: [app.authenticate] } as Parameters<typeof app.post>[1], async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { orderId } = request.params as { orderId: string };

    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId)),
    });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const [updated] = await db
      .update(schema.orders)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId)))
      .returning();

    broadcastToKDS(order.locationId, {
      type: 'order_bumped',
      orderId,
      locationId: order.locationId,
      timestamp: new Date().toISOString(),
    });

    return reply.status(200).send({ data: updated });
  });
}
