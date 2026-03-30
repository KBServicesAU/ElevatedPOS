import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';

const ruleSchema = z.object({
  paymentMethod: z.string().min(1),
  cardType: z.string().optional(),
  surchargePercent: z.number().positive().max(100),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().optional(),
  isActive: z.boolean().default(true),
});

const calculateSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.string().min(1),
  cardType: z.string().optional(),
});

export async function surchargeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /rules — list surcharge rules for org
  app.get('/rules', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const rules = await db.query.surchargeRules.findMany({
      where: eq(schema.surchargeRules.orgId, orgId),
      orderBy: (r, { asc }) => [asc(r.paymentMethod), asc(r.cardType)],
    });
    return reply.status(200).send({ data: rules });
  });

  // POST /rules — create surcharge rule
  app.post('/rules', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = ruleSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }
    const { minAmount, maxAmount, ...rest } = body.data;
    const [rule] = await db.insert(schema.surchargeRules).values({
      ...rest,
      orgId,
      surchargePercent: String(rest.surchargePercent),
      ...(minAmount !== undefined ? { minAmount: String(minAmount) } : {}),
      ...(maxAmount !== undefined ? { maxAmount: String(maxAmount) } : {}),
    }).returning();
    return reply.status(201).send({ data: rule });
  });

  // PATCH /rules/:id — update surcharge rule
  app.patch('/rules/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const existing = await db.query.surchargeRules.findFirst({
      where: and(eq(schema.surchargeRules.id, id), eq(schema.surchargeRules.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const body = ruleSchema.partial().safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }
    const { minAmount, maxAmount, surchargePercent, ...rest } = body.data;
    const [updated] = await db.update(schema.surchargeRules).set({
      ...rest,
      ...(surchargePercent !== undefined ? { surchargePercent: String(surchargePercent) } : {}),
      ...(minAmount !== undefined ? { minAmount: String(minAmount) } : {}),
      ...(maxAmount !== undefined ? { maxAmount: String(maxAmount) } : {}),
      updatedAt: new Date(),
    }).where(eq(schema.surchargeRules.id, id)).returning();
    return reply.status(200).send({ data: updated });
  });

  // DELETE /rules/:id — delete surcharge rule
  app.delete('/rules/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const existing = await db.query.surchargeRules.findFirst({
      where: and(eq(schema.surchargeRules.id, id), eq(schema.surchargeRules.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });
    await db.delete(schema.surchargeRules).where(eq(schema.surchargeRules.id, id));
    return reply.status(204).send();
  });

  // POST /calculate — calculate surcharge for a given amount + method
  app.post('/calculate', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = calculateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }
    const { amount, paymentMethod, cardType } = body.data;

    // Find the best matching active rule:
    // 1. exact method + cardType match
    // 2. method-only match (no cardType filter)
    const rules = await db.query.surchargeRules.findMany({
      where: and(
        eq(schema.surchargeRules.orgId, orgId),
        eq(schema.surchargeRules.paymentMethod, paymentMethod),
        eq(schema.surchargeRules.isActive, true),
      ),
    });

    let matchedRule = rules.find(r =>
      r.cardType && cardType && r.cardType.toLowerCase() === cardType.toLowerCase(),
    ) ?? rules.find(r => !r.cardType);

    if (!matchedRule) {
      // No rule found — zero surcharge
      return reply.status(200).send({
        data: { surchargePercent: 0, surchargeAmount: 0, totalWithSurcharge: amount },
      });
    }

    // Respect min/max amount constraints
    const min = matchedRule.minAmount ? Number(matchedRule.minAmount) : null;
    const max = matchedRule.maxAmount ? Number(matchedRule.maxAmount) : null;
    if ((min !== null && amount < min) || (max !== null && amount > max)) {
      return reply.status(200).send({
        data: { surchargePercent: 0, surchargeAmount: 0, totalWithSurcharge: amount },
      });
    }

    const surchargePercent = Number(matchedRule.surchargePercent);
    const surchargeAmount = Math.round((amount * surchargePercent / 100) * 100) / 100;
    const totalWithSurcharge = amount + surchargeAmount;

    return reply.status(200).send({
      data: { surchargePercent, surchargeAmount, totalWithSurcharge },
    });
  });
}
