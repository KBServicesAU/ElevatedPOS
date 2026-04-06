import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db, schema } from '../db';

const invoiceLineSchema = z.object({
  description: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number(),
  taxRate: z.number().min(0).max(100).default(0),
});

const createInvoiceSchema = z.object({
  customerId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  lines: z.array(invoiceLineSchema).min(1),
  dueDate: z.string().datetime(),
  notes: z.string().optional(),
  paymentTerms: z.string().optional(),
  currency: z.string().length(3).default('AUD'),
});

/** Generate sequential invoice number: INV-{year}-{padded seq} */
async function generateInvoiceNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  // Count existing invoices for this org in this year
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.orgId, orgId),
        sql`invoice_number LIKE ${prefix + '%'}`,
      ),
    );
  const seq = (Number(result[0]?.count ?? 0) + 1);
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export async function invoiceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST / — create invoice
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createInvoiceSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const { lines, dueDate, notes, paymentTerms, currency, customerId, orderId } = body.data;

    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    const processedLines = lines.map((line, idx) => {
      const lineTotal = Math.round(line.qty * line.unitPrice * 100) / 100;
      const lineTax = Math.round(lineTotal * (line.taxRate / 100) * 100) / 100;
      subtotal += lineTotal;
      taxAmount += lineTax;
      return { ...line, lineTotal, sortOrder: idx };
    });
    subtotal = Math.round(subtotal * 100) / 100;
    taxAmount = Math.round(taxAmount * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    const invoiceNumber = await generateInvoiceNumber(orgId);

    const invoiceRows = await db.insert(schema.invoices).values({
      orgId,
      invoiceNumber,
      customerId: customerId ?? null,
      orderId: orderId ?? null,
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      total: String(total),
      currency,
      dueDate: new Date(dueDate),
      notes: notes ?? null,
      paymentTerms: paymentTerms ?? null,
      status: 'draft',
    }).returning();
    const invoice = invoiceRows[0]!;

    // Insert lines
    await db.insert(schema.invoiceLines).values(
      processedLines.map(l => ({
        invoiceId: invoice.id,
        description: l.description,
        qty: String(l.qty),
        unitPrice: String(l.unitPrice),
        taxRate: String(l.taxRate),
        lineTotal: String(l.lineTotal),
        sortOrder: l.sortOrder,
      })),
    );

    const invoiceWithLines = await db.query.invoices.findFirst({
      where: eq(schema.invoices.id, invoice.id),
      with: { lines: { orderBy: asc(schema.invoiceLines.sortOrder) } },
    });

    return reply.status(201).send({ data: invoiceWithLines });
  });

  // GET / — list invoices with filters
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as {
      status?: string;
      customerId?: string;
      overdueOnly?: string;
    };

    const conditions = [eq(schema.invoices.orgId, orgId)];

    if (q.status) conditions.push(eq(schema.invoices.status, q.status as 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'));
    if (q.customerId) conditions.push(eq(schema.invoices.customerId, q.customerId));
    if (q.overdueOnly === 'true') {
      conditions.push(
        and(
          eq(schema.invoices.status, 'sent'),
          sql`due_date < now()`,
        )!,
      );
    }

    const invoiceList = await db.query.invoices.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.invoices.createdAt)],
      with: { lines: { orderBy: asc(schema.invoiceLines.sortOrder) } },
    });

    return reply.status(200).send({ data: invoiceList });
  });

  // GET /:id — invoice detail
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const invoice = await db.query.invoices.findFirst({
      where: and(eq(schema.invoices.id, id), eq(schema.invoices.orgId, orgId)),
      with: { lines: { orderBy: asc(schema.invoiceLines.sortOrder) } },
    });
    if (!invoice) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: invoice });
  });

  // POST /:id/send — mark invoice as sent
  app.post('/:id/send', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const invoice = await db.query.invoices.findFirst({
      where: and(eq(schema.invoices.id, id), eq(schema.invoices.orgId, orgId)),
    });
    if (!invoice) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!['draft', 'sent'].includes(invoice.status)) {
      return reply.status(409).send({ title: 'Cannot send invoice in current status', status: 409 });
    }
    const [updated] = await db.update(schema.invoices).set({
      status: 'sent',
      sentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(schema.invoices.id, id)).returning();
    return reply.status(200).send({ data: updated });
  });

  // POST /:id/pay — record payment and mark paid
  app.post('/:id/pay', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({ paymentId: z.string().uuid().optional() }).safeParse(request.body);
    const invoice = await db.query.invoices.findFirst({
      where: and(eq(schema.invoices.id, id), eq(schema.invoices.orgId, orgId)),
    });
    if (!invoice) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (invoice.status === 'paid') {
      return reply.status(409).send({ title: 'Invoice already paid', status: 409 });
    }
    if (['cancelled', 'void'].includes(invoice.status)) {
      return reply.status(409).send({ title: 'Cannot pay a cancelled invoice', status: 409 });
    }
    const paymentId = body.success ? body.data.paymentId : undefined;
    const [updated] = await db.update(schema.invoices).set({
      status: 'paid',
      paidAt: new Date(),
      ...(paymentId !== undefined ? { paymentId } : {}),
      updatedAt: new Date(),
    }).where(eq(schema.invoices.id, id)).returning();
    return reply.status(200).send({ data: updated });
  });

  // POST /:id/void — cancel invoice
  app.post('/:id/void', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const invoice = await db.query.invoices.findFirst({
      where: and(eq(schema.invoices.id, id), eq(schema.invoices.orgId, orgId)),
    });
    if (!invoice) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (invoice.status === 'paid') {
      return reply.status(409).send({ title: 'Cannot void a paid invoice', status: 409 });
    }
    const [updated] = await db.update(schema.invoices).set({
      status: 'cancelled',
      updatedAt: new Date(),
    }).where(eq(schema.invoices.id, id)).returning();
    return reply.status(200).send({ data: updated });
  });

  // GET /:id/pdf-data — structured JSON for PDF generation
  app.get('/:id/pdf-data', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const invoice = await db.query.invoices.findFirst({
      where: and(eq(schema.invoices.id, id), eq(schema.invoices.orgId, orgId)),
      with: { lines: { orderBy: asc(schema.invoiceLines.sortOrder) } },
    });
    if (!invoice) return reply.status(404).send({ title: 'Not Found', status: 404 });

    // Build structured PDF data payload
    const pdfData = {
      meta: {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        createdAt: invoice.createdAt,
        dueDate: invoice.dueDate,
        sentAt: invoice.sentAt,
        paidAt: invoice.paidAt,
        paymentTerms: invoice.paymentTerms,
        notes: invoice.notes,
        currency: invoice.currency,
      },
      seller: {
        name: 'ElevatedPOS',                          // Replace with org profile lookup
        logoUrl: process.env['APP_LOGO_URL'] ?? null,
        address: null,                               // Populate from org settings
        abn: null,
      },
      buyer: {
        customerId: invoice.customerId ?? null,
        name: null,                                  // Populate from customers service
        address: null,
      },
      lines: (invoice as any).lines.map((l: any) => ({
        description: l.description,
        qty: Number(l.qty),
        unitPrice: Number(l.unitPrice),
        taxRate: Number(l.taxRate),
        lineTotal: Number(l.lineTotal),
      })),
      totals: {
        subtotal: Number(invoice.subtotal),
        taxAmount: Number(invoice.taxAmount),
        total: Number(invoice.total),
      },
    };

    return reply.status(200).send({ data: pdfData });
  });
}
