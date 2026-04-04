import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';

// ── Auth helpers ──────────────────────────────────────────────────────────────

interface PlatformPayload {
  sub: string;
  firstName: string;
  lastName: string;
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

async function requireSuperadmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticatePlatform(request, reply);
  if (reply.sent) return;
  const payload = request.user as PlatformPayload;
  if (payload.role !== 'superadmin') {
    return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'Superadmin required.' });
  }
}

// Allows both superadmin and support roles
async function requirePlatformStaff(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticatePlatform(request, reply);
  if (reply.sent) return;
  const payload = request.user as PlatformPayload;
  if (payload.role !== 'superadmin' && payload.role !== 'support') {
    return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'Platform staff required.' });
  }
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const createNoteSchema = z.object({
  orgId: z.string().uuid(),
  body: z.string().min(1),
});

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function supportNoteRoutes(app: FastifyInstance) {
  // GET /api/v1/support-notes?orgId=xxx — requires platform auth (superadmin or support)
  app.get('/', { onRequest: [requirePlatformStaff] }, async (request, reply) => {
    const q = request.query as { orgId?: string };

    if (!q.orgId) {
      return reply.status(400).send({ title: 'Bad Request', status: 400, detail: 'orgId query parameter is required.' });
    }

    const notes = await db
      .select()
      .from(schema.supportNotes)
      .where(eq(schema.supportNotes.orgId, q.orgId))
      .orderBy(desc(schema.supportNotes.createdAt));

    return reply.send({ data: notes });
  });

  // POST /api/v1/support-notes — create note for orgId, requires platform auth
  app.post('/', { onRequest: [requirePlatformStaff] }, async (request, reply) => {
    const payload = request.user as PlatformPayload;

    const body = createNoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const [created] = await db
      .insert(schema.supportNotes)
      .values({
        orgId: body.data.orgId,
        authorId: payload.sub,
        authorName: `${payload.firstName} ${payload.lastName}`,
        body: body.data.body,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // DELETE /api/v1/support-notes/:id — superadmin only
  app.delete('/:id', { onRequest: [requireSuperadmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await db.query.supportNotes.findFirst({
      where: and(eq(schema.supportNotes.id, id)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    await db.delete(schema.supportNotes).where(eq(schema.supportNotes.id, id));

    return reply.status(204).send();
  });
}
