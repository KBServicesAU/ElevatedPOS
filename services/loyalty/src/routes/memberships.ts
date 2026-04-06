import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

// ─── Zod schemas ────────────────────────────────────────────────────────────

const createPlanSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  billingCycle: z.enum(['monthly', 'annual', 'one_time']),
  benefits: z.array(z.string()).default([]),
  pointsMultiplier: z.number().positive().default(1),
  tierOverride: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  trialDays: z.number().int().nonnegative().default(0),
});

const createSubscriptionSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
  paymentMethodRef: z.string().optional(),
});

const cancelSubscriptionSchema = z.object({
  immediate: z.boolean().default(false),
});

const pauseSubscriptionSchema = z.object({
  pauseUntil: z.string().datetime(),
});

const listSubscriptionsQuerySchema = z.object({
  status: z
    .enum(['trialing', 'active', 'past_due', 'cancelled', 'expired'])
    .optional(),
  customerId: z.string().uuid().optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function addBillingPeriod(from: Date, cycle: 'monthly' | 'annual' | 'one_time'): Date {
  const d = new Date(from);
  if (cycle === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  } else if (cycle === 'annual') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    // one_time: effectively never expires — set far future
    d.setFullYear(d.getFullYear() + 100);
  }
  return d;
}

function sendValidationError(reply: FastifyReply, detail: string) {
  return reply.status(422).send({
    type: 'https://elevatedpos.com/errors/validation',
    title: 'Validation Error',
    status: 422,
    detail,
  });
}

function sendNotFound(reply: FastifyReply, detail: string) {
  return reply.status(404).send({
    type: 'https://elevatedpos.com/errors/not-found',
    title: 'Not Found',
    status: 404,
    detail,
  });
}

// ─── Route plugin ────────────────────────────────────────────────────────────

export async function membershipRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ── Plans ──────────────────────────────────────────────────────────────────

  // GET /plans — list active plans for org
  app.get('/plans', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const plans = await db.query.membershipPlans.findMany({
      where: and(
        eq(schema.membershipPlans.orgId, orgId),
        eq(schema.membershipPlans.isActive, true),
      ),
    });
    return reply.status(200).send({ data: plans });
  });

  // POST /plans — create plan
  app.post('/plans', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.message);
    }
    const { billingCycle, pointsMultiplier, tierOverride, price, description, ...rest } = parsed.data;
    const [plan] = await db
      .insert(schema.membershipPlans)
      .values({
        orgId,
        ...rest,
        price: String(price),
        description: description ?? null,
        billingCycle,
        pointsMultiplier: String(pointsMultiplier),
        tierOverride: tierOverride ?? null,
      })
      .returning();
    return reply.status(201).send({ data: plan });
  });

  // PATCH /plans/:id — update plan
  app.patch('/plans/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = createPlanSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.message);
    }
    const existing = await db.query.membershipPlans.findFirst({
      where: and(eq(schema.membershipPlans.id, id), eq(schema.membershipPlans.orgId, orgId)),
    });
    if (!existing) return sendNotFound(reply, `Membership plan ${id} not found`);

    const { pointsMultiplier, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (pointsMultiplier !== undefined) {
      updateData['pointsMultiplier'] = String(pointsMultiplier);
    }

    const [updated] = await db
      .update(schema.membershipPlans)
      .set(updateData)
      .where(and(eq(schema.membershipPlans.id, id), eq(schema.membershipPlans.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updated });
  });

  // ── Subscriptions ─────────────────────────────────────────────────────────

  // POST /subscriptions — create subscription for customer
  app.post('/subscriptions', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.message);
    }

    const plan = await db.query.membershipPlans.findFirst({
      where: and(
        eq(schema.membershipPlans.id, parsed.data.planId),
        eq(schema.membershipPlans.orgId, orgId),
        eq(schema.membershipPlans.isActive, true),
      ),
    });
    if (!plan) return sendNotFound(reply, `Membership plan ${parsed.data.planId} not found or inactive`);

    const now = new Date();
    const trialDays = plan.trialDays ?? 0;
    let status: 'trialing' | 'active' = trialDays > 0 ? 'trialing' : 'active';
    let periodStart = now;
    let periodEnd: Date;

    if (trialDays > 0) {
      // Trial period ends after trialDays; billing period begins then
      periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + trialDays);
    } else {
      periodEnd = addBillingPeriod(now, plan.billingCycle as 'monthly' | 'annual' | 'one_time');
    }

    const [subscription] = await db
      .insert(schema.membershipSubscriptions)
      .values({
        orgId,
        customerId: parsed.data.customerId,
        planId: parsed.data.planId,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        paymentMethodRef: parsed.data.paymentMethodRef ?? null,
      })
      .returning();
    return reply.status(201).send({ data: subscription });
  });

  // GET /subscriptions — list subscriptions with optional filters
  app.get('/subscriptions', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const queryParsed = listSubscriptionsQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      return sendValidationError(reply, queryParsed.error.message);
    }
    const { status, customerId } = queryParsed.data;

    const conditions = [eq(schema.membershipSubscriptions.orgId, orgId)];
    if (status) conditions.push(eq(schema.membershipSubscriptions.status, status));
    if (customerId) conditions.push(eq(schema.membershipSubscriptions.customerId, customerId));

    const subscriptions = await db.query.membershipSubscriptions.findMany({
      where: and(...conditions),
    });
    return reply.status(200).send({ data: subscriptions });
  });

  // GET /subscriptions/:id — get subscription
  app.get('/subscriptions/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const subscription = await db.query.membershipSubscriptions.findFirst({
      where: and(
        eq(schema.membershipSubscriptions.id, id),
        eq(schema.membershipSubscriptions.orgId, orgId),
      ),
    });
    if (!subscription) return sendNotFound(reply, `Subscription ${id} not found`);
    return reply.status(200).send({ data: subscription });
  });

  // POST /subscriptions/:id/cancel — cancel subscription
  app.post('/subscriptions/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = cancelSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.message);
    }

    const subscription = await db.query.membershipSubscriptions.findFirst({
      where: and(
        eq(schema.membershipSubscriptions.id, id),
        eq(schema.membershipSubscriptions.orgId, orgId),
      ),
    });
    if (!subscription) return sendNotFound(reply, `Subscription ${id} not found`);

    const now = new Date();
    let updateData: Record<string, unknown>;

    if (parsed.data.immediate) {
      updateData = {
        status: 'cancelled',
        cancelledAt: now,
        cancelAtPeriodEnd: false,
        updatedAt: now,
      };
    } else {
      updateData = {
        cancelAtPeriodEnd: true,
        updatedAt: now,
      };
    }

    const [updated] = await db
      .update(schema.membershipSubscriptions)
      .set(updateData)
      .where(and(
        eq(schema.membershipSubscriptions.id, id),
        eq(schema.membershipSubscriptions.orgId, orgId),
      ))
      .returning();
    return reply.status(200).send({ data: updated });
  });

  // POST /subscriptions/:id/pause — pause subscription until a date
  app.post('/subscriptions/:id/pause', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = pauseSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.message);
    }

    const subscription = await db.query.membershipSubscriptions.findFirst({
      where: and(
        eq(schema.membershipSubscriptions.id, id),
        eq(schema.membershipSubscriptions.orgId, orgId),
      ),
    });
    if (!subscription) return sendNotFound(reply, `Subscription ${id} not found`);

    const pauseUntil = new Date(parsed.data.pauseUntil);
    // Extend current period end to the pause-until date so billing resumes then
    const [updated] = await db
      .update(schema.membershipSubscriptions)
      .set({
        currentPeriodEnd: pauseUntil,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.membershipSubscriptions.id, id),
        eq(schema.membershipSubscriptions.orgId, orgId),
      ))
      .returning();
    return reply.status(200).send({ data: updated });
  });

  // POST /subscriptions/dunning — dunning check (called by scheduler/cron)
  app.post('/subscriptions/dunning', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const now = new Date();

    // Find past_due subscriptions for this org
    const pastDueSubs = await db.query.membershipSubscriptions.findMany({
      where: and(
        eq(schema.membershipSubscriptions.orgId, orgId),
        eq(schema.membershipSubscriptions.status, 'past_due'),
      ),
    });

    let attempted = 0;
    let expired = 0;

    for (const sub of pastDueSubs) {
      attempted++;
      const newAttempts = (sub.dunningAttempts ?? 0) + 1;

      if (newAttempts >= 3) {
        // Expire after 3 failed dunning attempts
        await db
          .update(schema.membershipSubscriptions)
          .set({
            status: 'expired',
            dunningAttempts: newAttempts,
            lastDunningAt: now,
            updatedAt: now,
          })
          .where(eq(schema.membershipSubscriptions.id, sub.id));
        expired++;

        // Emit notification event (fire-and-forget — log only if it fails)
        app.log.info({
          event: 'membership.subscription.expired',
          subscriptionId: sub.id,
          customerId: sub.customerId,
          orgId,
        });
      } else {
        await db
          .update(schema.membershipSubscriptions)
          .set({
            dunningAttempts: newAttempts,
            lastDunningAt: now,
            updatedAt: now,
          })
          .where(eq(schema.membershipSubscriptions.id, sub.id));

        app.log.info({
          event: 'membership.dunning.attempted',
          subscriptionId: sub.id,
          customerId: sub.customerId,
          attempt: newAttempts,
          orgId,
        });
      }
    }

    return reply.status(200).send({ data: { attempted, expired } });
  });
}
