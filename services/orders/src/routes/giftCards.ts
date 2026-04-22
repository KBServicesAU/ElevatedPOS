import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { db, schema } from '../db';
import { publishEvent } from '../lib/kafka';

function generateGiftCardCode(): string {
  // 16-char alphanumeric uppercase
  return crypto.randomBytes(12).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16).padEnd(16, '0');
}

const issueGiftCardSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('AUD'),
  customerId: z.string().uuid().optional(),
  expiresAt: z.string().optional(),
  notes: z.string().optional(),
});

const topupSchema = z.object({
  amount: z.number().positive(),
  reference: z.string().optional(),
});

const redeemSchema = z.object({
  amount: z.number().positive(),
  orderId: z.string().uuid().optional(),
  reference: z.string().optional(),
});

const voidSchema = z.object({
  reason: z.string().min(1),
});

export async function giftCardRoutes(app: FastifyInstance) {
  // GET /api/v1/gift-cards/:code — public lookup (no auth required)
  app.get('/:code', async (request, reply) => {
    const { code } = request.params as { code: string };

    const card = await db.query.giftCards.findFirst({
      where: eq(schema.giftCards.code, code.toUpperCase()),
    });

    if (!card) return reply.status(404).send({ title: 'Not Found', status: 404 });

    // Check expiry
    if (card.expiresAt && new Date() > card.expiresAt && card.status === 'active') {
      await db.update(schema.giftCards).set({
        status: 'expired',
        updatedAt: new Date(),
      }).where(eq(schema.giftCards.id, card.id));

      await db.insert(schema.giftCardTransactions).values({
        giftCardId: card.id,
        amount: '0',
        type: 'expiry',
        reference: 'Auto-expired',
        performedBy: null,
      });

      return reply.status(200).send({
        data: {
          id: card.id,
          code: card.code,
          currentBalance: '0.0000',
          status: 'expired',
          expiresAt: card.expiresAt,
        },
      });
    }

    return reply.status(200).send({
      data: {
        id: card.id,
        code: card.code,
        currentBalance: card.currentBalance,
        status: card.status,
        expiresAt: card.expiresAt,
      },
    });
  });

  // All routes below require authentication
  app.addHook('onRequest', app.authenticate);

  // POST /api/v1/gift-cards — issue new gift card
  app.post('/', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = issueGiftCardSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    // Generate a unique code (retry on collision)
    let code = generateGiftCardCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await db.query.giftCards.findFirst({ where: eq(schema.giftCards.code, code) });
      if (!existing) break;
      code = generateGiftCardCode();
      attempts++;
    }

    const cardRows = await db.insert(schema.giftCards).values({
      orgId,
      code,
      originalAmount: String(body.data.amount.toFixed(4)),
      currentBalance: String(body.data.amount.toFixed(4)),
      currency: body.data.currency,
      status: 'active',
      customerId: body.data.customerId ?? null,
      issuedByEmployeeId: employeeId,
      expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null,
    }).returning();
    const card = cardRows[0]!;

    await db.insert(schema.giftCardTransactions).values({
      giftCardId: card.id,
      orderId: null,
      amount: String(body.data.amount.toFixed(4)),
      type: 'issue',
      reference: body.data.notes ?? 'Gift card issued',
      performedBy: employeeId,
    });

    await publishEvent('gift_card.issued', {
      id: card.id,
      orgId,
      code: card.code,
      amount: card.originalAmount,
      customerId: card.customerId,
      timestamp: new Date().toISOString(),
    });

    return reply.status(201).send({ data: card });
  });

  // POST /api/v1/gift-cards/:code/topup — add funds
  app.post('/:code/topup', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const { code } = request.params as { code: string };
    const body = topupSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const card = await db.query.giftCards.findFirst({
      where: and(eq(schema.giftCards.code, code.toUpperCase()), eq(schema.giftCards.orgId, orgId)),
    });
    if (!card) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (card.status === 'cancelled' || card.status === 'expired') {
      return reply.status(409).send({ title: 'Gift card cannot be topped up', status: 409, detail: `Gift card status is ${card.status}` });
    }

    const newBalance = Number(card.currentBalance) + body.data.amount;

    const [updated] = await db.update(schema.giftCards).set({
      currentBalance: String(newBalance.toFixed(4)),
      status: 'active',
      updatedAt: new Date(),
    }).where(eq(schema.giftCards.id, card.id)).returning();

    await db.insert(schema.giftCardTransactions).values({
      giftCardId: card.id,
      orderId: null,
      amount: String(body.data.amount.toFixed(4)),
      type: 'topup',
      reference: body.data.reference ?? null,
      performedBy: employeeId,
    });

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/gift-cards/:code/redeem — redeem amount
  app.post('/:code/redeem', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const { code } = request.params as { code: string };
    const body = redeemSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const card = await db.query.giftCards.findFirst({
      where: and(eq(schema.giftCards.code, code.toUpperCase()), eq(schema.giftCards.orgId, orgId)),
    });
    if (!card) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (card.status !== 'active') {
      return reply.status(409).send({ title: 'Gift card not active', status: 409, detail: `Gift card status is ${card.status}` });
    }

    // Check expiry
    if (card.expiresAt && new Date() > card.expiresAt) {
      return reply.status(409).send({ title: 'Gift card expired', status: 409 });
    }

    const currentBalance = Number(card.currentBalance);
    if (body.data.amount > currentBalance) {
      return reply.status(422).send({
        title: 'Insufficient balance',
        status: 422,
        detail: `Redemption amount $${body.data.amount.toFixed(2)} exceeds balance $${currentBalance.toFixed(2)}`,
      });
    }

    const newBalance = currentBalance - body.data.amount;
    const isDepleted = newBalance <= 0;

    const [updated] = await db.update(schema.giftCards).set({
      currentBalance: String(Math.max(0, newBalance).toFixed(4)),
      status: isDepleted ? 'depleted' : 'active',
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(schema.giftCards.id, card.id)).returning();

    await db.insert(schema.giftCardTransactions).values({
      giftCardId: card.id,
      orderId: body.data.orderId ?? null,
      // Negative amount indicates redemption
      amount: String((-body.data.amount).toFixed(4)),
      type: 'redeem',
      reference: body.data.reference ?? null,
      performedBy: employeeId,
    });

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/gift-cards/:code/void — void card (manager permission required)
  app.post('/:code/void', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    // Note: caller should verify manager-level role before invoking; this endpoint
    // records the void and notes the performing employee for audit purposes.
    const { code } = request.params as { code: string };
    const body = voidSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const card = await db.query.giftCards.findFirst({
      where: and(eq(schema.giftCards.code, code.toUpperCase()), eq(schema.giftCards.orgId, orgId)),
    });
    if (!card) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (card.status === 'cancelled') {
      return reply.status(409).send({ title: 'Gift card already voided', status: 409 });
    }

    const [updated] = await db.update(schema.giftCards).set({
      status: 'cancelled',
      updatedAt: new Date(),
    }).where(eq(schema.giftCards.id, card.id)).returning();

    await db.insert(schema.giftCardTransactions).values({
      giftCardId: card.id,
      orderId: null,
      amount: '0',
      type: 'void',
      reference: body.data.reason,
      performedBy: employeeId,
    });

    await publishEvent('gift_card.voided', {
      id: card.id,
      orgId,
      code: card.code,
      reason: body.data.reason,
      performedBy: employeeId,
      timestamp: new Date().toISOString(),
    });

    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/gift-cards/:id/send-email — email the gift card code to a recipient.
  // v2.7.40 — the dashboard "Send email" action was failing because this
  // route didn't exist. Posts a branded email via the notifications service
  // following the same pattern as /orders/:id/send-receipt.
  app.post('/:id/send-email', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({ email: z.string().email() }).safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    // Look up the gift card — accept either the UUID or the code so the
    // dashboard can call this with whatever identifier it has on hand.
    let card = await db.query.giftCards.findFirst({
      where: and(eq(schema.giftCards.id, id), eq(schema.giftCards.orgId, orgId)),
    });
    if (!card) {
      card = await db.query.giftCards.findFirst({
        where: and(eq(schema.giftCards.code, id.toUpperCase()), eq(schema.giftCards.orgId, orgId)),
      });
    }
    if (!card) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const balance = Number(card.currentBalance);
    const currency = card.currency ?? 'AUD';
    const formattedBalance = balance.toFixed(2);

    const notificationsUrl = process.env['NOTIFICATIONS_SERVICE_URL'] ?? 'http://notifications:4009';
    const authHeader = request.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ type: 'about:blank', title: 'Unauthorized', status: 401 });
    }

    try {
      const res = await fetch(`${notificationsUrl}/api/v1/notifications/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          to: body.data.email,
          subject: `You have a gift card — ${currency} $${formattedBalance}`,
          template: 'gift_card',
          orgId,
          data: {
            code: card.code,
            balance: formattedBalance,
            currency,
            expiresAt: card.expiresAt?.toISOString() ?? null,
          },
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { detail?: string; title?: string };
        return reply.status(502).send({
          type: 'about:blank',
          title: 'Email Send Failed',
          status: 502,
          detail: errBody.detail ?? errBody.title ?? `Notifications service returned ${res.status}`,
        });
      }
      return reply.status(200).send({ data: { email: body.data.email, giftCardId: card.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({
        type: 'about:blank',
        title: 'Email Send Failed',
        status: 502,
        detail: message,
      });
    }
  });

  // GET /api/v1/gift-cards — list gift cards for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { status?: string; customerId?: string; limit?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);

    const results = await db.query.giftCards.findMany({
      where: and(
        eq(schema.giftCards.orgId, orgId),
        q.customerId ? eq(schema.giftCards.customerId, q.customerId) : undefined,
      ),
      orderBy: [desc(schema.giftCards.createdAt)],
      limit,
    });

    const filtered = q.status
      ? results.filter((r) => r.status === q.status)
      : results;

    return reply.status(200).send({ data: filtered, meta: { totalCount: filtered.length, hasMore: results.length === limit } });
  });
}
