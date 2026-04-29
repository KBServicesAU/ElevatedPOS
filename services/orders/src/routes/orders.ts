import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, inArray, sql, gte, lte } from 'drizzle-orm';
import { db, schema } from '../db';
import { generateOrderNumber, generateRefundNumber } from '../lib/orderNumber';
import { publishTypedEvent } from '../lib/kafka';
import { broadcastToKDS } from '../index';
import { createEvent, EVENT_TOPICS } from '@nexus/event-schemas';

const lineSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  name: z.string(),
  // `sku` is required in the DB but the mobile POS's cart-item shape currently
  // doesn't carry one. Accept missing/empty here and default to '' in the
  // handler so existing mobile builds keep working. Real SKU plumbing is a
  // mobile-side fix tracked separately.
  sku: z.string().optional().default(''),
  // v2.7.74 — bounded numeric ranges. quantity ≤ 10_000 catches
  // overflow / fat-finger entries; unitPrice ≤ $100k stops nonsense
  // single-line totals (anything legitimately above that is being sold
  // through the layby/quote flow, not direct POS). taxRate is capped
  // at 100 — anything higher was a unit confusion (decimal vs %).
  quantity: z.number().positive().max(10_000),
  unitPrice: z.number().min(0).max(100_000),
  costPrice: z.number().min(0).max(100_000).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  discountAmount: z.number().min(0).max(100_000).default(0),
  modifiers: z.array(z.object({ groupId: z.string(), optionId: z.string(), name: z.string(), priceAdjustment: z.number() })).default([]),
  seatNumber: z.number().int().optional(),
  course: z.string().optional(),
  notes: z.string().optional(),
});

const createOrderSchema = z.object({
  locationId: z.string().uuid(),
  // `registerId` is required in the DB but devices paired without an explicit
  // register (single-device merchants, brand-new pairs) don't have one. Accept
  // missing here and the handler falls back to `locationId` as a deterministic
  // per-location implicit register UUID. Same shape the existing dashboards
  // already group by, so reports continue to work.
  registerId: z.string().uuid().optional(),
  channel: z.enum(['pos', 'online', 'kiosk', 'qr', 'marketplace', 'delivery', 'phone']).default('pos'),
  orderType: z.enum(['retail', 'dine_in', 'takeaway', 'delivery', 'pickup', 'layby', 'quote']).default('retail'),
  customerId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  covers: z.number().int().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

const refundSchema = z.object({
  reason: z.string().min(1),
  refundMethod: z.enum(['original', 'store_credit', 'cash', 'exchange']),
  lines: z.array(z.object({
    orderLineId: z.string().uuid(),
    quantity: z.number().positive(),
    amount: z.number().positive(),
  })).min(1),
});

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/orders
  //
  // v2.7.51-C2 — denormalises `customerName` onto each order row by
  // LEFT JOINing the `customers` table (orders + customers share the
  // same Postgres database; orders.customer_id → customers.id).
  // Without this, the mobile Orders list could never render the
  // customer name in a row because the list endpoint only returned
  // `customerId`. We also accept `from`/`to` ISO timestamps so the
  // client can scope the query server-side instead of relying on a
  // 50-row client-side filter (which previously hid sales the moment
  // a busy register filled the list with newer orders).
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      status: z.string().optional(),
      locationId: z.string().uuid().optional(),
      customerId: z.string().uuid().optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    });
    const query = querySchema.parse(request.query);

    const whereClause = and(
      eq(schema.orders.orgId, orgId),
      query.locationId ? eq(schema.orders.locationId, query.locationId) : undefined,
      query.customerId ? eq(schema.orders.customerId, query.customerId) : undefined,
      query.status ? eq(schema.orders.status, query.status as any) : undefined,
      query.from ? gte(schema.orders.createdAt, new Date(query.from)) : undefined,
      query.to ? lte(schema.orders.createdAt, new Date(query.to)) : undefined,
    );

    const [orders, [countResult]] = await Promise.all([
      db.query.orders.findMany({
        where: whereClause,
        limit: query.limit,
        offset: query.offset,
        orderBy: [desc(schema.orders.createdAt)],
        with: { lines: true },
      }),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.orders)
        .where(whereClause),
    ]);

    // v2.7.51-C2 — pull customer first/last name for every order in the
    // page in a single `WHERE id = ANY(...)` query. Cross-service raw
    // SQL because `customers` lives in the customers service schema
    // (same DB instance — see infrastructure/docker/docker-compose.dev.yml
    // DATABASE_URL: both services point at elevatedpos_dev).
    //
    // Mobile Orders list expects `customerName` as a top-level field on
    // every row in the response (see apps/mobile/app/(pos)/orders.tsx
    // `interface Order` and the row renderers). Before this change the
    // list rendered "$XX.XX" with no name even when a customer had been
    // attached at sale time — merchants couldn't tell which order was
    // whose without tapping into detail.
    const customerIds = Array.from(new Set(
      orders.map((o) => o.customerId).filter((id): id is string => !!id),
    ));
    const customerNameById = new Map<string, string>();
    if (customerIds.length > 0) {
      try {
        const rows = await db.execute(sql`
          SELECT id, first_name, last_name
          FROM customers
          WHERE id = ANY(${customerIds}::uuid[])
        `);
        // `db.execute` returns the raw pg result; rows is an array-ish.
        const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
        for (const r of list as { id: string; first_name: string; last_name: string }[]) {
          const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
          if (r.id && name) customerNameById.set(r.id, name);
        }
      } catch (err) {
        // Non-fatal. The list still renders, just without names for
        // orders that have a customer attached.
        console.error('[orders] GET / customer name lookup failed', err);
      }
    }

    const enriched = orders.map((o) => ({
      ...o,
      customerName: o.customerId ? (customerNameById.get(o.customerId) ?? null) : null,
    }));

    const totalCount = countResult?.count ?? 0;
    return reply.status(200).send({
      data: enriched,
      meta: {
        totalCount,
        hasMore: query.offset + orders.length < totalCount,
        limit: query.limit,
        offset: query.offset,
      },
    });
  });

  // GET /api/v1/orders/eod-summary
  // Rolls up completed + refunded orders for a location between `from` and
  // `to` (defaults to today 00:00 local → now). Mobile close-till and the
  // dashboard both call this to show the cash/card split and refund totals.
  //
  // Declared BEFORE `/:id` so it isn't swallowed by the catch-all param.
  app.get('/eod-summary', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const querySchema = z.object({
      locationId: z.string().uuid(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const { locationId } = parsed.data;

    // Default range = today (local midnight → now).
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const from = parsed.data.from ? new Date(parsed.data.from) : midnight;
    const to = parsed.data.to ? new Date(parsed.data.to) : now;

    const rangeFilter = and(
      eq(schema.orders.orgId, orgId),
      eq(schema.orders.locationId, locationId),
      inArray(schema.orders.status, ['completed', 'refunded', 'partially_refunded'] as const),
      gte(schema.orders.completedAt, from),
      lte(schema.orders.completedAt, to),
    );

    // Group by payment method. null is bucketed into 'other'. `total` is a
    // numeric(12,4) string in postgres — cast to text and let JS parseFloat
    // it at the end. Status returned too so we can derive refund counts
    // without a second query.
    const grouped = await db.select({
      paymentMethod: schema.orders.paymentMethod,
      status: schema.orders.status,
      orderCount: sql<number>`count(*)::int`,
      totalSum: sql<string>`COALESCE(SUM(${schema.orders.total})::text, '0')`,
      paidSum: sql<string>`COALESCE(SUM(${schema.orders.paidTotal})::text, '0')`,
    }).from(schema.orders)
      .where(rangeFilter)
      .groupBy(schema.orders.paymentMethod, schema.orders.status);

    // v2.7.51-C2 — log the raw bucketing query result so the next regression
    // ("Close Till shows $0 in cash + card") surfaces in pod logs without a
    // database dump. Pre-bucketing rows give us the actual paymentMethod
    // strings as persisted (lowercase, snake_case, capitalised, etc).
    console.log('[orders] /eod-summary grouped', {
      orgId,
      locationId,
      from: from.toISOString(),
      to: to.toISOString(),
      rowCount: grouped.length,
      rows: grouped.map((r) => ({
        paymentMethod: r.paymentMethod,
        status: r.status,
        count: r.orderCount,
        totalSum: r.totalSum,
      })),
    });

    // Aggregate into the response shape the merchant UI expects.
    let transactionCount = 0;
    let totalSales = 0;
    let cashTransactionCount = 0;
    let cardTransactionCount = 0;
    let refundCount = 0;
    let refunds = 0;
    const payments = { cash: 0, card: 0, other: 0, split: 0 };

    for (const row of grouped) {
      const count = Number(row.orderCount) || 0;
      const total = parseFloat(row.totalSum) || 0;
      const paid = parseFloat(row.paidSum) || 0;
      // v2.7.51-C2 — case-insensitive bucketing. Historically the POS sent
      // 'Cash' / 'Card' / 'Split' (Title-cased) but recent merges (Stripe
      // Terminal, gift_card, qr) post lowercase / snake_case. Without this
      // normalisation, rows with `paymentMethod = 'cash'` fell into the
      // `else` branch and appeared as `payments.other`, leaving Close Till
      // showing $0 in cash and card buckets even though sales had landed.
      const method = (row.paymentMethod ?? '').toString().toLowerCase();

      if (row.status === 'refunded' || row.status === 'partially_refunded') {
        refundCount += count;
        // Use paid_total as a proxy for the refunded dollar value. When the
        // dedicated `refunds` table is wired into this endpoint we'll switch
        // to SUM(refunds.total_amount) instead.
        // TODO(v2.7.25): join `refunds` table for a per-tender refund split.
        refunds += paid;
      }

      transactionCount += count;
      totalSales += total;

      if (method === 'cash') {
        cashTransactionCount += count;
        payments.cash += total;
      } else if (method === 'card' || method === 'tyro' || method === 'stripe' || method === 'anz' || method === 'eftpos') {
        // v2.7.51-C2 — Tyro / Stripe / ANZ / generic 'card' all fall into
        // the card bucket so the merchant doesn't see "$0 card sales" when
        // every payment went through a terminal. The orders row stores
        // whatever the POS sent in `paymentMethod`; we normalise here.
        cardTransactionCount += count;
        payments.card += total;
      } else if (method === 'split') {
        // Split payments are not currently broken out into separate tender
        // buckets on the orders row — keep them as 'split' for now.
        payments.split += total;
      } else {
        payments.other += total;
      }
    }

    // Round everything to cents before returning so the merchant UI can
    // display without accumulating float noise.
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const responseBody = {
      locationId,
      from: from.toISOString(),
      to: to.toISOString(),
      transactionCount,
      totalSales: r2(totalSales),
      refundCount,
      refunds: r2(refunds),
      cashTransactionCount,
      cardTransactionCount,
      payments: {
        cash: r2(payments.cash),
        card: r2(payments.card),
        other: r2(payments.other),
        split: r2(payments.split),
      },
      // TODO(v2.7.25): count cash-tender refunds separately once the
      // refunds table carries a tender column.
      cashRefunds: 0,
    };
    // v2.7.51-C2 — log the rolled-up response so support can trace why a
    // close-till screen is showing $0 in a particular bucket.
    console.log('[orders] /eod-summary out', responseBody);
    return reply.status(200).send({ data: responseBody });
  });

  // GET /api/v1/orders/:id
  //
  // v2.7.51-C2 — denormalises `customerName` from the customers table so
  // the order detail screen + Resume button can show the customer name
  // without an extra round-trip to the customers service.
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)),
      with: { lines: true, refunds: true },
    });

    if (!order) return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });

    let customerName: string | null = null;
    if (order.customerId) {
      try {
        const rows = await db.execute(sql`
          SELECT first_name, last_name
          FROM customers
          WHERE id = ${order.customerId}::uuid
          LIMIT 1
        `);
        const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
        const row = list[0] as { first_name?: string; last_name?: string } | undefined;
        if (row) {
          const n = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
          customerName = n || null;
        }
      } catch (err) {
        console.error('[orders] GET /:id customer name lookup failed', err);
      }
    }

    return reply.status(200).send({ data: { ...order, customerName } });
  });

  // GET /api/v1/orders/:id/items
  // v2.7.34 — dashboard line-items panel calls this dedicated endpoint
  // instead of unpacking the full order payload. Shape matches the
  // `OrderLineItem` type in apps/web-backoffice/lib/api.ts so the UI
  // can render columns (Item / Qty / Unit Price / Subtotal) without
  // extra mapping. Before v2.7.34 this endpoint did not exist, so the
  // dashboard saw 404 and rendered "Line items unavailable".
  app.get('/:id/items', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)),
      columns: { id: true },
    });
    if (!order) return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });

    const lines = await db.query.orderLines.findMany({
      where: eq(schema.orderLines.orderId, id),
    });

    const items = lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.name,
      sku: l.sku ?? undefined,
      qty: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      discountTotal: Number(l.discountAmount ?? 0),
      taxTotal: Number(l.taxAmount ?? 0),
      lineTotal: Number(l.lineTotal),
    }));

    return reply.status(200).send({ data: items });
  });

  // POST /api/v1/orders/:id/send-receipt
  // v2.7.34 — dashboard order-detail → Email Receipt button calls this.
  // Looks up the order, renders the standard `receipt` email template via
  // the notifications service, and returns success/failure so the UI can
  // toast.
  //
  // v2.7.51 — same class of bug as v2.7.42 (orderConsumer silently
  // succeeded but never called sendEmail). The /send-receipt path was
  // returning a 502 to the dashboard with no diagnostic — the upstream
  // notifications response body was being parsed as JSON only. We now
  // capture the raw body via .text() (which handles both JSON & non-JSON
  // upstream errors) and console.error the full upstream response so the
  // next regression is diagnosable from the orders service logs rather
  // than a vague toast in the UI.
  //
  // We also fall back to signing an internal token when the caller's
  // JWT is missing/expired. Previously the dashboard could surface a
  // confusing 401 here when the session cookie was about to expire.
  app.post('/:id/send-receipt', async (request, reply) => {
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

    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)),
      with: { lines: true },
    });
    if (!order) return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });

    // Build the receipt payload shape the notifications service expects.
    const total = Number(order.total);
    const items = (order.lines ?? []).map((l) => ({
      name: l.name,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
    }));

    const notificationsUrl = process.env['NOTIFICATIONS_SERVICE_URL'] ?? 'http://notifications:4009';
    // Prefer forwarding the caller's JWT so the notifications service
    // accepts the request under the same auth context. Both services
    // share JWT_SECRET so the token validates on either side. If the
    // caller's token is missing for any reason (e.g. internal call from
    // a worker), sign a short-lived internal token instead — orgId is
    // still bound to the order, not the request body.
    let authHeader = request.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      try {
        const internalToken = (app as unknown as { jwt: { sign: (payload: object, opts?: object) => string } }).jwt.sign(
          { sub: orgId, orgId, role: 'system' },
          { expiresIn: '5m' },
        );
        authHeader = `Bearer ${internalToken}`;
      } catch (err) {
        console.error('[orders/send-receipt] Failed to mint internal token', { err: err instanceof Error ? err.message : err });
        return reply.status(401).send({ type: 'about:blank', title: 'Unauthorized', status: 401 });
      }
    }

    const payload = {
      to: body.data.email,
      subject: `Receipt — Order ${order.orderNumber}`,
      template: 'receipt' as const,
      orgId,
      data: {
        orderId: order.orderNumber,
        items,
        total,
        currency: 'AUD',
        date: (order.completedAt ?? order.createdAt).toISOString(),
      },
    };

    try {
      const res = await fetch(`${notificationsUrl}/api/v1/notifications/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Capture the raw body — works for both JSON error envelopes and
        // bare HTML/text responses from upstream proxies. The previous
        // implementation called .json() which threw on non-JSON bodies
        // and obscured the real upstream error.
        const rawBody = await res.text().catch(() => '<unreadable>');
        let detail = `Notifications service returned ${res.status}`;
        try {
          const parsed = JSON.parse(rawBody) as { detail?: string; title?: string; error?: string };
          detail = parsed.detail ?? parsed.title ?? parsed.error ?? detail;
        } catch {
          // non-JSON body — keep raw text in the log
        }
        console.error('[orders/send-receipt] Notifications upstream error', {
          orderId: order.id,
          orgId,
          to: body.data.email,
          upstreamStatus: res.status,
          upstreamBody: rawBody.slice(0, 500),
        });
        return reply.status(502).send({
          type: 'about:blank',
          title: 'Email Send Failed',
          status: 502,
          detail,
        });
      }

      return reply.status(200).send({ data: { email: body.data.email, orderId: order.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[orders/send-receipt] Notifications fetch threw', {
        orderId: order.id,
        orgId,
        to: body.data.email,
        notificationsUrl,
        error: message,
      });
      return reply.status(502).send({
        type: 'about:blank',
        title: 'Email Send Failed',
        status: 502,
        detail: message,
      });
    }
  });

  // POST /api/v1/orders
  app.post('/', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const body = createOrderSchema.safeParse(request.body);
    if (!body.success) {
      // v2.7.44 — log validation issues so the next wire-shape regression
      // is diagnosable from server logs rather than a silent 422.
      console.error('[orders] POST /orders validation failed', { issues: body.error.issues, bodyKeys: request.body && typeof request.body === 'object' ? Object.keys(request.body as Record<string, unknown>) : null });
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    // v2.7.77 — idempotency. Mobile POS / kiosks send an
    // `Idempotency-Key` header (a per-attempt UUID) so a retry of a
    // request that succeeded server-side but never returned to the
    // client doesn't create a duplicate order. We look up an existing
    // order with the same (orgId, key) and if found, return that one.
    // Keys are accepted from 16-100 chars to keep them sane (UUIDs
    // are 36 chars, so 100 leaves headroom).
    const idemHeader = request.headers['idempotency-key'];
    const idempotencyKey = typeof idemHeader === 'string' && idemHeader.length >= 16 && idemHeader.length <= 100
      ? idemHeader
      : null;
    if (idempotencyKey) {
      const existing = await db.query.orders.findFirst({
        where: and(
          eq(schema.orders.orgId, orgId),
          eq(schema.orders.idempotencyKey, idempotencyKey),
        ),
        with: { lines: true },
      });
      if (existing) {
        // Same response shape as a fresh creation. The client treats
        // 200 (vs 201) as the "already-existed" signal but keeps
        // walking forward into the /complete call.
        return reply.status(200).send(existing);
      }
    }

    const { lines, ...orderData } = body.data;

    // v2.7.74 — defense-in-depth: refuse any line where the discount
    // exceeds the line subtotal. The Zod schema only enforces
    // `discountAmount >= 0`, which means a malicious or buggy client
    // could send unitPrice=10, quantity=1, discountAmount=15 and the
    // server would happily record a negative line total — turning the
    // sale into a credit owed *to* the customer. We now reject the
    // request before any DB writes.
    for (const l of lines) {
      const lineSubtotalCents =
        Math.round(parseFloat(String(l.unitPrice)) * 100) * l.quantity;
      const discountCentsForLine = Math.round(
        parseFloat(String(l.discountAmount ?? 0)) * 100,
      );
      if (discountCentsForLine > lineSubtotalCents) {
        return reply.status(422).send({
          type: 'https://elevatedpos.com/errors/discount-exceeds-line',
          title: 'Discount exceeds line subtotal',
          status: 422,
          detail: `Line "${l.name}" has discount $${(discountCentsForLine / 100).toFixed(2)} but the subtotal is only $${(lineSubtotalCents / 100).toFixed(2)}.`,
        });
      }
    }

    // Compute totals in integer cents to avoid floating-point rounding errors.
    //
    // v2.7.33 — AU retail pricing is GST-INCLUSIVE. The `unitPrice` sent by
    // the POS (and entered by the merchant in the dashboard catalog) is
    // already tax-inclusive — it's what the customer sees on the shelf and
    // what they pay at the till. Previous code treated `unitPrice` as
    // ex-GST and ADDED taxRate% on top, turning a $3.50 item into $3.85
    // with "$0.35 GST" — wrong on every axis.
    //
    // Correct formula: given an inc-GST price and the rate (10 for 10%):
    //   tax      = price × rate / (100 + rate)      (GST extraction)
    //   exGst    = price − tax
    //   lineTot  = price                            (the advertised price)
    //
    // So for $3.50 inc-GST at 10%: tax=$0.32, exGst=$3.18, total=$3.50 ✓
    const discountTotalCents = lines.reduce((sum, l) => {
      return sum + Math.round(parseFloat(String(l.discountAmount ?? 0)) * 100);
    }, 0);

    // Per-line breakdown so the same numbers go into orderLines below.
    const lineBreakdown = lines.map((l) => {
      const unitCents = Math.round(parseFloat(String(l.unitPrice)) * 100);
      const discountCents = Math.round(parseFloat(String(l.discountAmount ?? 0)) * 100);
      // Inc-GST subtotal for this line (what the customer pays for it).
      const lineIncCents = l.quantity * unitCents - discountCents;
      const rate = Number(l.taxRate) || 0;
      const taxCents = rate > 0
        ? Math.round((lineIncCents * rate) / (100 + rate))
        : 0;
      const exGstCents = lineIncCents - taxCents;
      return { unitCents, discountCents, lineIncCents, taxCents, exGstCents };
    });

    const subtotalCents = lineBreakdown.reduce((s, b) => s + b.exGstCents, 0);
    const taxTotalCents = lineBreakdown.reduce((s, b) => s + b.taxCents, 0);
    const totalCents    = lineBreakdown.reduce((s, b) => s + b.lineIncCents, 0);

    const subtotal      = (subtotalCents      / 100).toFixed(2);
    const discountTotal = (discountTotalCents / 100).toFixed(2);
    const taxTotal      = (taxTotalCents      / 100).toFixed(2);
    const total         = (totalCents         / 100).toFixed(2);

    let orderRows;
    try {
      orderRows = await db.insert(schema.orders).values({
        orgId,
        employeeId,
        locationId: orderData.locationId,
        // Fall back to locationId as a deterministic per-location implicit
        // register UUID. Devices paired without an explicit register still
        // produce orders, and reports group consistently per location.
        registerId: orderData.registerId ?? orderData.locationId,
        orderNumber: generateOrderNumber(),
        channel: orderData.channel,
        orderType: orderData.orderType,
        ...(orderData.customerId !== undefined && { customerId: orderData.customerId }),
        ...(orderData.tableId !== undefined && { tableId: orderData.tableId }),
        ...(orderData.covers !== undefined && { covers: orderData.covers }),
        ...(orderData.notes !== undefined && { notes: orderData.notes }),
        subtotal: subtotal,
        discountTotal: discountTotal,
        taxTotal: taxTotal,
        total: total,
        // v2.7.77 — persist the client-supplied key so retries hit the
        // unique index lookup above instead of recomputing the order.
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }).returning();
    } catch (err: unknown) {
      // v2.7.77 — race recovery. Two simultaneous retries can both
      // pass the findFirst check above and both reach this insert,
      // with the second hitting the unique index. PG code 23505 =
      // unique_violation. Look up the row that won and return it.
      const isUniqueViolation =
        typeof err === 'object' && err !== null &&
        'code' in err && (err as { code?: unknown }).code === '23505';
      if (idempotencyKey && isUniqueViolation) {
        const winner = await db.query.orders.findFirst({
          where: and(
            eq(schema.orders.orgId, orgId),
            eq(schema.orders.idempotencyKey, idempotencyKey),
          ),
          with: { lines: true },
        });
        if (winner) return reply.status(200).send(winner);
      }
      throw err;
    }
    const order = orderRows[0]!;

    await db.insert(schema.orderLines).values(lines.map((l, idx) => {
      // v2.7.33 — re-use the same inc-GST breakdown computed for the order
      // totals so the numbers tie. `lineTotal` is what the customer pays
      // for this line (inc-GST). `taxAmount` is the GST extracted from
      // that price.
      const breakdown = lineBreakdown[idx]!;
      const taxAmount = (breakdown.taxCents    / 100).toFixed(2);
      const lineTotal = (breakdown.lineIncCents / 100).toFixed(2);
      return {
        orderId: order.id,
        productId: l.productId,
        ...(l.variantId !== undefined && { variantId: l.variantId }),
        name: l.name,
        sku: l.sku,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        costPrice: String(l.costPrice),
        taxRate: String(l.taxRate),
        taxAmount: taxAmount,
        discountAmount: String(l.discountAmount),
        lineTotal: lineTotal,
        modifiers: l.modifiers,
        ...(l.seatNumber !== undefined && { seatNumber: l.seatNumber }),
        ...(l.course !== undefined && { course: l.course }),
        ...(l.notes !== undefined && { notes: l.notes }),
      };
    }));

    const created = await db.query.orders.findFirst({
      where: eq(schema.orders.id, order.id),
      with: { lines: true },
    });

    // Publish typed event envelope — non-fatal if Kafka is unavailable
    if (created) {
      try {
        await publishTypedEvent(
          EVENT_TOPICS.ORDERS,
          createEvent(
            'order.created',
            orgId,
            {
              orderId: created.id,
              orderNumber: created.orderNumber,
              total: Number(created.total),
              customerId: created.customerId ?? undefined,
              lineCount: created.lines.length,
              channel: created.channel,
              // Items array consumed by inventory service to decrement stock
              items: created.lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId ?? undefined,
                quantity: Number(l.quantity),
              })),
            },
            { locationId: created.locationId },
          ),
        );
      } catch (err) {
        console.error('[orders] Failed to publish order.created event', err);
      }
    }

    // Broadcast to connected KDS clients for this location.
    //
    // v2.7.40 — message envelope MUST match the shape the KDS mobile app
    // listens for (`type: 'ticket_created'`, `ticket: {...}`). Earlier
    // releases emitted `type: 'new_order'` / `order: {...}` which the
    // KDS app silently dropped in its `ws.onmessage` switch — the POS
    // created orders, the WS delivered them, but nothing rendered.
    // See `apps/mobile/app/(kds)/index.tsx` connect() → KdsTicket shape.
    if (created) {
      broadcastToKDS(created.locationId, {
        type: 'ticket_created',
        ticket: {
          id: created.id,
          orderNumber: created.orderNumber,
          channel: created.channel,
          // v2.7.44 — broadcast orderType so the KDS app can show
          // "Dine In", "Takeaway" or "Delivery" on the ticket header.
          orderType: created.orderType,
          items: created.lines.map((l) => ({
            name: l.name,
            qty: Number(l.quantity),
            modifiers: (l.modifiers as { name: string }[]).map((m) => m.name),
            notes: l.notes ?? undefined,
            station: l.kdsDestination ?? undefined,
          })),
          createdAt: created.createdAt.toISOString(),
          status: 'pending' as const,
        },
      });
    }

    return reply.status(201).send({ data: created });
  });

  // PATCH /api/v1/orders/:id
  //
  // Partial-update an order. Supports internal notes + (future) channel /
  // customer rebinding. Scoped by JWT orgId — can't touch other orgs'
  // rows.
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({
      notes: z.string().max(4000).optional(),
    }).safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: body.error.message,
      });
    }

    const existing = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Order not found', status: 404 });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.notes !== undefined) updates['notes'] = body.data.notes;

    const rows = await db.update(schema.orders)
      .set(updates)
      .where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)))
      .returning();

    return reply.send({ data: rows[0]! });
  });

  // POST /api/v1/orders/:id/complete
  app.post('/:id/complete', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({
      paidTotal: z.number(),
      changeGiven: z.number().default(0),
      receiptChannel: z.string().optional(),
      // Optional receipt fields supplied by the POS (which has the customer
      // object and payment result in memory at checkout time)
      customerEmail: z.string().email().optional(),
      customerName: z.string().optional(),
      storeName: z.string().optional(),
      paymentMethod: z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) {
      // v2.7.44 — surface the validation detail so operators can diagnose
      // a wire-shape regression from logs alone (the silent 422 was the
      // exact failure mode that hid the v2.7.40/41 regression for days).
      console.error('[orders]', 'POST /:id/complete validation failed', { id, issues: body.error.issues, body: request.body });
      return reply.status(422).send({ type: 'about:blank', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    // v2.7.51-C2 — log the inbound /complete envelope so the next regression
    // (paidTotal coming through as 0, paymentMethod missing, etc.) surfaces
    // in pod logs alongside the [POS/complete] device-side breadcrumbs.
    console.log('[orders] /complete in', {
      id,
      paidTotal: body.data.paidTotal,
      paymentMethod: body.data.paymentMethod ?? null,
      changeGiven: body.data.changeGiven,
    });

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) {
      console.error('[orders] /complete 404 — order not found', { id, orgId });
      return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });
    }
    if (order.status !== 'open') {
      // v2.7.51-C2 — log the actual on-disk status so support can tell whether
      // the regression is a double-submit (status === 'completed' is fine, the
      // POS treats 409 as success) or a held / cancelled / refunded order
      // that should never have hit this endpoint.
      console.warn('[orders] /complete 409 — order not open', { id, status: order.status });
      return reply.status(409).send({ title: 'Order not open', status: 409 });
    }

    const completeRows = await db.update(schema.orders).set({
      status: 'completed',
      paidTotal: String(body.data.paidTotal),
      changeGiven: String(body.data.changeGiven),
      ...(body.data.receiptChannel !== undefined && { receiptChannel: body.data.receiptChannel }),
      // Persist the tender so the EOD summary can split sales into
      // Cash / Card / Other. Only set when the POS supplied it — leaving
      // the column untouched keeps legacy clients working.
      ...(body.data.paymentMethod !== undefined && { paymentMethod: body.data.paymentMethod }),
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId))).returning();
    const updated = completeRows[0]!;

    // Re-fetch with lines to build receipt payload
    const withLines = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)),
      with: { lines: true },
    });

    try {
      const completedAt = updated.completedAt?.toISOString() ?? new Date().toISOString();
      const total = Number(updated.total);
      const gst = parseFloat((total / 11).toFixed(2));
      const subtotal = parseFloat((total - gst).toFixed(2));

      await publishTypedEvent(
        EVENT_TOPICS.ORDERS,
        createEvent(
          'order.completed',
          orgId,
          {
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            total,
            paidTotal: body.data.paidTotal,
            completedAt,
            // v2.7.51 — enrich the event with channel/orderType/customer/
            // employee/discount/tax/createdAt so the reporting consumer can
            // populate sales_fact correctly. Without these fields the
            // consumer was falling back to defaults (channel='pos',
            // discountTotal=0, taxTotal=gst, etc.) which sometimes left
            // sales_fact under-counted.
            channel: updated.channel,
            orderType: updated.orderType,
            ...(updated.customerId && { customerId: updated.customerId }),
            ...(updated.employeeId && { employeeId: updated.employeeId }),
            discountTotal: Number(updated.discountTotal ?? 0),
            taxTotal: Number(updated.taxTotal ?? gst),
            createdAt: updated.createdAt?.toISOString() ?? completedAt,
            // Optional receipt enrichment — only present when the POS includes them
            ...(body.data.customerEmail !== undefined && { customerEmail: body.data.customerEmail }),
            ...(body.data.customerName !== undefined && { customerName: body.data.customerName }),
            ...(body.data.storeName !== undefined && { storeName: body.data.storeName }),
            ...(body.data.paymentMethod !== undefined && { paymentMethod: body.data.paymentMethod }),
            subtotal,
            gst,
            // v2.7.41 — carry `productId` + `costPrice` through so the
            // reporting consumer can populate `order_lines_fact` (powers
            // the "Top Products" dashboard card and margin reports).
            // categoryId isn't on the orders DB — a future enrichment
            // pass can add it by joining to catalog; the schema accepts
            // it so it can be filled in later without another bump.
            items: (withLines?.lines ?? []).map((l) => ({
              name: l.name,
              qty: Number(l.quantity),
              price: Number(l.unitPrice),
              productId: l.productId,
              costPrice: Number(l.costPrice),
            })),
          },
          { locationId: updated.locationId },
        ),
      );
    } catch (err) {
      console.error('[orders] Failed to publish order.completed event', err);
    }

    // v2.7.40 — tell any connected KDS the ticket has been closed so it
    // doesn't linger on screen for the remainder of its lifetime. Safe
    // no-op when no KDS client is connected for this location.
    //
    // v2.7.44 — wrapped in try/catch so a stray WS misbehaviour cannot
    // take down /complete after the DB transition has already happened.
    try {
      broadcastToKDS(updated.locationId, {
        type: 'ticket_bumped',
        ticketId: updated.id,
        locationId: updated.locationId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[orders] /complete: broadcastToKDS threw (ignored)', err);
    }

    // v2.7.51-C2 — surface the persisted `paidTotal` so support can verify
    // the row really did get the payment recorded (vs. the tender field
    // being silently lost between request body and DB write — that was
    // exactly the symptom of issue #3 from the v2.7.51 regression report).
    console.log('[orders] /complete OK', {
      id,
      status: 'completed',
      paymentMethod: body.data.paymentMethod ?? null,
      paidTotalPersisted: updated.paidTotal,
      paidTotalRequested: body.data.paidTotal,
    });
    return reply.status(200).send({ data: updated });
  });

  // POST /api/v1/orders/:id/hold
  app.post('/:id/hold', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });

    if (order.status !== 'open') {
      return reply.code(422).send({
        type: 'about:blank', title: 'Invalid Status Transition', status: 422,
        detail: `Cannot hold an order with status '${order.status}'. Only open orders can be held.`,
      });
    }

    const [heldOrder] = await db.update(schema.orders).set({ status: 'held', updatedAt: new Date() }).where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId))).returning();
    return reply.status(200).send({ data: { id: heldOrder?.id ?? id, status: 'held' } });
  });

  // POST /api/v1/orders/:id/cancel
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });

    if (!['open', 'held'].includes(order.status)) {
      return reply.code(422).send({
        type: 'about:blank', title: 'Invalid Status Transition', status: 422,
        detail: `Cannot cancel an order with status '${order.status}'.`,
      });
    }

    await db.update(schema.orders).set({ status: 'cancelled', cancellationReason: body.data.reason, cancelledAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)));
    return reply.status(200).send({ data: { status: 'cancelled' } });
  });

  // POST /api/v1/orders/:id/refund
  app.post('/:id/refund', async (request, reply) => {
    const { orgId, sub: approvedByEmployeeId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };
    const body = refundSchema.safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });

    const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)) });
    if (!order) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (!['completed', 'partially_refunded'].includes(order.status)) return reply.status(409).send({ title: 'Cannot refund this order', status: 409, detail: `Order status is ${order.status}` });

    const newRefundTotal = body.data.lines.reduce((sum, l) => sum + l.amount, 0);

    let refund: typeof schema.refunds.$inferSelect;
    try {
      refund = await db.transaction(async (trx) => {
        // Lock the order row to prevent concurrent refunds (TOCTOU protection)
        await trx.execute(sql`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`);

        // Re-fetch prior refund sum inside the transaction (after the lock)
        const previousRefunds = await trx.select({ total: sql<string>`SUM(total_amount)` })
          .from(schema.refunds)
          .where(eq(schema.refunds.originalOrderId, id));
        const alreadyRefunded = parseFloat(previousRefunds[0]?.total ?? '0');

        if (alreadyRefunded + newRefundTotal > parseFloat(order.total)) {
          throw Object.assign(new Error('Refund amount exceeds remaining refundable balance'), {
            statusCode: 422,
            alreadyRefunded,
            orderTotal: order.total,
          });
        }

        const refundRows = await trx.insert(schema.refunds).values({
          orgId,
          originalOrderId: id,
          refundNumber: generateRefundNumber(),
          reason: body.data.reason,
          lines: body.data.lines,
          refundMethod: body.data.refundMethod,
          totalAmount: String(newRefundTotal.toFixed(4)),
          approvedByEmployeeId,
        }).returning();

        const newTotalRefunded = alreadyRefunded + newRefundTotal;
        const finalStatus = newTotalRefunded >= parseFloat(order.total) ? 'refunded' : 'partially_refunded';

        await trx.update(schema.orders).set({ status: finalStatus, updatedAt: new Date() }).where(eq(schema.orders.id, id));

        return refundRows[0]!;
      });
    } catch (err: any) {
      if (err?.statusCode === 422) {
        return reply.status(422).send({
          title: 'Refund amount exceeds remaining refundable balance',
          status: 422,
          detail: `Already refunded: $${(err.alreadyRefunded as number).toFixed(2)}. Order total: $${err.orderTotal}`,
        });
      }
      throw err;
    }

    return reply.status(201).send({ data: refund });
  });

  // PATCH /api/v1/orders/:id/lines/:lineId/status
  app.patch('/:id/lines/:lineId/status', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id, lineId } = request.params as { id: string; lineId: string };
    const body = z.object({ status: z.enum(['pending', 'sent_to_kitchen', 'ready', 'served', 'void', 'comp']) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const lineRows = await db.update(schema.orderLines)
      .set({ status: body.data.status })
      .where(
        and(
          eq(schema.orderLines.id, lineId),
          // join to verify org ownership:
          inArray(schema.orderLines.orderId,
            db.select({ id: schema.orders.id })
              .from(schema.orders)
              .where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, orgId)))
          )
        )
      )
      .returning();
    if (lineRows.length === 0) return reply.status(404).send({ title: 'Order line not found', status: 404 });
    return reply.status(200).send({ data: lineRows[0] });
  });
}
