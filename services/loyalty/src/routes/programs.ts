import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

// v2.7.40 — semantics of earnRate inverted from "points earned per $1" to
// "dollars required to earn 1 point". The DB column `earn_rate` is reused
// (no migration) but its interpretation flips. The API accepts either the
// new `dollarsPerPoint` or the legacy `earnRate` field.
const createProgramSchema = z.object({
  name: z.string().min(1).max(255),
  dollarsPerPoint: z.number().int().min(1).optional(),
  earnRate: z.number().int().min(1).optional(),
  active: z.boolean().default(true),
});

export async function programRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Serialise a program row with the new `dollarsPerPoint` field alongside
  // the legacy `earnRate` so existing clients keep working.
  type ProgramRow = typeof schema.loyaltyPrograms.$inferSelect;
  const serialiseProgram = (p: ProgramRow) => ({
    ...p,
    dollarsPerPoint: p.earnRate,
  });

  // Normalise incoming body: prefer `dollarsPerPoint`, fall back to `earnRate`.
  const extractEarnRate = (data: z.infer<typeof createProgramSchema>): number | undefined =>
    data.dollarsPerPoint ?? data.earnRate;

  // GET /programs — list programs for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const programs = await db.query.loyaltyPrograms.findMany({
      where: eq(schema.loyaltyPrograms.orgId, orgId),
    });
    return reply.status(200).send({ data: programs.map(serialiseProgram) });
  });

  // POST /programs — create program
  app.post('/', async (request, reply) => {
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
    const earnRate = extractEarnRate(parsed.data) ?? 1;
    const [created] = await db
      .insert(schema.loyaltyPrograms)
      .values({ orgId, name: parsed.data.name, active: parsed.data.active, earnRate })
      .returning();
    return reply.status(201).send({ data: serialiseProgram(created!) });
  });

  // GET /programs/:id — get program by id
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const program = await db.query.loyaltyPrograms.findFirst({
      where: and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)),
    });
    if (!program) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Loyalty program ${id} not found`,
      });
    }
    return reply.status(200).send({ data: serialiseProgram(program) });
  });

  // PATCH /programs/:id — update program
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = createProgramSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const existing = await db.query.loyaltyPrograms.findFirst({
      where: and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Loyalty program ${id} not found`,
      });
    }
    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData['name'] = parsed.data.name;
    const nextEarnRate = extractEarnRate(parsed.data as z.infer<typeof createProgramSchema>);
    if (nextEarnRate !== undefined) updateData['earnRate'] = nextEarnRate;
    if (parsed.data.active !== undefined) updateData['active'] = parsed.data.active;
    const [updated] = await db
      .update(schema.loyaltyPrograms)
      .set(updateData)
      .where(and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: serialiseProgram(updated!) });
  });

  // DELETE /programs/:id — delete program
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const existing = await db.query.loyaltyPrograms.findFirst({
      where: and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Loyalty program ${id} not found`,
      });
    }
    await db
      .delete(schema.loyaltyPrograms)
      .where(and(eq(schema.loyaltyPrograms.id, id), eq(schema.loyaltyPrograms.orgId, orgId)));
    return reply.status(204).send();
  });
}
