import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const CHECK_TYPES = ['required_menu_items', 'approved_pricing', 'active_status'] as const;

export async function complianceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /groups/:groupId/compliance/check — run compliance check across all locations
  app.post('/groups/:groupId/compliance/check', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId } = request.params as { groupId: string };

    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }

    const locations = await db.query.franchiseLocations.findMany({
      where: and(
        eq(schema.franchiseLocations.groupId, groupId),
        eq(schema.franchiseLocations.status, 'active'),
      ),
    });

    const checks = [];
    const now = new Date();

    for (const loc of locations) {
      for (const checkType of CHECK_TYPES) {
        // Mock: required_menu_items and approved_pricing always compliant
        // active_status: compliant since we only process active locations
        const status = 'compliant' as const;
        const details = {
          locationId: loc.locationId,
          checkType,
          message: `${checkType} check passed (mock)`,
          checkedAt: now.toISOString(),
        };

        const [check] = await db
          .insert(schema.networkComplianceChecks)
          .values({
            groupId,
            locationId: loc.locationId,
            checkType,
            status,
            details,
            checkedAt: now,
          })
          .returning();
        checks.push(check);
      }
    }

    return reply.status(201).send({
      data: checks,
      meta: {
        locationsChecked: locations.length,
        checksRun: checks.length,
      },
    });
  });

  // GET /groups/:groupId/compliance — list compliance checks
  app.get('/groups/:groupId/compliance', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId } = request.params as { groupId: string };
    const q = request.query as { locationId?: string; checkType?: string; status?: string };

    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }

    let checks = await db.query.networkComplianceChecks.findMany({
      where: eq(schema.networkComplianceChecks.groupId, groupId),
    });

    if (q.locationId) checks = checks.filter((c) => c.locationId === q.locationId);
    if (q.checkType) checks = checks.filter((c) => c.checkType === q.checkType);
    if (q.status) checks = checks.filter((c) => c.status === q.status);

    return reply.status(200).send({ data: checks });
  });

  // GET /groups/:groupId/compliance/summary — summary by location
  app.get('/groups/:groupId/compliance/summary', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId } = request.params as { groupId: string };

    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }

    const checks = await db.query.networkComplianceChecks.findMany({
      where: eq(schema.networkComplianceChecks.groupId, groupId),
    });

    // Group by locationId
    const byLocation = new Map<
      string,
      { compliant: number; nonCompliant: number; pending: number; total: number }
    >();

    for (const check of checks) {
      const existing = byLocation.get(check.locationId) ?? {
        compliant: 0,
        nonCompliant: 0,
        pending: 0,
        total: 0,
      };
      existing.total++;
      if (check.status === 'compliant') existing.compliant++;
      else if (check.status === 'non_compliant') existing.nonCompliant++;
      else existing.pending++;
      byLocation.set(check.locationId, existing);
    }

    const summary = Array.from(byLocation.entries()).map(([locationId, counts]) => ({
      locationId,
      ...counts,
      complianceRate:
        counts.total > 0 ? Math.round((counts.compliant / counts.total) * 100) : 0,
    }));

    return reply.status(200).send({ data: summary });
  });
}
