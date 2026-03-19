import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';

const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  abn: z.string().optional(),
  paymentTerms: z.number().int().default(30),
  leadTimeDays: z.number().int().default(7),
  preferredCurrency: z.string().length(3).default('AUD'),
  notes: z.string().optional(),
});

export async function supplierRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const suppliers = await db.query.suppliers.findMany({ where: and(eq(schema.suppliers.orgId, orgId), eq(schema.suppliers.isActive, true)) });
    return reply.status(200).send({ data: suppliers });
  });

  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = supplierSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });
    const [created] = await db.insert(schema.suppliers).values({ ...body.data, orgId }).returning();
    return reply.status(201).send({ data: created });
  });

  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = supplierSchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });
    const [updated] = await db.update(schema.suppliers).set({ ...body.data, updatedAt: new Date() }).where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.orgId, orgId))).returning();
    return reply.status(200).send({ data: updated });
  });

  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    await db.update(schema.suppliers).set({ isActive: false, updatedAt: new Date() }).where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.orgId, orgId)));
    return reply.status(204).send();
  });
}
