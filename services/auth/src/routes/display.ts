import type { FastifyInstance } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
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

    // v2.7.80 — fall back to the org-level default template when no
    // device-specific content has been published yet. Lets a merchant
    // pair a display and have it immediately render the same content
    // they designed in the dashboard before the device existed.
    const contentRow = await db.query.displayContent.findFirst({
      where: eq(schema.displayContent.deviceId, device.id),
    });
    let resolved = contentRow;
    if (!resolved?.content) {
      const fallback = await db.query.displayContent.findFirst({
        where: and(
          eq(schema.displayContent.orgId, device.orgId),
          isNull(schema.displayContent.deviceId),
        ),
      });
      if (fallback?.content) resolved = fallback;
    }

    return reply.send({
      data: {
        content: resolved?.content ?? null,
        publishedAt: resolved?.publishedAt ?? null,
        pollIntervalSeconds: 30,
        deviceId: device.id,
        label: device.label,
        // Tells the device whether the content it's rendering is the
        // org default or a per-device override. Useful for diagnostics.
        isDefault: resolved != null && resolved.deviceId === null,
      },
    });
  });

  // ── Org-level default template (v2.7.80) ─────────────────────────────────────
  // Single-row endpoints that read/write the (orgId, deviceId IS NULL)
  // row in display_content. Used by the dashboard editor's
  // "Default Template" mode so merchants can design signage content
  // before any display device is paired.

  // GET /api/v1/display/default-content — staff auth, fetch org default
  app.get('/default-content', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };
    const row = await db.query.displayContent.findFirst({
      where: and(
        eq(schema.displayContent.orgId, user.orgId),
        isNull(schema.displayContent.deviceId),
      ),
    });
    return reply.send({
      data: {
        content: row?.content ?? null,
        publishedAt: row?.publishedAt ?? null,
      },
    });
  });

  // PUT /api/v1/display/default-content — staff auth, save org default
  app.put('/default-content', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string; sub: string };
    const body = z.object({ content: z.record(z.unknown()) }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation error', issues: body.error.issues });
    }

    const now = new Date();
    const existing = await db.query.displayContent.findFirst({
      where: and(
        eq(schema.displayContent.orgId, user.orgId),
        isNull(schema.displayContent.deviceId),
      ),
    });

    if (existing) {
      await db
        .update(schema.displayContent)
        .set({ content: body.data.content, publishedAt: now, publishedBy: user.sub, updatedAt: now })
        .where(eq(schema.displayContent.id, existing.id));
    } else {
      await db.insert(schema.displayContent).values({
        orgId: user.orgId,
        deviceId: null,
        content: body.data.content,
        publishedAt: now,
        publishedBy: user.sub,
      });
    }
    return reply.status(200).send({ ok: true, publishedAt: now });
  });

  // GET /api/v1/display/screens — staff auth, list display devices with content
  //
  // v2.7.51 — response shape now matches the dashboard's `DisplayScreen`
  // interface verbatim:
  //   { id, label, locationId, lastSeenAt, status: 'online'|'offline', hasContent }
  // Previously this route returned `status: 'active'|'revoked'` (the device
  // row's status enum) and `content: object|null` + `publishedAt`. The
  // dashboard treats `screens.length === 0` as "No display screens", and
  // any error in the proxy/parse path silently degrades to that state, so
  // mismatches here become invisible blank pages rather than visible
  // failures. Return the right shape and there's nothing to mismatch.
  app.get('/screens', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { orgId: string };

    const devices = await db.query.devices.findMany({
      where: and(
        eq(schema.devices.orgId, user.orgId),
        eq(schema.devices.role, 'display'),
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

    // 5 minutes since last heartbeat = online. Devices without a
    // lastSeenAt (just paired, never booted) report offline until they
    // first call /api/v1/devices/access-token.
    const ONLINE_WINDOW_MS = 5 * 60_000;
    const now = Date.now();

    const result = devices.map((d, i) => {
      const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
      const online = lastSeen > 0 && now - lastSeen < ONLINE_WINDOW_MS;
      return {
        id: d.id,
        label: d.label,
        locationId: d.locationId,
        lastSeenAt: d.lastSeenAt,
        status: online ? 'online' as const : 'offline' as const,
        hasContent: contentRows[i]?.content != null,
      };
    });

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
