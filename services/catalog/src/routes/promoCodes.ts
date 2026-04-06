import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const createPromoSchema = z.object({
  code: z.string().min(1).max(50).transform((v) => v.toUpperCase().replace(/\s/g, '')),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['percentage', 'fixed', 'free_shipping']).default('percentage'),
  discountValue: z.number().min(0).default(0),
  scope: z.enum(['order', 'product', 'category']).default('order'),
  targetId: z.string().uuid().optional(),
  minOrderValue: z.number().min(0).optional(),
  maxUses: z.number().int().min(1).optional(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  isFirstTimeOnly: z.boolean().default(false),
  status: z.enum(['active', 'expired', 'disabled']).default('active'),
});

const updatePromoSchema = createPromoSchema.partial();

export async function promoCodeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET / — list promo codes for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const codes = await db.query.promoCodes.findMany({
      where: eq(schema.promoCodes.orgId, orgId),
      orderBy: [desc(schema.promoCodes.createdAt)],
    });

    return reply.status(200).send({ data: codes });
  });

  // GET /:id — get single promo code
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params;

    const code = await db.query.promoCodes.findFirst({
      where: and(eq(schema.promoCodes.id, id), eq(schema.promoCodes.orgId, orgId)),
    });

    if (!code) return reply.status(404).send({ error: 'Promo code not found' });
    return reply.status(200).send(code);
  });

  // POST / — create promo code
  app.post('/', async (request, reply) => {
    const { orgId, sub: userId } = request.user as { orgId: string; sub: string };
    const body = createPromoSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        errors: body.error.flatten().fieldErrors,
      });
    }

    // Check for duplicate code within org
    const existing = await db.query.promoCodes.findFirst({
      where: and(
        eq(schema.promoCodes.orgId, orgId),
        eq(schema.promoCodes.code, body.data.code),
      ),
    });
    if (existing) {
      return reply.status(409).send({ error: 'A promo code with this code already exists' });
    }

    const [created] = await db.insert(schema.promoCodes).values({
      orgId,
      code: body.data.code,
      name: body.data.name,
      description: body.data.description ?? null,
      type: body.data.type,
      discountValue: String(body.data.discountValue),
      scope: body.data.scope,
      targetId: body.data.targetId ?? null,
      minOrderValue: body.data.minOrderValue != null ? String(body.data.minOrderValue) : null,
      maxUses: body.data.maxUses ?? null,
      startsAt: body.data.startsAt ? new Date(body.data.startsAt) : new Date(),
      expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null,
      isFirstTimeOnly: body.data.isFirstTimeOnly,
      status: body.data.status,
      createdBy: userId,
    }).returning();

    return reply.status(201).send(created);
  });

  // PATCH /:id — update promo code
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params;
    const body = updatePromoSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        errors: body.error.flatten().fieldErrors,
      });
    }

    const existing = await db.query.promoCodes.findFirst({
      where: and(eq(schema.promoCodes.id, id), eq(schema.promoCodes.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ error: 'Promo code not found' });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.code !== undefined) updates['code'] = body.data.code;
    if (body.data.name !== undefined) updates['name'] = body.data.name;
    if (body.data.description !== undefined) updates['description'] = body.data.description;
    if (body.data.type !== undefined) updates['type'] = body.data.type;
    if (body.data.discountValue !== undefined) updates['discountValue'] = String(body.data.discountValue);
    if (body.data.scope !== undefined) updates['scope'] = body.data.scope;
    if (body.data.targetId !== undefined) updates['targetId'] = body.data.targetId;
    if (body.data.minOrderValue !== undefined) updates['minOrderValue'] = body.data.minOrderValue != null ? String(body.data.minOrderValue) : null;
    if (body.data.maxUses !== undefined) updates['maxUses'] = body.data.maxUses;
    if (body.data.startsAt !== undefined) updates['startsAt'] = new Date(body.data.startsAt);
    if (body.data.expiresAt !== undefined) updates['expiresAt'] = body.data.expiresAt ? new Date(body.data.expiresAt) : null;
    if (body.data.isFirstTimeOnly !== undefined) updates['isFirstTimeOnly'] = body.data.isFirstTimeOnly;
    if (body.data.status !== undefined) updates['status'] = body.data.status;

    const [updated] = await db.update(schema.promoCodes)
      .set(updates)
      .where(and(eq(schema.promoCodes.id, id), eq(schema.promoCodes.orgId, orgId)))
      .returning();

    return reply.status(200).send(updated);
  });

  // DELETE /:id — delete promo code
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params;

    const existing = await db.query.promoCodes.findFirst({
      where: and(eq(schema.promoCodes.id, id), eq(schema.promoCodes.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ error: 'Promo code not found' });

    await db.delete(schema.promoCodes)
      .where(and(eq(schema.promoCodes.id, id), eq(schema.promoCodes.orgId, orgId)));

    return reply.status(204).send();
  });

  // POST /validate — validate a promo code at checkout
  app.post('/validate', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { code, orderTotal } = request.body as { code: string; orderTotal?: number };

    if (!code) return reply.status(400).send({ error: 'Code is required' });

    const promo = await db.query.promoCodes.findFirst({
      where: and(
        eq(schema.promoCodes.orgId, orgId),
        eq(schema.promoCodes.code, code.toUpperCase().trim()),
        eq(schema.promoCodes.status, 'active'),
      ),
    });

    if (!promo) return reply.status(404).send({ valid: false, error: 'Invalid or expired promo code' });

    // Check expiry
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
      return reply.status(200).send({ valid: false, error: 'This promo code has expired' });
    }

    // Check max uses
    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
      return reply.status(200).send({ valid: false, error: 'This promo code has reached its usage limit' });
    }

    // Check min order value
    const minOrder = promo.minOrderValue ? parseFloat(promo.minOrderValue) : 0;
    if (minOrder > 0 && orderTotal != null && orderTotal < minOrder) {
      return reply.status(200).send({
        valid: false,
        error: `Minimum order of $${minOrder.toFixed(2)} required`,
      });
    }

    return reply.status(200).send({
      valid: true,
      promoCode: promo,
    });
  });
}
