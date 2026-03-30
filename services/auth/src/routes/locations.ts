import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const tradingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  isClosed: z.boolean().default(false),
});

const createLocationSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.record(z.unknown()).optional().default({}),
  phone: z.string().max(50).optional(),
  timezone: z.string().max(100).default('Australia/Sydney'),
  type: z.enum(['retail', 'warehouse', 'kitchen']).default('retail'),
  settings: z.record(z.unknown()).optional().default({}),
});

const updateLocationSchema = createLocationSchema.partial();

const tradingHoursSchema = z.object({
  hours: z.array(tradingHourSchema).min(1),
});

export async function locationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST / — create location
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createLocationSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const [created] = await db
      .insert(schema.locations)
      .values({
        orgId,
        name: body.data.name,
        address: body.data.address,
        phone: body.data.phone,
        timezone: body.data.timezone,
        type: body.data.type,
        settings: body.data.settings,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // GET / — list org locations with optional ?type= filter
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { type } = request.query as { type?: string };

    const conditions = [
      eq(schema.locations.orgId, orgId),
      eq(schema.locations.isActive, true),
    ];

    if (type && ['retail', 'warehouse', 'kitchen'].includes(type)) {
      conditions.push(eq(schema.locations.type, type as 'retail' | 'warehouse' | 'kitchen'));
    }

    const locations = await db.query.locations.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.locations.createdAt)],
    });

    return reply.status(200).send({ data: locations, meta: { totalCount: locations.length } });
  });

  // GET /:id — location detail
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const location = await db.query.locations.findFirst({
      where: and(
        eq(schema.locations.id, id),
        eq(schema.locations.orgId, orgId),
      ),
    });

    if (!location) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    return reply.status(200).send({ data: location });
  });

  // PATCH /:id — update location
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = updateLocationSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.locations.findFirst({
      where: and(eq(schema.locations.id, id), eq(schema.locations.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    const [updated] = await db
      .update(schema.locations)
      .set({ ...body.data, updatedAt: new Date() })
      .where(and(eq(schema.locations.id, id), eq(schema.locations.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // DELETE /:id — soft delete (set isActive=false)
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.locations.findFirst({
      where: and(eq(schema.locations.id, id), eq(schema.locations.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    await db
      .update(schema.locations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.locations.id, id), eq(schema.locations.orgId, orgId)));

    return reply.status(204).send();
  });

  // POST /:id/set-trading-hours — store trading hours in location settings JSON
  app.post('/:id/set-trading-hours', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = tradingHoursSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.locations.findFirst({
      where: and(eq(schema.locations.id, id), eq(schema.locations.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    const currentSettings = (existing.settings as Record<string, unknown>) ?? {};
    const updatedSettings = { ...currentSettings, tradingHours: body.data.hours };

    const [updated] = await db
      .update(schema.locations)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(schema.locations.id, id), eq(schema.locations.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // GET /:id/trading-hours — returns trading hours from settings
  app.get('/:id/trading-hours', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const location = await db.query.locations.findFirst({
      where: and(eq(schema.locations.id, id), eq(schema.locations.orgId, orgId)),
    });

    if (!location) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    const settings = (location.settings as Record<string, unknown>) ?? {};
    const tradingHours = settings['tradingHours'] ?? [];

    return reply.status(200).send({ data: tradingHours });
  });
}
