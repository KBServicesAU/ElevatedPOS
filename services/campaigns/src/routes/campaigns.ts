import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const CAMPAIGN_TYPES = ['email', 'sms', 'push', 'discount', 'points_multiplier'] as const;
const EDITABLE_STATUSES = ['draft', 'scheduled'] as const;

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(CAMPAIGN_TYPES),
  targetSegment: z.record(z.unknown()).default({}),
  scheduledAt: z.string().datetime().optional(),
});

export async function campaignRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /campaigns — list campaigns, optionally filtered by status
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { status?: string };

    const conditions = [eq(schema.campaigns.orgId, orgId)];
    if (q.status) {
      const validStatuses = ['draft', 'scheduled', 'active', 'completed', 'cancelled'] as const;
      if (validStatuses.includes(q.status as typeof validStatuses[number])) {
        conditions.push(eq(schema.campaigns.status, q.status as typeof validStatuses[number]));
      }
    }

    const results = await db.query.campaigns.findMany({
      where: and(...conditions),
    });
    return reply.status(200).send({ data: results });
  });

  // POST /campaigns — create campaign
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const { scheduledAt, ...rest } = parsed.data;
    const [created] = await db
      .insert(schema.campaigns)
      .values({
        orgId,
        ...rest,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: scheduledAt ? 'scheduled' : 'draft',
      })
      .returning();
    return reply.status(201).send({ data: created });
  });

  // GET /campaigns/:id — get campaign with messages
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, orgId)),
      with: { messages: true },
    });
    if (!campaign) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Campaign ${id} not found`,
      });
    }
    return reply.status(200).send({ data: campaign });
  });

  // PATCH /campaigns/:id — update campaign (cannot edit active/completed)
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.campaigns.findFirst({
      where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Campaign ${id} not found`,
      });
    }
    if (!EDITABLE_STATUSES.includes(existing.status as typeof EDITABLE_STATUSES[number])) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/invalid-state',
        title: 'Invalid State',
        status: 422,
        detail: `Cannot edit a campaign with status '${existing.status}'`,
      });
    }

    const parsed = createCampaignSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const { scheduledAt, ...rest } = parsed.data;
    const [updated] = await db
      .update(schema.campaigns)
      .set({
        ...rest,
        ...(scheduledAt !== undefined ? { scheduledAt: new Date(scheduledAt) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updated });
  });

  // POST /campaigns/:id/launch — transition to active, set startedAt
  app.post('/:id/launch', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.campaigns.findFirst({
      where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Campaign ${id} not found`,
      });
    }
    if (!EDITABLE_STATUSES.includes(existing.status as typeof EDITABLE_STATUSES[number])) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/invalid-state',
        title: 'Invalid State',
        status: 422,
        detail: `Cannot launch a campaign with status '${existing.status}'`,
      });
    }

    const [updated] = await db
      .update(schema.campaigns)
      .set({ status: 'active', startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updated });
  });

  // POST /campaigns/:id/cancel — cancel campaign
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.campaigns.findFirst({
      where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Campaign ${id} not found`,
      });
    }
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/invalid-state',
        title: 'Invalid State',
        status: 422,
        detail: `Cannot cancel a campaign with status '${existing.status}'`,
      });
    }

    const [updated] = await db
      .update(schema.campaigns)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updated });
  });
}
