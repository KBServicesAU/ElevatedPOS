import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const createGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  royaltyRate: z.number().min(0).max(1).default(0.05),
  royaltyCalculation: z.enum(['gross_sales', 'net_sales', 'revenue']).default('gross_sales'),
  billingCycle: z.enum(['weekly', 'monthly']).default('monthly'),
  royaltyStartDate: z.string().optional(),
  isActive: z.boolean().default(true),
});

const addLocationSchema = z.object({
  locationId: z.string().uuid(),
  franchiseeOrgId: z.string().uuid(),
  franchiseeContactName: z.string().optional(),
  franchiseeEmail: z.string().email().optional(),
  status: z.enum(['active', 'suspended', 'terminated']).default('active'),
});

export async function franchiseRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /groups — list franchise groups for org
  app.get('/groups', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const groups = await db.query.franchiseGroups.findMany({
      where: eq(schema.franchiseGroups.orgId, orgId),
    });
    return reply.status(200).send({ data: groups });
  });

  // POST /groups — create franchise group
  app.post('/groups', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const createdRows = await db
      .insert(schema.franchiseGroups)
      .values({
        orgId,
        name: parsed.data.name,
        description: parsed.data.description,
        logoUrl: parsed.data.logoUrl,
        royaltyRate: String(parsed.data.royaltyRate),
        royaltyCalculation: parsed.data.royaltyCalculation,
        billingCycle: parsed.data.billingCycle,
        royaltyStartDate: parsed.data.royaltyStartDate,
        isActive: parsed.data.isActive,
      })
      .returning();
    return reply.status(201).send({ data: createdRows[0] });
  });

  // GET /groups/:id — get group with locations
  app.get('/groups/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, id), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${id} not found`,
      });
    }
    const locations = await db.query.franchiseLocations.findMany({
      where: eq(schema.franchiseLocations.groupId, id),
    });
    return reply.status(200).send({ data: { ...group, locations } });
  });

  // PATCH /groups/:id — update group settings
  app.patch('/groups/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = createGroupSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const existing = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, id), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${id} not found`,
      });
    }
    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };
    if (parsed.data.royaltyRate !== undefined) {
      updateData['royaltyRate'] = String(parsed.data.royaltyRate);
    }
    const updatedRows = await db
      .update(schema.franchiseGroups)
      .set(updateData)
      .where(and(eq(schema.franchiseGroups.id, id), eq(schema.franchiseGroups.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updatedRows[0] });
  });

  // GET /groups/:id/locations — list all franchise locations
  app.get('/groups/:id/locations', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, id), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${id} not found`,
      });
    }
    const locations = await db.query.franchiseLocations.findMany({
      where: eq(schema.franchiseLocations.groupId, id),
    });
    return reply.status(200).send({ data: locations });
  });

  // POST /groups/:id/locations — add location to franchise
  app.post('/groups/:id/locations', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, id), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${id} not found`,
      });
    }
    const parsed = addLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const locationRows = await db
      .insert(schema.franchiseLocations)
      .values({
        groupId: id,
        locationId: parsed.data.locationId,
        franchiseeOrgId: parsed.data.franchiseeOrgId,
        franchiseeContactName: parsed.data.franchiseeContactName ?? null,
        franchiseeEmail: parsed.data.franchiseeEmail ?? null,
        status: parsed.data.status,
      })
      .returning();
    return reply.status(201).send({ data: locationRows[0] });
  });

  // GET /groups/:id/network — network overview
  app.get('/groups/:id/network', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, id), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${id} not found`,
      });
    }
    const locations = await db.query.franchiseLocations.findMany({
      where: eq(schema.franchiseLocations.groupId, id),
    });
    const activeCount = locations.filter((l) => l.status === 'active').length;
    const suspendedCount = locations.filter((l) => l.status === 'suspended').length;
    return reply.status(200).send({
      data: {
        group,
        locations,
        summary: {
          total: locations.length,
          active: activeCount,
          suspended: suspendedCount,
          terminated: locations.length - activeCount - suspendedCount,
        },
      },
    });
  });
}
