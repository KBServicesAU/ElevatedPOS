import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';
import { processPayment, processRefund } from '../lib/acquirer';

const initiateSchema = z.object({
  orderId: z.string().uuid(),
  locationId: z.string().uuid(),
  method: z.enum(['card', 'cash', 'store_credit', 'gift_card', 'voucher', 'bnpl', 'split']),
  amount: z.number().positive(),
  currency: z.string().length(3).default('AUD'),
  tipAmount: z.number().min(0).default(0),
  surchargeAmount: z.number().min(0).default(0),
  acquirer: z.enum(['tyro', 'stripe', 'anz', 'westpac', 'nab', 'cba', 'windcave']).optional(),
  terminalId: z.string().uuid().optional(),
  isOffline: z.boolean().default(false),
});

/**
 * Australian cash rounding — rounds to nearest $0.05.
 * Returns { roundedTotal, roundingAmount } where roundingAmount may be negative
 * (round down) or positive (round up).
 */
function australianCashRound(amount: number): { roundedTotal: number; roundingAmount: number } {
  const cents = Math.round(amount * 100);
  const remainder = cents % 5;
  let roundedCents: number;
  if (remainder === 0) {
    roundedCents = cents;
  } else if (remainder <= 2) {
    roundedCents = cents - remainder;       // round down
  } else {
    roundedCents = cents + (5 - remainder); // round up
  }
  const roundedTotal = roundedCents / 100;
  const roundingAmount = Math.round((roundedTotal - amount) * 10000) / 10000;
  return { roundedTotal, roundingAmount };
}

export async function paymentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { orderId?: string; locationId?: string };
    const payments = await db.query.payments.findMany({
      where: and(
        eq(schema.payments.orgId, orgId),
        q.orderId ? eq(schema.payments.orderId, q.orderId) : undefined,
        q.locationId ? eq(schema.payments.locationId, q.locationId) : undefined,
      ),
      orderBy: [desc(schema.payments.createdAt)],
    });
    return reply.status(200).send({ data: payments });
  });

  app.post('/initiate', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = initiateSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });

    const { acquirer, ...paymentData } = body.data;

    // Apply Australian cash rounding when method is cash
    let effectiveAmount = paymentData.amount;
    let roundingAmount = 0;
    if (paymentData.method === 'cash') {
      const rounded = australianCashRound(
        paymentData.amount + paymentData.tipAmount + paymentData.surchargeAmount,
      );
      roundingAmount = rounded.roundingAmount;
      // Adjust the stored amount to include the rounded total
      effectiveAmount = rounded.roundedTotal - paymentData.tipAmount - paymentData.surchargeAmount;
    }

    // Create pending payment record
    const [payment] = await db.insert(schema.payments).values({
      ...paymentData,
      orgId,
      amount: String(effectiveAmount),
      tipAmount: String(paymentData.tipAmount),
      surchargeAmount: String(paymentData.surchargeAmount),
      roundingAmount: String(roundingAmount),
      acquirer: acquirer ?? 'tyro',
      status: 'pending',
    }).returning();

    if (paymentData.method === 'card' && !paymentData.isOffline && acquirer) {
      const result = await processPayment({
        amount: paymentData.amount + paymentData.tipAmount + paymentData.surchargeAmount,
        currency: paymentData.currency,
        tipAmount: paymentData.tipAmount,
        referenceId: payment.id,
        terminalId: paymentData.terminalId,
        acquirer,
      });

      const [updated] = await db.update(schema.payments).set({
        status: result.success ? 'approved' : 'declined',
        acquirerTransactionId: result.acquirerTransactionId,
        cardScheme: result.cardScheme,
        cardLast4: result.cardLast4,
        authCode: result.authCode,
        processedAt: new Date(),
      }).where(eq(schema.payments.id, payment.id)).returning();

      if (!result.success) {
        return reply.status(402).send({
          type: 'https://nexus.app/errors/payment-declined',
          title: 'Payment Declined',
          status: 402,
          detail: result.errorMessage ?? 'Payment was declined by the acquirer.',
          paymentId: payment.id,
        });
      }

      return reply.status(200).send({ data: updated });
    }

    // Cash/store credit/etc — immediately approve
    const [approved] = await db.update(schema.payments).set({
      status: 'approved',
      processedAt: new Date(),
    }).where(eq(schema.payments.id, payment.id)).returning();

    return reply.status(200).send({ data: approved });
  });

  app.post('/:id/void', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const payment = await db.query.payments.findFirst({ where: and(eq(schema.payments.id, id), eq(schema.payments.orgId, orgId)) });
    if (!payment) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (payment.status !== 'approved') return reply.status(409).send({ title: 'Cannot void', status: 409 });

    const [updated] = await db.update(schema.payments).set({ status: 'void' }).where(eq(schema.payments.id, id)).returning();
    return reply.status(200).send({ data: updated });
  });

  app.get('/settlements', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const settlements = await db.query.settlements.findMany({
      where: eq(schema.settlements.orgId, orgId),
      orderBy: [desc(schema.settlements.settlementDate)],
    });
    return reply.status(200).send({ data: settlements });
  });
}
