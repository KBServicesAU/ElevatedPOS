import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';

// ── Auth helpers ──────────────────────────────────────────────────────────────

interface PlatformPayload {
  sub: string;
  role: string;
  type: string;
}

async function authenticatePlatform(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as Partial<PlatformPayload>;
    if (payload.type !== 'platform') {
      return reply.status(401).send({ title: 'Unauthorized', status: 401, detail: 'Not a platform token.' });
    }
  } catch {
    return reply.status(401).send({ title: 'Unauthorized', status: 401 });
  }
}

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
  // GET /api/v1/audit-logs — platform auth required
  app.get('/', { onRequest: [authenticatePlatform] }, async (request, reply) => {
    const q = request.query as {
      orgId?: string;
      resourceType?: string;
      action?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);

    const conditions: SQL[] = [];

    if (q.orgId) {
      conditions.push(eq(schema.auditLogs.orgId, q.orgId));
    }
    if (q.resourceType) {
      conditions.push(eq(schema.auditLogs.resourceType, q.resourceType));
    }
    if (q.action) {
      conditions.push(eq(schema.auditLogs.action, q.action));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(schema.auditLogs)
      .where(where)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send({ data: rows, limit, offset });
  });

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
