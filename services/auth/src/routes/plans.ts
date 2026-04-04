import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';

// ── Schemas ───────────────────────────────────────────────────────────────────

const planSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().optional(),
  monthlyPrice: z.number().min(0),
  annualPrice: z.number().min(0).optional(),
  features: z.array(z.string()).default([]),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  maxLocations: z.number().int().min(1).default(1),
  maxEmployees: z.number().int().min(1).default(50),
  maxProducts: z.number().int().min(1).default(1000),
  trialDays: z.number().int().min(0).default(14),
  sortOrder: z.number().int().default(0),
});

const patchPlanSchema = planSchema.partial();

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

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function planRoutes(app: FastifyInstance) {
  // GET /api/v1/plans/public — no auth, returns public active plans
  app.get('/public', async (_request, reply) => {
    const rows = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.isActive, true))
      .orderBy(asc(schema.plans.sortOrder));

    const publicRows = rows.filter((p) => p.isPublic);

    return reply.send({ data: publicRows });
  });

  // GET /api/v1/plans — superadmin: all plans
  app.get('/', { onRequest: [authenticatePlatform] }, async (_request, reply) => {
    const rows = await db
      .select()
      .from(schema.plans)
      .orderBy(asc(schema.plans.sortOrder));

    return reply.send({ data: rows });
  });

  // POST /api/v1/plans — superadmin only
  app.post('/', { onRequest: [requireSuperadmin] }, async (request, reply) => {
    const body = planSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const existing = await db.query.plans.findFirst({
      where: eq(schema.plans.slug, body.data.slug),
    });
    if (existing) {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: 'Slug already in use.' });
    }

    const [created] = await db
      .insert(schema.plans)
      .values({
        name: body.data.name,
        slug: body.data.slug,
        description: body.data.description ?? null,
        monthlyPrice: String(body.data.monthlyPrice),
        annualPrice: body.data.annualPrice !== undefined ? String(body.data.annualPrice) : null,
        features: body.data.features,
        isPublic: body.data.isPublic,
        isActive: body.data.isActive,
        maxLocations: body.data.maxLocations,
        maxEmployees: body.data.maxEmployees,
        maxProducts: body.data.maxProducts,
        trialDays: body.data.trialDays,
        sortOrder: body.data.sortOrder,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // PATCH /api/v1/plans/:id — superadmin only
  app.patch('/:id', { onRequest: [requireSuperadmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = patchPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: parsed.error.message });
    }

    const existing = await db.query.plans.findFirst({ where: eq(schema.plans.id, id) });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const data = parsed.data;

    // Build patch object avoiding undefined spreading
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = {};
    if (data.name !== undefined) patch['name'] = data.name;
    if (data.slug !== undefined) patch['slug'] = data.slug;
    if (data.description !== undefined) patch['description'] = data.description;
    if (data.monthlyPrice !== undefined) patch['monthlyPrice'] = String(data.monthlyPrice);
    if (data.annualPrice !== undefined) patch['annualPrice'] = String(data.annualPrice);
    if (data.features !== undefined) patch['features'] = data.features;
    if (data.isPublic !== undefined) patch['isPublic'] = data.isPublic;
    if (data.isActive !== undefined) patch['isActive'] = data.isActive;
    if (data.maxLocations !== undefined) patch['maxLocations'] = data.maxLocations;
    if (data.maxEmployees !== undefined) patch['maxEmployees'] = data.maxEmployees;
    if (data.maxProducts !== undefined) patch['maxProducts'] = data.maxProducts;
    if (data.trialDays !== undefined) patch['trialDays'] = data.trialDays;
    if (data.sortOrder !== undefined) patch['sortOrder'] = data.sortOrder;

    if (Object.keys(patch).length === 0) {
      return reply.status(400).send({ title: 'No fields to update', status: 400 });
    }

    patch['updatedAt'] = new Date();

    const [updated] = await db
      .update(schema.plans)
      .set(patch)
      .where(eq(schema.plans.id, id))
      .returning();

    return reply.send({ data: updated });
  });

  // DELETE /api/v1/plans/:id — soft delete (set isActive=false), superadmin only
  app.delete('/:id', { onRequest: [requireSuperadmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [updated] = await db
      .update(schema.plans)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.plans.id, id))
      .returning({ id: schema.plans.id, isActive: schema.plans.isActive });

    if (!updated) return reply.status(404).send({ title: 'Not Found', status: 404 });

    return reply.send({ data: updated });
  });
}
