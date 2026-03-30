import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db, schema } from '../db';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createLinkSchema = z.object({
  locationId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('AUD'),
  description: z.string().min(1).max(500),
  reference: z.string().max(200).optional(),
  customerId: z.string().uuid().optional(),
  expiresInHours: z.number().int().min(1).max(720).default(24),
  metadata: z.record(z.unknown()).optional(),
});

const paySchema = z.object({
  paymentId: z.string().uuid().optional(),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function generateShortCode(): string {
  // 8 hex chars (4 bytes), uppercase
  return randomBytes(4).toString('hex').toUpperCase();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function paymentLinkRoutes(app: FastifyInstance) {
  // Public endpoint — must be registered BEFORE the auth hook
  // GET /code/:shortCode — resolve link by short code (for hosted checkout page)
  app.get('/code/:shortCode', async (request, reply) => {
    const { shortCode } = request.params as { shortCode: string };

    const link = await db.query.paymentLinks.findFirst({
      where: eq(schema.paymentLinks.shortCode, shortCode),
    });

    if (!link) {
      return reply.status(404).send({ title: 'Not Found', status: 404, detail: 'Payment link not found.' });
    }

    // Auto-expire if past expiresAt
    if (link.status === 'pending' && new Date(link.expiresAt) < new Date()) {
      await db
        .update(schema.paymentLinks)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(schema.paymentLinks.id, link.id));
      link.status = 'expired';
    }

    return reply.status(200).send({ data: link });
  });

  // All remaining routes require authentication
  app.addHook('onRequest', app.authenticate);

  // POST / — create a new payment link
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createLinkSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { expiresInHours, ...linkData } = body.data;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    // Generate unique shortCode (retry on collision — extremely rare)
    let shortCode: string;
    let attempts = 0;
    do {
      shortCode = generateShortCode();
      attempts++;
      if (attempts > 10) {
        return reply.status(500).send({ title: 'Internal Server Error', status: 500, detail: 'Could not generate unique short code.' });
      }
      const existing = await db.query.paymentLinks.findFirst({
        where: eq(schema.paymentLinks.shortCode, shortCode),
      });
      if (!existing) break;
    } while (true);

    const [link] = await db
      .insert(schema.paymentLinks)
      .values({
        ...linkData,
        orgId,
        amount: String(linkData.amount),
        expiresAt,
        shortCode,
        metadata: linkData.metadata ?? null,
        reference: linkData.reference ?? null,
        customerId: linkData.customerId ?? null,
      })
      .returning();

    return reply.status(201).send({ data: link });
  });

  // GET / — list payment links for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { status?: string; locationId?: string; limit?: string };

    const links = await db.query.paymentLinks.findMany({
      where: and(
        eq(schema.paymentLinks.orgId, orgId),
        q.locationId ? eq(schema.paymentLinks.locationId, q.locationId) : undefined,
      ),
      orderBy: [desc(schema.paymentLinks.createdAt)],
      limit: q.limit ? Math.min(parseInt(q.limit, 10), 500) : 100,
    });

    // Filter by status in memory (avoids needing a SQL enum cast)
    const filtered = q.status
      ? links.filter((l) => l.status === q.status)
      : links;

    return reply.status(200).send({ data: filtered, total: filtered.length });
  });

  // GET /:id — get single payment link
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const link = await db.query.paymentLinks.findFirst({
      where: and(eq(schema.paymentLinks.id, id), eq(schema.paymentLinks.orgId, orgId)),
    });

    if (!link) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    return reply.status(200).send({ data: link });
  });

  // POST /:id/pay — mark link as paid
  app.post('/:id/pay', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = paySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const link = await db.query.paymentLinks.findFirst({
      where: and(eq(schema.paymentLinks.id, id), eq(schema.paymentLinks.orgId, orgId)),
    });

    if (!link) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (link.status !== 'pending') {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot pay a link with status '${link.status}'.` });
    }
    if (new Date(link.expiresAt) < new Date()) {
      await db.update(schema.paymentLinks).set({ status: 'expired', updatedAt: new Date() }).where(eq(schema.paymentLinks.id, id));
      return reply.status(410).send({ title: 'Gone', status: 410, detail: 'Payment link has expired.' });
    }

    const [updated] = await db
      .update(schema.paymentLinks)
      .set({
        status: 'paid',
        paidAt: new Date(),
        paymentId: body.data.paymentId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.paymentLinks.id, id))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/cancel — cancel a pending link
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const link = await db.query.paymentLinks.findFirst({
      where: and(eq(schema.paymentLinks.id, id), eq(schema.paymentLinks.orgId, orgId)),
    });

    if (!link) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (link.status !== 'pending') {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot cancel a link with status '${link.status}'.` });
    }

    const [updated] = await db
      .update(schema.paymentLinks)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.paymentLinks.id, id))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/resend — mark link as resent (triggers notification in full system)
  app.post('/:id/resend', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const link = await db.query.paymentLinks.findFirst({
      where: and(eq(schema.paymentLinks.id, id), eq(schema.paymentLinks.orgId, orgId)),
    });

    if (!link) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (link.status !== 'pending') {
      return reply.status(409).send({ title: 'Conflict', status: 409, detail: `Cannot resend a link with status '${link.status}'.` });
    }

    // Update metadata to record resentAt timestamp
    const existingMeta = (link.metadata as Record<string, unknown>) ?? {};
    const [updated] = await db
      .update(schema.paymentLinks)
      .set({
        metadata: { ...existingMeta, resentAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(schema.paymentLinks.id, id))
      .returning();

    // TODO: In full implementation, emit a 'payment_link.resent' event to trigger
    // the notifications service (email/SMS) to re-send the payment link to the customer.

    return reply.status(200).send({ data: updated });
  });
}
