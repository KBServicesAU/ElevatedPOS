import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';
import { publishEvent } from '../lib/kafka';

let laybyCounter = 1;
function generateAgreementNumber(): string {
  const year = new Date().getFullYear();
  const seq = String(laybyCounter++).padStart(6, '0');
  return `LAY-${year}-${seq}`;
}

const paymentScheduleItemSchema = z.object({
  dueDate: z.string(),
  amount: z.number().positive(),
  status: z.enum(['pending', 'paid', 'overdue']).default('pending'),
  paidAt: z.string().nullable().optional(),
});

const laybyItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  name: z.string(),
  sku: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  lineTotal: z.number().min(0),
});

const createLaybySchema = z.object({
  locationId: z.string().uuid(),
  customerId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  customerName: z.string().min(1),
  customerAddress: z.string().min(1),
  totalAmount: z.number().positive(),
  depositAmount: z.number().positive(),
  paymentSchedule: z.array(paymentScheduleItemSchema).default([]),
  items: z.array(laybyItemSchema).min(1),
  cancellationPolicy: z.string().optional(),
  notes: z.string().optional(),
});

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'eftpos', 'bank_transfer', 'store_credit']),
  reference: z.string().optional(),
});

const cancelLaybySchema = z.object({
  reason: z.string().min(1),
  cancellationFee: z.number().min(0).default(0),
});

export async function laybyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /api/v1/laybys
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createLaybySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { totalAmount, depositAmount } = body.data;

    // AU Consumer Law: deposit must be >= 10% of total
    const minDeposit = totalAmount * 0.1;
    if (depositAmount < minDeposit) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: `Deposit must be at least 10% of total amount ($${minDeposit.toFixed(2)}) per Australian Consumer Law`,
      });
    }

    const balanceOwing = totalAmount - depositAmount;

    const [agreement] = await db.insert(schema.laybyAgreements).values({
      orgId,
      locationId: body.data.locationId,
      customerId: body.data.customerId,
      orderId: body.data.orderId ?? null,
      agreementNumber: generateAgreementNumber(),
      status: 'active',
      totalAmount: String(totalAmount.toFixed(4)),
      depositAmount: String(depositAmount.toFixed(4)),
      balanceOwing: String(balanceOwing.toFixed(4)),
      cancellationFee: '0',
      paymentSchedule: body.data.paymentSchedule,
      items: body.data.items,
      customerName: body.data.customerName,
      customerAddress: body.data.customerAddress,
      cancellationPolicy: body.data.cancellationPolicy ?? null,
      notes: body.data.notes ?? null,
      activatedAt: new Date(),
    }).returning();

    // Record initial deposit payment
    await db.insert(schema.laybyPayments).values({
      laybyId: agreement.id,
      amount: String(depositAmount.toFixed(4)),
      method: body.data.items.length > 0 ? 'cash' : 'cash', // default, caller may specify
      reference: 'Initial deposit',
      paidAt: new Date(),
    });

    await publishEvent('layby.created', {
      id: agreement.id,
      orgId,
      agreementNumber: agreement.agreementNumber,
      customerId: agreement.customerId,
      totalAmount: agreement.totalAmount,
      depositAmount: agreement.depositAmount,
      timestamp: new Date().toISOString(),
    });

    return reply.status(201).send({ data: agreement });
  });

  // GET /api/v1/laybys
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { status?: string; customerId?: string; limit?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);

    const results = await db.query.laybyAgreements.findMany({
      where: and(
        eq(schema.laybyAgreements.orgId, orgId),
        q.customerId ? eq(schema.laybyAgreements.customerId, q.customerId) : undefined,
      ),
      orderBy: [desc(schema.laybyAgreements.createdAt)],
      limit,
    });

    const filtered = q.status
      ? results.filter((r) => r.status === q.status)
      : results;

    return reply.status(200).send({ data: filtered, meta: { totalCount: filtered.length, hasMore: results.length === limit } });
  });

  // GET /api/v1/laybys/:id
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const agreement = await db.query.laybyAgreements.findFirst({
      where: and(eq(schema.laybyAgreements.id, id), eq(schema.laybyAgreements.orgId, orgId)),
    });

    if (!agreement) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const payments = await db.query.laybyPayments.findMany({
      where: eq(schema.laybyPayments.laybyId, id),
      orderBy: [desc(schema.laybyPayments.paidAt)],
    });

    return reply.status(200).send({ data: { ...agreement, payments } });
  });

  // POST /api/v1/laybys/:id/payments
  app.post('/:id/payments', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = recordPaymentSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const agreement = await db.query.laybyAgreements.findFirst({
      where: and(eq(schema.laybyAgreements.id, id), eq(schema.laybyAgreements.orgId, orgId)),
    });
    if (!agreement) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (agreement.status !== 'active') {
      return reply.status(409).send({ title: 'Lay-by not active', status: 409, detail: `Lay-by status is ${agreement.status}` });
    }

    const currentBalance = Number(agreement.balanceOwing);
    const paymentAmount = body.data.amount;

    if (paymentAmount > currentBalance) {
      return reply.status(422).send({
        title: 'Validation Error',
        status: 422,
        detail: `Payment amount $${paymentAmount.toFixed(2)} exceeds balance owing $${currentBalance.toFixed(2)}`,
      });
    }

    const [payment] = await db.insert(schema.laybyPayments).values({
      laybyId: id,
      amount: String(paymentAmount.toFixed(4)),
      method: body.data.method,
      reference: body.data.reference ?? null,
      paidAt: new Date(),
    }).returning();

    const newBalance = currentBalance - paymentAmount;
    const isPaid = newBalance <= 0;

    const [updated] = await db.update(schema.laybyAgreements).set({
      balanceOwing: String(Math.max(0, newBalance).toFixed(4)),
      status: isPaid ? 'paid' : 'active',
      completedAt: isPaid ? new Date() : null,
      updatedAt: new Date(),
    }).where(and(eq(schema.laybyAgreements.id, id), eq(schema.laybyAgreements.orgId, orgId))).returning();

    if (isPaid) {
      await publishEvent('layby.paid', {
        id: updated.id,
        orgId,
        agreementNumber: updated.agreementNumber,
        customerId: updated.customerId,
        totalAmount: updated.totalAmount,
        completedAt: updated.completedAt,
        timestamp: new Date().toISOString(),
      });
    }

    return reply.status(201).send({ data: { payment, layby: updated } });
  });

  // POST /api/v1/laybys/:id/cancel
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = cancelLaybySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const agreement = await db.query.laybyAgreements.findFirst({
      where: and(eq(schema.laybyAgreements.id, id), eq(schema.laybyAgreements.orgId, orgId)),
    });
    if (!agreement) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (agreement.status !== 'active') {
      return reply.status(409).send({ title: 'Lay-by not active', status: 409, detail: `Lay-by status is ${agreement.status}` });
    }

    const totalPaid = Number(agreement.totalAmount) - Number(agreement.balanceOwing);
    const cancellationFee = body.data.cancellationFee;
    // Refund balance to customer as store credit (amount paid minus cancellation fee)
    const storeCreditRefund = Math.max(0, totalPaid - cancellationFee);

    const [updated] = await db.update(schema.laybyAgreements).set({
      status: 'cancelled',
      cancellationFee: String(cancellationFee.toFixed(4)),
      cancelledAt: new Date(),
      notes: agreement.notes
        ? `${agreement.notes}\nCancellation reason: ${body.data.reason}`
        : `Cancellation reason: ${body.data.reason}`,
      updatedAt: new Date(),
    }).where(and(eq(schema.laybyAgreements.id, id), eq(schema.laybyAgreements.orgId, orgId))).returning();

    await publishEvent('layby.cancelled', {
      id: updated.id,
      orgId,
      agreementNumber: updated.agreementNumber,
      customerId: updated.customerId,
      cancellationFee: updated.cancellationFee,
      storeCreditRefund: storeCreditRefund.toFixed(4),
      reason: body.data.reason,
      timestamp: new Date().toISOString(),
    });

    return reply.status(200).send({
      data: {
        layby: updated,
        cancellationFee: cancellationFee.toFixed(4),
        storeCreditRefund: storeCreditRefund.toFixed(4),
      },
    });
  });

  // GET /api/v1/laybys/:id/statement
  app.get('/:id/statement', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const agreement = await db.query.laybyAgreements.findFirst({
      where: and(eq(schema.laybyAgreements.id, id), eq(schema.laybyAgreements.orgId, orgId)),
    });
    if (!agreement) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const payments = await db.query.laybyPayments.findMany({
      where: eq(schema.laybyPayments.laybyId, id),
      orderBy: [desc(schema.laybyPayments.paidAt)],
    });

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const statement = {
      agreementNumber: agreement.agreementNumber,
      status: agreement.status,
      customer: {
        id: agreement.customerId,
        name: agreement.customerName,
        address: agreement.customerAddress,
      },
      financials: {
        totalAmount: agreement.totalAmount,
        depositAmount: agreement.depositAmount,
        totalPaid: totalPaid.toFixed(4),
        balanceOwing: agreement.balanceOwing,
        cancellationFee: agreement.cancellationFee,
      },
      items: agreement.items,
      paymentSchedule: agreement.paymentSchedule,
      payments,
      cancellationPolicy: agreement.cancellationPolicy,
      notes: agreement.notes,
      activatedAt: agreement.activatedAt,
      completedAt: agreement.completedAt,
      cancelledAt: agreement.cancelledAt,
      generatedAt: new Date().toISOString(),
    };

    return reply.status(200).send({ data: statement });
  });
}
