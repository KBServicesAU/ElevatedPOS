import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { randomBytes } from 'crypto';
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

async function requirePlatformSuperadminOrSalesAgent(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticatePlatform(request, reply);
  if (reply.sent) return;
  const payload = request.user as PlatformPayload;
  if (payload.role !== 'superadmin' && payload.role !== 'sales_agent') {
    return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'Superadmin or sales agent required.' });
  }
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const createLinkSchema = z.object({
  planId: z.string().uuid().optional(),
  salesAgentId: z.string().uuid().optional(),
  orgName: z.string().max(200).optional(),
  customMonthlyPrice: z.number().min(0).optional(),
  customAnnualPrice: z.number().min(0).optional(),
  customTrialDays: z.number().int().min(0).optional(),
  note: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
});

const patchLinkSchema = z.object({
  note: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function signupLinkRoutes(app: FastifyInstance) {
  // GET /api/v1/signup-links — list links
  // superadmin: all; sales_agent: own only
  app.get('/', { onRequest: [requirePlatformSuperadminOrSalesAgent] }, async (request, reply) => {
    const payload = request.user as PlatformPayload;

    const rows = payload.role === 'superadmin'
      ? await db.select().from(schema.signupLinks).orderBy(schema.signupLinks.createdAt)
      : await db
          .select()
          .from(schema.signupLinks)
          .where(eq(schema.signupLinks.salesAgentId, payload.sub))
          .orderBy(schema.signupLinks.createdAt);

    return reply.send({ data: rows });
  });

  // POST /api/v1/signup-links — create a signup link
  // superadmin + salesAgent can create; only superadmin can set customMonthlyPrice/customAnnualPrice
  app.post('/', { onRequest: [requirePlatformSuperadminOrSalesAgent] }, async (request, reply) => {
    const payload = request.user as PlatformPayload;

    const body = createLinkSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    // Only superadmin can set custom pricing
    if (payload.role !== 'superadmin') {
      if (body.data.customMonthlyPrice !== undefined || body.data.customAnnualPrice !== undefined) {
        return reply.status(403).send({ title: 'Forbidden', status: 403, detail: 'Only superadmins can set custom pricing.' });
      }
    }

    // Generate unique code
    const code = randomBytes(16).toString('hex').slice(0, 24);

    // Determine salesAgentId: if the caller is a sales_agent, default to themselves
    const salesAgentId =
      body.data.salesAgentId ??
      (payload.role === 'sales_agent' ? payload.sub : undefined);

    const [created] = await db
      .insert(schema.signupLinks)
      .values({
        code,
        createdByPlatformUserId: payload.sub,
        salesAgentId: salesAgentId ?? null,
        planId: body.data.planId ?? null,
        orgName: body.data.orgName ?? null,
        customMonthlyPrice: body.data.customMonthlyPrice !== undefined ? String(body.data.customMonthlyPrice) : null,
        customAnnualPrice: body.data.customAnnualPrice !== undefined ? String(body.data.customAnnualPrice) : null,
        customTrialDays: body.data.customTrialDays ?? null,
        note: body.data.note ?? null,
        expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null,
        isActive: body.data.isActive,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // GET /api/v1/signup-links/:code/validate — PUBLIC, returns link info for signup page
  app.get('/:code/validate', async (request, reply) => {
    const { code } = request.params as { code: string };

    const link = await db.query.signupLinks.findFirst({
      where: eq(schema.signupLinks.code, code),
    });

    if (!link) {
      return reply.status(404).send({ title: 'Not Found', status: 404, detail: 'Signup link not found.' });
    }

    if (!link.isActive) {
      return reply.status(410).send({ title: 'Gone', status: 410, detail: 'This signup link is no longer active.' });
    }

    if (link.usedAt) {
      return reply.status(410).send({ title: 'Gone', status: 410, detail: 'This signup link has already been used.' });
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return reply.status(410).send({ title: 'Gone', status: 410, detail: 'This signup link has expired.' });
    }

    // Fetch plan if linked
    let plan = null;
    if (link.planId) {
      plan = await db.query.plans.findFirst({ where: eq(schema.plans.id, link.planId) });
    }

    return reply.send({
      data: {
        code: link.code,
        orgName: link.orgName,
        planId: link.planId,
        plan: plan ?? null,
        customMonthlyPrice: link.customMonthlyPrice,
        customAnnualPrice: link.customAnnualPrice,
        customTrialDays: link.customTrialDays,
        expiresAt: link.expiresAt,
      },
    });
  });

  // PATCH /api/v1/signup-links/:id — superadmin only
  app.patch('/:id', { onRequest: [requireSuperadmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = patchLinkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: parsed.error.message });
    }

    const existing = await db.query.signupLinks.findFirst({ where: eq(schema.signupLinks.id, id) });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const data = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch = Object.fromEntries(
      Object.entries({
        note: data.note,
        expiresAt: data.expiresAt !== undefined
          ? (data.expiresAt ? new Date(data.expiresAt) : null)
          : undefined,
        isActive: data.isActive,
      }).filter(([, v]) => v !== undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as Record<string, any>;

    if (Object.keys(patch).length === 0) {
      return reply.status(400).send({ title: 'No fields to update', status: 400 });
    }

    patch['updatedAt'] = new Date();

    const [updated] = await db
      .update(schema.signupLinks)
      .set(patch)
      .where(eq(schema.signupLinks.id, id))
      .returning();

    return reply.send({ data: updated });
  });

  // DELETE /api/v1/signup-links/:id — superadmin only, hard delete
  app.delete('/:id', { onRequest: [requireSuperadmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await db.query.signupLinks.findFirst({
      where: and(eq(schema.signupLinks.id, id)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    await db.delete(schema.signupLinks).where(eq(schema.signupLinks.id, id));

    return reply.status(204).send();
  });
}
