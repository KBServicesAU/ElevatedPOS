import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db';

// ── Schemas ───────────────────────────────────────────────────────────────────

const createAuditLogSchema = z.object({
  orgId: z.string().uuid().optional(),
  platformUserId: z.string().uuid().optional(),
  actorName: z.string().max(200).optional(),
  action: z.string().min(1).max(100),
  resourceType: z.string().min(1).max(100),
  resourceId: z.string().max(200).optional(),
  detail: z.record(z.unknown()).optional(),
  ipAddress: z.string().max(45).optional(),
});

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function auditLogRoutes(app: FastifyInstance) {
  // NOTE: GET /api/v1/audit-logs is now owned by `systemAuditLogRoutes`
  // (services/auth/src/routes/systemAuditLogs.ts), which extends it with
  // /:id, /export, and godmode variants. We previously registered a duplicate
  // GET /  here at the same prefix, causing
  //   FastifyError [FST_ERR_DUPLICATED_ROUTE]: Method 'GET' already declared
  //     for route '/api/v1/audit-logs'
  // at boot. Auth was crashing on every fresh pod and only the v2.7.47 pod
  // (which predated systemAuditLogs.ts) stayed alive. The legacy GET handler
  // was redundant and has been removed; this plugin now exposes only the
  // internal-write endpoint below, which has no conflicting peer.

  // POST /api/v1/audit-logs/internal — internal only (x-internal-token header)
  app.post('/internal', async (request, reply) => {
    const internalToken = process.env['INTERNAL_TOKEN'];
    const provided = request.headers['x-internal-token'];

    if (!internalToken || provided !== internalToken) {
      return reply.status(401).send({ title: 'Unauthorized', status: 401, detail: 'Invalid internal token.' });
    }

    const body = createAuditLogSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const [created] = await db
      .insert(schema.auditLogs)
      .values({
        orgId: body.data.orgId ?? null,
        platformUserId: body.data.platformUserId ?? null,
        actorName: body.data.actorName ?? null,
        action: body.data.action,
        resourceType: body.data.resourceType,
        resourceId: body.data.resourceId ?? null,
        detail: body.data.detail ?? null,
        ipAddress: body.data.ipAddress ?? null,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });
}
