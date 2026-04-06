import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';

const ingestSchema = z.object({
  orgId: z.string().uuid(),
  event: z.string().min(1),
  payload: z.record(z.unknown()),
});

export async function ingestRoutes(app: FastifyInstance) {
  // POST /ingest — internal route for other services to trigger webhook deliveries
  app.post('/ingest', async (request, reply) => {
    const internalSecret = process.env['INTERNAL_SECRET'];
    const providedSecret = request.headers['x-internal-secret'];

    if (!internalSecret || providedSecret !== internalSecret) {
      return reply.status(401).send({ title: 'Unauthorized', status: 401, detail: 'Invalid internal secret' });
    }

    const body = ingestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { orgId, event, payload } = body.data;

    // Find all active endpoints for this org that subscribe to this event
    const endpoints = await db.query.webhookEndpoints.findMany({
      where: and(
        eq(schema.webhookEndpoints.orgId, orgId),
        eq(schema.webhookEndpoints.status, 'active'),
      ),
    });

    const matchingEndpoints = endpoints.filter((ep) =>
      ep.events.includes(event) || ep.events.includes('*'),
    );

    if (matchingEndpoints.length === 0) {
      return reply.status(200).send({ queued: 0 });
    }

    const now = new Date();

    await db.insert(schema.webhookDeliveries).values(
      matchingEndpoints.map((ep) => ({
        endpointId: ep.id,
        event,
        payload: { event, data: payload } as Record<string, unknown>,
        status: 'pending' as const,
        nextRetryAt: now,
      })),
    );

    return reply.status(200).send({ queued: matchingEndpoints.length });
  });
}
