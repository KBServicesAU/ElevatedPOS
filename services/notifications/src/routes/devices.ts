import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const PLATFORMS = ['ios', 'android', 'web'] as const;

const registerDeviceSchema = z.object({
  customerId: z.string().uuid(),
  deviceToken: z.string().min(1).max(512),
  platform: z.enum(PLATFORMS),
});

export async function deviceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /devices — register a device token for push notifications
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = registerDeviceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const { customerId, deviceToken, platform } = parsed.data;

    // Check if token already exists for this org; if so, return existing record
    const existing = await db.query.deviceTokens.findFirst({
      where: and(
        eq(schema.deviceTokens.orgId, orgId),
        eq(schema.deviceTokens.deviceToken, deviceToken),
      ),
    });

    if (existing) {
      // Update platform and customer association in case they changed
      const [updated] = await db
        .update(schema.deviceTokens)
        .set({ customerId, platform, updatedAt: new Date() })
        .where(eq(schema.deviceTokens.id, existing.id))
        .returning();
      return reply.status(200).send({ data: updated, created: false });
    }

    const [created] = await db
      .insert(schema.deviceTokens)
      .values({ orgId, customerId, deviceToken, platform })
      .returning();

    return reply.status(201).send({ data: created, created: true });
  });

  // DELETE /devices/:token — unregister a device token
  app.delete('/:token', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { token } = request.params as { token: string };

    const result = await db
      .delete(schema.deviceTokens)
      .where(
        and(
          eq(schema.deviceTokens.orgId, orgId),
          eq(schema.deviceTokens.deviceToken, token),
        ),
      )
      .returning({ id: schema.deviceTokens.id });

    if (result.length === 0) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Device token not found',
        status: 404,
      });
    }

    return reply.status(204).send();
  });
}
