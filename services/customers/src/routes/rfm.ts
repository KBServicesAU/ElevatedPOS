import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';

/** Assign a 1-5 score given a sorted ascending array of breakpoints.
 *  Values <= breakpoints[0] → 1, ... values > breakpoints[3] → 5
 */
function scoreValue(value: number, breakpoints: [number, number, number, number]): number {
  if (value <= breakpoints[0]) return 1;
  if (value <= breakpoints[1]) return 2;
  if (value <= breakpoints[2]) return 3;
  if (value <= breakpoints[3]) return 4;
  return 5;
}

/** Recency: lower days → higher score (most recent = 5) */
function recencyScore(daysSinceLastPurchase: number): number {
  // 1=oldest (>180d), 5=most recent (<7d)
  if (daysSinceLastPurchase <= 7) return 5;
  if (daysSinceLastPurchase <= 30) return 4;
  if (daysSinceLastPurchase <= 60) return 3;
  if (daysSinceLastPurchase <= 180) return 2;
  return 1;
}

function segmentName(r: number, f: number, m: number): string {
  const score = `${r}${f}${m}`;
  if (r >= 4 && f >= 4 && m >= 4) return 'champions';
  if (r >= 3 && f >= 3) return 'loyal_customers';
  if (r >= 4 && f <= 2) return 'promising';
  if (r >= 3 && f <= 2 && m <= 2) return 'new_customers';
  if (r === 2 && f >= 3) return 'at_risk';
  if (r <= 2 && f >= 2 && m >= 2) return 'at_risk';
  if (r <= 2 && f <= 2 && m >= 3) return 'cannot_lose_them';
  if (r <= 1) return 'lost';
  return 'need_attention';
}

const rfmComputeSchema = z.object({
  orgId: z.string().uuid(),
  period: z.number().int().min(1).max(365).default(90),
});

export async function rfmRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /rfm/compute
  app.post('/rfm/compute', async (request, reply) => {
    const parsed = rfmComputeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const { orgId, period } = parsed.data;
    const now = Date.now();
    const periodStart = new Date(now - period * 24 * 60 * 60 * 1000);

    const allCustomers = await db.query.customers.findMany({
      where: and(eq(schema.customers.orgId, orgId), eq(schema.customers.gdprDeleted, false)),
    });

    if (allCustomers.length === 0) {
      return reply.status(200).send({
        processed: 0,
        segments: {},
      });
    }

    // Compute breakpoints from the dataset
    const lifetimeValues = allCustomers.map((c) => Number(c.lifetimeValue)).sort((a, b) => a - b);
    const visitCounts = allCustomers.map((c) => c.visitCount).sort((a, b) => a - b);

    const pct = (arr: number[], p: number) =>
      arr[Math.floor((arr.length - 1) * p)] ?? 0;

    const mBreakpoints: [number, number, number, number] = [
      pct(lifetimeValues, 0.2),
      pct(lifetimeValues, 0.4),
      pct(lifetimeValues, 0.6),
      pct(lifetimeValues, 0.8),
    ];
    const fBreakpoints: [number, number, number, number] = [
      pct(visitCounts, 0.2),
      pct(visitCounts, 0.4),
      pct(visitCounts, 0.6),
      pct(visitCounts, 0.8),
    ];

    const segmentCounts: Record<string, number> = {};
    let processed = 0;

    for (const customer of allCustomers) {
      const lastPurchase = customer.lastPurchaseAt
        ? new Date(customer.lastPurchaseAt)
        : null;

      const daysSince = lastPurchase
        ? Math.floor((now - lastPurchase.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Only count frequency within period
      const inPeriod = lastPurchase && lastPurchase >= periodStart;
      const effectiveVisits = inPeriod ? customer.visitCount : 0;

      const r = recencyScore(daysSince);
      const f = scoreValue(effectiveVisits, fBreakpoints);
      const m = scoreValue(Number(customer.lifetimeValue), mBreakpoints);

      const rfmScore = `${r}${f}${m}`;
      const segment = segmentName(r, f, m);

      segmentCounts[segment] = (segmentCounts[segment] ?? 0) + 1;

      await db
        .update(schema.customers)
        .set({ rfmScore, updatedAt: new Date() })
        .where(and(eq(schema.customers.id, customer.id), eq(schema.customers.orgId, orgId)));

      processed++;
    }

    return reply.status(200).send({ processed, segments: segmentCounts });
  });

  // GET /rfm/segments
  app.get('/rfm/segments', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const customers = await db.query.customers.findMany({
      where: and(eq(schema.customers.orgId, orgId), eq(schema.customers.gdprDeleted, false)),
    });

    const segmentCounts: Record<string, number> = {};

    for (const customer of customers) {
      if (!customer.rfmScore || customer.rfmScore.length < 3) continue;
      const r = Number(customer.rfmScore[0]);
      const f = Number(customer.rfmScore[1]);
      const m = Number(customer.rfmScore[2]);
      const segment = segmentName(r, f, m);
      segmentCounts[segment] = (segmentCounts[segment] ?? 0) + 1;
    }

    const segmentDefs = [
      { key: 'champions', label: 'Champions', description: 'Best customers — high R, F, M' },
      { key: 'loyal_customers', label: 'Loyal Customers', description: 'Buy often, recently' },
      { key: 'promising', label: 'Promising', description: 'Recent first-timers' },
      { key: 'new_customers', label: 'New Customers', description: 'Bought recently, low frequency' },
      { key: 'at_risk', label: 'At Risk', description: 'Above average, but not recent' },
      { key: 'cannot_lose_them', label: 'Cannot Lose Them', description: 'Big spenders going inactive' },
      { key: 'lost', label: 'Lost', description: 'Lowest recency score' },
      { key: 'need_attention', label: 'Need Attention', description: 'Above average but fading' },
    ];

    const data = segmentDefs.map((s) => ({
      ...s,
      count: segmentCounts[s.key] ?? 0,
    }));

    return reply.status(200).send({ data, meta: { total: customers.length } });
  });

  // GET /rfm/at-risk
  app.get('/rfm/at-risk', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const now = Date.now();
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

    const customers = await db.query.customers.findMany({
      where: and(eq(schema.customers.orgId, orgId), eq(schema.customers.gdprDeleted, false)),
    });

    const atRisk = customers.filter((c) => {
      const lastPurchase = c.lastPurchaseAt ? new Date(c.lastPurchaseAt) : null;
      const notRecentlyPurchased = !lastPurchase || lastPurchase < sixtyDaysAgo;
      const hasLowRfm =
        c.rfmScore && c.rfmScore.length >= 1 && (c.rfmScore[0] === '1' || c.rfmScore[0] === '2');
      return notRecentlyPurchased || hasLowRfm;
    });

    const enriched = atRisk.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      rfmScore: c.rfmScore,
      lifetimeValue: c.lifetimeValue,
      visitCount: c.visitCount,
      lastPurchaseAt: c.lastPurchaseAt,
      daysSinceLastPurchase: c.lastPurchaseAt
        ? Math.floor((now - new Date(c.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      churnRiskScore: c.churnRiskScore,
    }));

    return reply
      .status(200)
      .send({ data: enriched, meta: { count: enriched.length } });
  });
}
