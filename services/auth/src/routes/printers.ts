import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';

const DESTINATIONS = ['none', 'kitchen', 'bar', 'front', 'back', 'custom'] as const;
const BRANDS       = ['epson', 'star', 'senor', 'citizen', 'bixolon', 'generic'] as const;

const printerSchema = z.object({
  locationId:        z.string().uuid(),
  name:              z.string().min(1).max(100),
  brand:             z.enum(BRANDS).default('generic'),
  connectionType:    z.enum(['ip', 'usb']).default('ip'),
  host:              z.string().max(255).optional(),
  port:              z.number().int().min(1).max(65535).optional(),
  printerType:       z.enum(['receipt', 'kitchen_order']).default('receipt'),
  destination:       z.enum(DESTINATIONS).default('none'),
  customDestination: z.string().max(100).optional(),
  isActive:          z.boolean().default(true),
});

const updateSchema = printerSchema.partial().omit({ locationId: true });

export async function printerRoutes(app: FastifyInstance) {
  // All routes require a valid staff JWT
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/printers — list printers for org (optional ?locationId filter)
  app.get('/', async (request, reply) => {
    const user = request.user as { orgId: string };
    const q    = request.query as { locationId?: string };

    const conditions = [eq(schema.printers.orgId, user.orgId)];
    if (q.locationId) conditions.push(eq(schema.printers.locationId, q.locationId));

    const rows = await db.query.printers.findMany({
      where: and(...conditions),
      orderBy: (p, { asc }) => [asc(p.locationId), asc(p.name)],
    });

    return reply.send({ data: rows });
  });

  // POST /api/v1/printers — create a printer
  app.post('/', async (request, reply) => {
    const user   = request.user as { orgId: string };
    const parsed = printerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    // Verify location belongs to org
    const location = await db.query.locations.findFirst({
      where: and(
        eq(schema.locations.id, parsed.data.locationId),
        eq(schema.locations.orgId, user.orgId),
      ),
    });
    if (!location) return reply.status(404).send({ title: 'Location not found', status: 404 });

    const [printer] = await db.insert(schema.printers).values({
      orgId:             user.orgId,
      locationId:        parsed.data.locationId,
      name:              parsed.data.name,
      brand:             parsed.data.brand,
      connectionType:    parsed.data.connectionType,
      host:              parsed.data.host ?? null,
      port:              parsed.data.port ?? 9100,
      printerType:       parsed.data.printerType,
      destination:       parsed.data.destination,
      customDestination: parsed.data.customDestination ?? null,
      isActive:          parsed.data.isActive,
    }).returning();

    return reply.status(201).send({ data: printer });
  });

  // PATCH /api/v1/printers/:id — update a printer
  app.patch('/:id', async (request, reply) => {
    const user   = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const existing = await db.query.printers.findFirst({
      where: and(eq(schema.printers.id, id), eq(schema.printers.orgId, user.orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Printer not found', status: 404 });

    // Strip undefined values — Drizzle with exactOptionalPropertyTypes: true
    // requires absent fields to be omitted entirely, not set to undefined.
    // Data is already Zod-validated above so the cast is safe.
    const patch = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as Record<string, any>;

    const [updated] = await db.update(schema.printers)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.printers.id, id), eq(schema.printers.orgId, user.orgId)))
      .returning();

    return reply.send({ data: updated });
  });

  // DELETE /api/v1/printers/:id — delete a printer
  app.delete('/:id', async (request, reply) => {
    const user   = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.printers.findFirst({
      where: and(eq(schema.printers.id, id), eq(schema.printers.orgId, user.orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Printer not found', status: 404 });

    await db.delete(schema.printers)
      .where(and(eq(schema.printers.id, id), eq(schema.printers.orgId, user.orgId)));

    return reply.status(204).send();
  });
}
