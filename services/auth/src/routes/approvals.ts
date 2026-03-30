import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const createApprovalSchema = z.object({
  type: z.enum(['discount', 'refund', 'void', 'cash_disbursement', 'stock_adjustment', 'other']),
  locationId: z.string().uuid(),
  amount: z.number().optional(),
  metadata: z.record(z.unknown()).default({}),
  reason: z.string().min(1),
});

const denyApprovalSchema = z.object({
  approverNote: z.string().min(1),
});

export async function approvalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /api/v1/approvals — create approval request
  app.post('/', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = createApprovalSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const [created] = await db
      .insert(schema.approvalRequests)
      .values({
        orgId,
        type: body.data.type,
        status: 'pending',
        requestedBy: employeeId,
        locationId: body.data.locationId,
        amount: body.data.amount?.toString(),
        metadata: body.data.metadata,
        reason: body.data.reason,
        requestedAt: new Date(),
        expiresAt,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // GET /api/v1/approvals — list pending approvals for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const approvals = await db.query.approvalRequests.findMany({
      where: and(
        eq(schema.approvalRequests.orgId, orgId),
        eq(schema.approvalRequests.status, 'pending'),
      ),
      orderBy: [desc(schema.approvalRequests.requestedAt)],
    });

    return reply.status(200).send({ data: approvals, meta: { totalCount: approvals.length } });
  });

  // GET /api/v1/approvals/:id — get approval
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const approval = await db.query.approvalRequests.findFirst({
      where: and(eq(schema.approvalRequests.id, id), eq(schema.approvalRequests.orgId, orgId)),
    });

    if (!approval) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    return reply.status(200).send({ data: approval });
  });

  // POST /api/v1/approvals/:id/approve — approve request
  app.post('/:id/approve', async (request, reply) => {
    const { orgId, sub: approverId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.approvalRequests.findFirst({
      where: and(eq(schema.approvalRequests.id, id), eq(schema.approvalRequests.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    if (existing.status !== 'pending') {
      return reply.status(409).send({
        type: 'https://nexus.app/errors/conflict',
        title: 'Approval already resolved',
        status: 409,
      });
    }

    const now = new Date();

    if (existing.expiresAt < now) {
      return reply.status(410).send({
        type: 'https://nexus.app/errors/expired',
        title: 'Approval request has expired',
        status: 410,
      });
    }

    const [updated] = await db
      .update(schema.approvalRequests)
      .set({ status: 'approved', approvedBy: approverId, resolvedAt: now })
      .where(and(eq(schema.approvalRequests.id, id), eq(schema.approvalRequests.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/approvals/:id/deny — deny request
  app.post('/:id/deny', async (request, reply) => {
    const { orgId, sub: approverId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };
    const body = denyApprovalSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.approvalRequests.findFirst({
      where: and(eq(schema.approvalRequests.id, id), eq(schema.approvalRequests.orgId, orgId)),
    });

    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
    }

    if (existing.status !== 'pending') {
      return reply.status(409).send({
        type: 'https://nexus.app/errors/conflict',
        title: 'Approval already resolved',
        status: 409,
      });
    }

    const [updated] = await db
      .update(schema.approvalRequests)
      .set({
        status: 'denied',
        approvedBy: approverId,
        approverNote: body.data.approverNote,
        resolvedAt: new Date(),
      })
      .where(and(eq(schema.approvalRequests.id, id), eq(schema.approvalRequests.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });
}
