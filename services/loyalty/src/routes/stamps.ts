import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const createProgramSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  stampsRequired: z.number().int().min(1),
  reward: z.string().min(1).max(255),
  rewardValue: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
  expiryDays: z.number().int().min(1).optional(),
});

const updateProgramSchema = createProgramSchema.partial();

export async function stampRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /cards — create a stamp card program
  app.post('/cards', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createProgramSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const { rewardValue, description, expiryDays, ...rest } = parsed.data;
    const [created] = await db
      .insert(schema.stampPrograms)
      .values({
        orgId,
        ...rest,
        rewardValue: String(rewardValue),
        description: description ?? null,
        ...(expiryDays !== undefined ? { expiryDays } : {}),
      })
      .returning();
    return reply.status(201).send({ data: created });
  });

  // GET /cards — list stamp card programs for org
  app.get('/cards', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const programs = await db.query.stampPrograms.findMany({
      where: eq(schema.stampPrograms.orgId, orgId),
    });
    return reply.status(200).send({ data: programs });
  });

  // PATCH /cards/:id — update program
  app.patch('/cards/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = updateProgramSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const existing = await db.query.stampPrograms.findFirst({
      where: and(eq(schema.stampPrograms.id, id), eq(schema.stampPrograms.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Stamp program ${id} not found`,
      });
    }
    const { rewardValue, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (rewardValue !== undefined) {
      updateData.rewardValue = String(rewardValue);
    }
    const [updated] = await db
      .update(schema.stampPrograms)
      .set(updateData)
      .where(and(eq(schema.stampPrograms.id, id), eq(schema.stampPrograms.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updated });
  });

  // GET /members/:customerId/cards — get customer's stamp cards with current stamp count
  app.get('/members/:customerId/cards', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { customerId } = request.params as { customerId: string };

    const cards = await db.query.customerStampCards.findMany({
      where: and(
        eq(schema.customerStampCards.orgId, orgId),
        eq(schema.customerStampCards.customerId, customerId),
      ),
      with: { program: true },
    });
    return reply.status(200).send({ data: cards });
  });

  // POST /members/:customerId/cards/:programId/stamp — add a stamp
  app.post('/members/:customerId/cards/:programId/stamp', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { customerId, programId } = request.params as {
      customerId: string;
      programId: string;
    };
    const body = (request.body ?? {}) as { orderId?: string; note?: string };

    // Verify program exists and is active
    const program = await db.query.stampPrograms.findFirst({
      where: and(
        eq(schema.stampPrograms.id, programId),
        eq(schema.stampPrograms.orgId, orgId),
        eq(schema.stampPrograms.isActive, true),
      ),
    });
    if (!program) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Stamp program ${programId} not found or inactive`,
      });
    }

    // Find or create active stamp card for this customer/program
    let card = await db.query.customerStampCards.findFirst({
      where: and(
        eq(schema.customerStampCards.orgId, orgId),
        eq(schema.customerStampCards.customerId, customerId),
        eq(schema.customerStampCards.programId, programId),
        eq(schema.customerStampCards.status, 'active'),
      ),
    });

    if (!card) {
      const expiresAt =
        program.expiryDays
          ? new Date(Date.now() + program.expiryDays * 24 * 60 * 60 * 1000)
          : null;
      const [newCard] = await db
        .insert(schema.customerStampCards)
        .values({
          orgId,
          customerId,
          programId,
          currentStamps: 0,
          status: 'active',
          ...(expiresAt ? { expiresAt } : {}),
        })
        .returning();
      card = newCard;
    }

    if (!card) {
      return reply.status(500).send({ title: 'Internal Server Error', status: 500, detail: 'Failed to create stamp card' });
    }

    // Add the stamp
    const newStampCount = card.currentStamps + 1;
    const rewardEarned = newStampCount >= program.stampsRequired;

    const updateValues: Record<string, unknown> = {
      currentStamps: rewardEarned ? 0 : newStampCount,
      updatedAt: new Date(),
    };
    if (rewardEarned) {
      updateValues.status = 'completed';
      updateValues.completedAt = new Date();
    }

    const [updatedCard] = await db
      .update(schema.customerStampCards)
      .set(updateValues)
      .where(eq(schema.customerStampCards.id, card.id))
      .returning();

    // Record the stamp event
    await db.insert(schema.stampEvents).values({
      orgId,
      cardId: card.id,
      orderId: body.orderId ?? null,
      note: body.note ?? null,
    });

    // If completed, archive the card and create a fresh active card
    if (rewardEarned && program.expiryDays) {
      const expiresAt = new Date(Date.now() + program.expiryDays * 24 * 60 * 60 * 1000);
      await db.insert(schema.customerStampCards).values({
        orgId,
        customerId,
        programId,
        currentStamps: 0,
        status: 'active',
        expiresAt,
      });
    } else if (rewardEarned) {
      await db.insert(schema.customerStampCards).values({
        orgId,
        customerId,
        programId,
        currentStamps: 0,
        status: 'active',
      });
    }

    return reply.status(200).send({
      data: {
        card: updatedCard,
        stampsAdded: 1,
        currentStamps: rewardEarned ? newStampCount : newStampCount,
        stampsRequired: program.stampsRequired,
        rewardEarned,
        reward: rewardEarned ? { description: program.reward, value: program.rewardValue } : null,
      },
    });
  });

  // GET /members/:customerId/cards/:programId — get specific stamp card detail with stamp history
  app.get('/members/:customerId/cards/:programId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { customerId, programId } = request.params as {
      customerId: string;
      programId: string;
    };

    const program = await db.query.stampPrograms.findFirst({
      where: and(eq(schema.stampPrograms.id, programId), eq(schema.stampPrograms.orgId, orgId)),
    });
    if (!program) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Stamp program ${programId} not found`,
      });
    }

    const card = await db.query.customerStampCards.findFirst({
      where: and(
        eq(schema.customerStampCards.orgId, orgId),
        eq(schema.customerStampCards.customerId, customerId),
        eq(schema.customerStampCards.programId, programId),
        eq(schema.customerStampCards.status, 'active'),
      ),
    });

    const history = card
      ? await db.query.stampEvents.findMany({
          where: eq(schema.stampEvents.cardId, card.id),
          orderBy: [desc(schema.stampEvents.createdAt)],
          limit: 50,
        })
      : [];

    return reply.status(200).send({
      data: {
        program,
        card: card ?? null,
        stampHistory: history,
      },
    });
  });
}
