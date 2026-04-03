import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { stripeConnectAccounts, stripeInvoices } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const NOTIFICATIONS_API_URL = process.env['NOTIFICATIONS_API_URL'] ?? 'http://localhost:4009';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
  apiVersion: '2024-06-20',
});

export async function connectExtendedRoutes(app: FastifyInstance) {

  // ── GET /connect/balance/:orgId ──────────────────────────────────────────────
  app.get('/connect/balance/:orgId', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const rows = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const { stripeAccountId } = rows[0]!;
    const balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });

    return reply.send({
      available: balance.available,
      pending: balance.pending,
      currency: 'aud',
    });
  });

  // ── GET /connect/payouts/:orgId ──────────────────────────────────────────────
  app.get('/connect/payouts/:orgId', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const rows = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const { stripeAccountId } = rows[0]!;
    const data = await stripe.payouts.list({ limit: 50 }, { stripeAccount: stripeAccountId });

    return reply.send({ payouts: data.data });
  });

  // ── GET /connect/charges/:orgId ──────────────────────────────────────────────
  app.get('/connect/charges/:orgId', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { limit = '50', starting_after } = request.query as {
      limit?: string;
      starting_after?: string;
    };

    const rows = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const { stripeAccountId } = rows[0]!;
    const data = await stripe.charges.list(
      { limit: Number(limit), ...(starting_after ? { starting_after } : {}) },
      { stripeAccount: stripeAccountId },
    );

    return reply.send({ charges: data.data, hasMore: data.has_more });
  });

  // ── GET /connect/invoices/public/:invoiceId ──────────────────────────────────
  // No auth required — called by pay.elevatedpos.com.au
  app.get('/connect/invoices/public/:invoiceId', async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };

    const rows = await db.select().from(stripeInvoices)
      .where(eq(stripeInvoices.stripeInvoiceId, invoiceId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Invoice not found' });

    const row = rows[0]!;
    const invoice = await stripe.invoices.retrieve(invoiceId, {}, { stripeAccount: row.stripeAccountId });

    return reply.send({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        dueDate: invoice.due_date,
        customerEmail: invoice.customer_email,
        customerName: invoice.customer_name,
        description: invoice.description,
        lines: invoice.lines.data.map((l) => ({
          description: l.description,
          amount: l.amount,
          quantity: l.quantity,
        })),
        invoicePdf: invoice.invoice_pdf,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
      },
      orgId: row.orgId,
    });
  });

  // ── POST /connect/invoices/:invoiceId/pay-intent ─────────────────────────────
  app.post('/connect/invoices/:invoiceId/pay-intent', async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const { orgId } = request.body as { orgId: string };

    const rows = await db.select().from(stripeInvoices)
      .where(eq(stripeInvoices.stripeInvoiceId, invoiceId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Invoice not found' });

    const stripeAccount = rows[0]!.stripeAccountId;

    let invoice = await stripe.invoices.retrieve(invoiceId, {}, { stripeAccount });

    // Finalize if still in draft
    if (invoice.status === 'draft') {
      invoice = await stripe.invoices.finalizeInvoice(invoiceId, {}, { stripeAccount });
    }

    let paymentIntent: Stripe.PaymentIntent;
    if (typeof invoice.payment_intent === 'string') {
      paymentIntent = await stripe.paymentIntents.retrieve(
        invoice.payment_intent,
        {},
        { stripeAccount },
      );
    } else if (invoice.payment_intent && typeof invoice.payment_intent === 'object') {
      paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;
    } else {
      return reply.status(400).send({ error: 'Invoice has no payment intent' });
    }

    return reply.send({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      orgId,
    });
  });

  // ── POST /connect/plans ──────────────────────────────────────────────────────
  app.post('/connect/plans', async (request, reply) => {
    const body = request.body as {
      orgId: string;
      name: string;
      description?: string;
      amount: number;
      currency?: string;
      interval: 'day' | 'week' | 'month' | 'year';
      intervalCount?: number;
      trialDays?: number;
    };

    const rows = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, body.orgId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const stripeAccount = rows[0]!.stripeAccountId;

    const product = await stripe.products.create(
      { name: body.name, ...(body.description ? { description: body.description } : {}) },
      { stripeAccount },
    );

    const price = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: body.amount,
        currency: body.currency ?? 'aud',
        recurring: {
          interval: body.interval,
          interval_count: body.intervalCount ?? 1,
        },
      },
      { stripeAccount },
    );

    return reply.status(201).send({
      planId: price.id,
      productId: product.id,
      name: body.name,
      amount: body.amount,
      interval: body.interval,
    });
  });

  // ── GET /connect/plans/:orgId ────────────────────────────────────────────────
  app.get('/connect/plans/:orgId', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const rows = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const stripeAccount = rows[0]!.stripeAccountId;
    const prices = await stripe.prices.list(
      { active: true, limit: 100, expand: ['data.product'] },
      { stripeAccount },
    );

    return reply.send({
      plans: prices.data.map((p) => ({
        id: p.id,
        productId: typeof p.product === 'string' ? p.product : (p.product as Stripe.Product).id,
        name: typeof p.product === 'string' ? '' : (p.product as Stripe.Product).name,
        amount: p.unit_amount,
        currency: p.currency,
        interval: p.recurring?.interval,
        intervalCount: p.recurring?.interval_count,
        active: p.active,
      })),
    });
  });

  // ── POST /connect/refund ─────────────────────────────────────────────────────
  app.post('/connect/refund', async (request, reply) => {
    const { orgId, chargeId, amount, reason } = request.body as {
      orgId: string;
      chargeId: string;
      amount?: number;
      reason?: string;
    };

    const rows = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const stripeAccount = rows[0]!.stripeAccountId;

    const refund = await stripe.refunds.create(
      {
        charge: chargeId,
        ...(amount ? { amount } : {}),
        ...(reason ? { reason: reason as Stripe.RefundCreateParams.Reason } : {}),
      },
      { stripeAccount },
    );

    return reply.send({ refundId: refund.id, status: refund.status, amount: refund.amount });
  });

  // ── POST /connect/portal-session ─────────────────────────────────────────────
  app.post('/connect/portal-session', async (request, reply) => {
    const { orgId, stripeCustomerId, returnUrl } = request.body as {
      orgId: string;
      stripeCustomerId: string;
      returnUrl?: string;
    };

    const rows = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const stripeAccount = rows[0]!.stripeAccountId;

    const session = await stripe.billingPortal.sessions.create(
      {
        customer: stripeCustomerId,
        return_url: returnUrl ?? 'https://app.elevatedpos.com.au/dashboard',
      },
      { stripeAccount },
    );

    return reply.send({ url: session.url });
  });

  // ── GET /connect/subscriptions/customer/:stripeCustomerId ────────────────────
  app.get('/connect/subscriptions/customer/:stripeCustomerId', async (request, reply) => {
    const { stripeCustomerId } = request.params as { stripeCustomerId: string };
    const { orgId } = request.query as { orgId: string };

    if (!orgId) return reply.status(400).send({ error: 'orgId query param is required' });

    const rows = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const stripeAccount = rows[0]!.stripeAccountId;

    const [subs, invs] = await Promise.all([
      stripe.subscriptions.list(
        { customer: stripeCustomerId, status: 'all', limit: 20, expand: ['data.default_payment_method'] },
        { stripeAccount },
      ),
      stripe.invoices.list(
        { customer: stripeCustomerId, limit: 20 },
        { stripeAccount },
      ),
    ]);

    return reply.send({ subscriptions: subs.data, invoices: invs.data });
  });

  // ── POST /connect/setup-intent ───────────────────────────────────────────────
  app.post('/connect/setup-intent', async (request, reply) => {
    const { orgId, stripeCustomerId } = request.body as {
      orgId: string;
      stripeCustomerId: string;
    };

    const rows = await db.select().from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.orgId, orgId)).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Connect account not found' });

    const stripeAccount = rows[0]!.stripeAccountId;

    const setupIntent = await stripe.setupIntents.create(
      { customer: stripeCustomerId, payment_method_types: ['card'] },
      { stripeAccount },
    );

    return reply.send({ clientSecret: setupIntent.client_secret });
  });

  // ── GET /connect/customer-lookup ─────────────────────────────────────────────
  // ?stripeAccountId=acct_xxx&email=customer@email.com
  app.get('/connect/customer-lookup', async (request, reply) => {
    const { stripeAccountId, email } = request.query as { stripeAccountId: string; email: string };
    if (!stripeAccountId || !email) return reply.status(400).send({ error: 'stripeAccountId and email required' });

    const customers = await stripe.customers.list({ email, limit: 1 }, { stripeAccount: stripeAccountId });
    if (customers.data.length === 0) return reply.status(404).send({ error: 'Customer not found' });

    return reply.send({ stripeCustomerId: customers.data[0]!.id });
  });

  // ── POST /connect/invoices/:invoiceId/send-email ──────────────────────────────
  // Sends a branded ElevatedPOS invoice email to the customer via the
  // notifications service. Requires a valid JWT (orgId extracted from token).
  app.post('/connect/invoices/:invoiceId/send-email', {
    preHandler: app.authenticate,
  }, async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const { orgId } = request.user as { orgId: string };

    try {
      // Resolve Stripe connected account for this org
      const accountRows = await db.select().from(stripeConnectAccounts)
        .where(eq(stripeConnectAccounts.orgId, orgId)).limit(1);
      if (accountRows.length === 0) {
        return reply.status(404).send({ error: 'Connect account not found for this org' });
      }
      const { stripeAccountId, businessName } = accountRows[0]!;
      const businessLabel = businessName ?? 'Your Business';

      // Fetch invoice from Stripe connected account
      const invoice = await stripe.invoices.retrieve(invoiceId, {}, { stripeAccount: stripeAccountId });

      // Resolve customer email
      let customerEmail = invoice.customer_email ?? null;
      if (!customerEmail && invoice.customer) {
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : (invoice.customer as Stripe.Customer).id;
        const customer = await stripe.customers.retrieve(customerId, {}, { stripeAccount: stripeAccountId });
        if (!customer.deleted && (customer as Stripe.Customer).email) {
          customerEmail = (customer as Stripe.Customer).email ?? null;
        }
      }
      if (!customerEmail) {
        return reply.status(422).send({ error: 'No customer email found on this invoice' });
      }

      // Invoice details
      const invoiceNumber = invoice.number ?? invoiceId;
      const amountDue = invoice.amount_due;
      const currency = (invoice.currency ?? 'aud').toUpperCase();
      const dueDateTs = invoice.due_date;
      const dueDateLabel = dueDateTs
        ? new Date(dueDateTs * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'On receipt';
      const formattedAmount = (amountDue / 100).toFixed(2);
      const payUrl = `https://pay.elevatedpos.com.au/invoice/${invoiceId}`;

      const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f0f0f2;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .shell{max-width:620px;margin:40px auto 60px;padding:0 16px}
  .card{background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .header{background:#09090b;padding:32px 40px;text-align:center}
  .logo-ring{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#ffffff;border-radius:14px}
  .logo-ring span{font-size:30px;font-weight:900;color:#09090b;font-family:Georgia,serif}
  .brand-name{color:#ffffff;font-size:16px;font-weight:600;letter-spacing:.6px;margin-top:10px;opacity:.85}
  .body{padding:40px 40px 32px}
  h1{color:#09090b;font-size:22px;font-weight:700;line-height:1.3;margin-bottom:12px}
  p{color:#52525b;font-size:15px;line-height:1.75;margin-bottom:16px}
  strong{color:#18181b}
  .info-box{background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin:20px 0}
  .info-box p{margin-bottom:6px;font-size:14px}
  .info-box p:last-child{margin-bottom:0}
  .btn-wrap{text-align:center;margin:28px 0 24px}
  .btn{display:inline-block;background:#09090b;color:#ffffff!important;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none}
  .divider{border:none;border-top:1px solid #f4f4f5;margin:24px 0}
  .small{font-size:13px;color:#a1a1aa;line-height:1.6}
  .small a{color:#71717a;text-decoration:underline;word-break:break-all}
  .footer{padding:20px 40px 28px;text-align:center;background:#fafafa;border-top:1px solid #f4f4f5}
  .footer p{font-size:12px;color:#a1a1aa;line-height:1.8;margin:0}
  .footer a{color:#71717a;text-decoration:none}
</style>
</head>
<body>
<div class="shell">
  <div class="card">
    <div class="header">
      <div class="logo-ring"><span>E</span></div>
      <div class="brand-name">ElevatedPOS</div>
    </div>
    <div class="body">
      <h1>Invoice from ${businessLabel}</h1>
      <p>You have a new invoice from <strong>${businessLabel}</strong>. Please review the details below and pay by the due date.</p>
      <div class="btn-wrap">
        <a href="${payUrl}" class="btn">Pay Invoice &rarr;</a>
      </div>
      <div class="info-box">
        <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
        <p><strong>Amount:</strong> ${currency} $${formattedAmount}</p>
        <p><strong>Due Date:</strong> ${dueDateLabel}</p>
      </div>
      <hr class="divider">
      <p class="small">Button not working? Copy and paste this URL into your browser:<br><a href="${payUrl}">${payUrl}</a></p>
    </div>
    <div class="footer">
      <p><strong style="color:#71717a">ElevatedPOS</strong> &mdash; Point of Sale &amp; Business Management</p>
      <p style="margin-top:4px">Questions? <a href="mailto:support@elevatedpos.com.au">support@elevatedpos.com.au</a></p>
    </div>
  </div>
</div>
</body>
</html>`;

      const subject = `Invoice ${invoiceNumber} from ${businessLabel} — AUD $${formattedAmount}`;

      // Sign a short-lived internal token to authenticate with the notifications service
      const internalToken = app.jwt.sign(
        { sub: orgId, orgId, role: 'system' },
        { expiresIn: '5m' },
      );

      const notifRes = await fetch(`${NOTIFICATIONS_API_URL}/api/v1/notifications/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({ to: customerEmail, subject, htmlBody, orgId }),
      });

      if (!notifRes.ok) {
        const errText = await notifRes.text().catch(() => 'unknown error');
        app.log.error({ status: notifRes.status, body: errText }, '[invoices/send-email] notifications service error');
        return reply.status(502).send({ error: 'Failed to send email via notifications service' });
      }

      return reply.send({ sent: true, to: customerEmail });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err: message }, '[invoices/send-email] unexpected error');
      return reply.status(500).send({ error: 'Internal server error', detail: message });
    }
  });
}
