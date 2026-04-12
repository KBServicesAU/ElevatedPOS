import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';
import { hashToken } from '../lib/tokens';

export async function displayRoutes(app: FastifyInstance) {

  // GET /api/v1/display/content — device auth, returns content for this device
  app.get('/content', async (request, reply) => {
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) return reply.status(401).send({ error: 'Unauthorized' });
    const token = header.slice(7);
    const tokenHash = hashToken(token);

    const device = await db.query.devices.findFirst({
      where: and(eq(schema.devices.tokenHash, tokenHash), eq(schema.devices.status, 'active')),
    });
    if (!device) return reply.status(401).send({ error: 'Device not found or revoked' });
    if (device.role !== 'display') return reply.status(403).send({ error: 'Not a display device' });

    const contentRow = await db.query.displayContent.findFirst({
      where: eq(schema.displayContent.deviceId, device.id),
    });

    return reply.send({
      data: {
        content: contentRow?.content ?? null,
        publishedAt: contentRow?.publishedAt ?? null,
        pollIntervalSeconds: 30,
        deviceId: device.id,
        label: device.label,
      },
    });
  });

  // GET /api/v1/display/screens — staff auth, list display devices with content
  app.get('/screens', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };

    const devices = await db.query.devices.findMany({
      where: and(
        eq(schema.devices.orgId, user.orgId),
        eq(schema.devices.role, 'display' as any),
        eq(schema.devices.status, 'active'),
      ),
      orderBy: (d, { asc }) => [asc(d.createdAt)],
    });

    const contentRows = await Promise.all(
      devices.map((d) =>
        db.query.displayContent.findFirst({
          where: eq(schema.displayContent.deviceId, d.id),
        })
      )
    );

    const result = devices.map((d, i) => ({
      id: d.id,
      label: d.label,
      locationId: d.locationId,
      lastSeenAt: d.lastSeenAt,
      status: d.status,
      content: contentRows[i]?.content ?? null,
      publishedAt: contentRows[i]?.publishedAt ?? null,
    }));

    return reply.send({ data: result });
  });

  // PUT /api/v1/display/screens/:id/content — staff auth, publish content to a device
  app.put('/screens/:id/content', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };

    const body = z.object({
      content: z.record(z.unknown()),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    // Verify device belongs to this org and is a display device
    const device = await db.query.devices.findFirst({
      where: and(
        eq(schema.devices.id, id),
        eq(schema.devices.orgId, user.orgId),
        eq(schema.devices.status, 'active'),
      ),
    });
    if (!device) return reply.status(404).send({ error: 'Device not found' });
    if (device.role !== 'display') return reply.status(400).send({ error: 'Not a display device' });

    const now = new Date();

    // Upsert display content
    const existing = await db.query.displayContent.findFirst({
      where: eq(schema.displayContent.deviceId, id),
    });

    if (existing) {
      await db.update(schema.displayContent)
        .set({ content: body.data.content, publishedAt: now, publishedBy: user.sub, updatedAt: now })
        .where(eq(schema.displayContent.id, existing.id));
    } else {
      await db.insert(schema.displayContent).values({
        orgId: user.orgId,
        deviceId: id,
        content: body.data.content,
        publishedAt: now,
        publishedBy: user.sub,
      });
    }

    return reply.send({ data: { deviceId: id, publishedAt: now } });
  });
}
