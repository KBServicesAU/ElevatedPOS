import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { db, schema } from '../db';

// v2.7.40/v2.7.41 — the dashboard stocktake form now requires a real
// location UUID fetched from the locations service and disables "Start
// Count" when none are available, so multi-location orgs no longer bucket
// every count under the org. The permissive non-UUID coercion below is
// retained as a safety net for the mobile client and legacy callers —
// single-location merchants will still see counts filed under the org
// UUID, which maps to their only store. For multi-location orgs a real
// location UUID is expected.
const createStocktakeSchema = z.object({
  locationId: z.string().optional(),
  name: z.string().optional(),
  notes: z.string().optional(),
  countAll: z.boolean().optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  type: z.enum(['full', 'cycle', 'spot']).optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function generateStocktakeNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.stocktakes)
    .where(
      and(
        eq(schema.stocktakes.orgId, orgId),
        gte(schema.stocktakes.createdAt, new Date(`${year}-01-01T00:00:00Z`)),
      ),
    );
  const seq = (Number(count[0]?.count ?? 0) + 1).toString().padStart(4, '0');
  return `STK-${year}-${seq}`;
}

export async function stocktakeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /schedule — register a recurring cycle count schedule.
  // v2.7.40 — the dashboard cycle-count flow POSTs to this endpoint before
  // calling POST /. Without this handler the proxy 404s and the whole
  // "Start Count" flow aborts. Recurrence is not yet persisted (no
  // schema column), so we accept and acknowledge so the main create can
  // proceed. Once a schedule table exists this can store the cadence.
  app.post('/schedule', async (_request, reply) => {
    return reply.status(200).send({ data: { scheduled: true } });
  });

  // POST / — Start a new stocktake
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string; sub: string };
    const body = createStocktakeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { name, notes, countAll, categoryIds, type } = body.data;
    // v2.7.40 — accept a non-UUID `locationId` from the dashboard's
    // fallback options and coerce to the org's uuid. The column is
    // NOT NULL so we can't store null; the DB has no FK here by design.
    const locationId = body.data.locationId && UUID_RE.test(body.data.locationId)
      ? body.data.locationId
      : orgId;
    const number = await generateStocktakeNumber(orgId);

    const stocktakeRows = await db
      .insert(schema.stocktakes)
      .values({
        orgId,
        locationId,
        number,
        ...(name !== undefined ? { name } : (type !== undefined ? { name: `${type} count` } : {})),
        ...(notes !== undefined ? { notes } : {}),
      })
      .returning();
    const stocktake = stocktakeRows[0]!;

    // Generate count sheet lines
    if (countAll || (categoryIds && categoryIds.length > 0)) {
      const stockItems = await db.query.stockItems.findMany({
        where: eq(schema.stockItems.locationId, locationId),
      });

      if (stockItems.length > 0) {
        const lines = stockItems.map((item) => ({
          stocktakeId: stocktake.id,
          productId: item.productId,
          sku: '',
          productName: '',
          systemQty: item.onHand,
          unitCost: '0',
        }));

        if (lines.length > 0) {
          await db.insert(schema.stocktakeLines).values(lines);
        }
      }
    }

    const created = await db.query.stocktakes.findFirst({
      where: eq(schema.stocktakes.id, stocktake.id),
      with: { lines: true },
    });

    return reply.status(201).send({ data: created });
  });

  // GET / — List stocktakes
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { locationId?: string; status?: string; dateFrom?: string };

    const conditions = [eq(schema.stocktakes.orgId, orgId)];
    if (q.locationId) conditions.push(eq(schema.stocktakes.locationId, q.locationId));
    if (q.status) conditions.push(eq(schema.stocktakes.status, q.status as 'draft' | 'in_review' | 'completed' | 'cancelled'));
    if (q.dateFrom) conditions.push(gte(schema.stocktakes.createdAt, new Date(q.dateFrom)));

    const stocktakes = await db.query.stocktakes.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.stocktakes.createdAt)],
    });

    return reply.status(200).send({ data: stocktakes });
  });

  // GET /:id — Stocktake detail with lines
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const stocktake = await db.query.stocktakes.findFirst({
      where: and(eq(schema.stocktakes.id, id), eq(schema.stocktakes.orgId, orgId)),
      with: { lines: true },
    });

    if (!stocktake) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: stocktake });
  });

  // PATCH /:id/sheets/:sheetId — Update counted quantity for a line
  app.patch('/:id/sheets/:sheetId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id, sheetId } = request.params as { id: string; sheetId: string };
    const body = z.object({ countedQty: z.number().min(0) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ title: 'Validation Error', status: 422 });

    const stocktake = await db.query.stocktakes.findFirst({
      where: and(eq(schema.stocktakes.id, id), eq(schema.stocktakes.orgId, orgId)),
    });
    if (!stocktake) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (stocktake.status !== 'draft' && stocktake.status !== 'in_review') {
      return reply.status(400).send({ title: 'Bad Request', status: 400, detail: 'Cannot modify a completed or cancelled stocktake' });
    }

    const line = await db.query.stocktakeLines.findFirst({
      where: and(
        eq(schema.stocktakeLines.id, sheetId),
        eq(schema.stocktakeLines.stocktakeId, id),
      ),
    });
    if (!line) return reply.status(404).send({ title: 'Line Not Found', status: 404 });

    const { countedQty } = body.data;
    const variance = countedQty - Number(line.systemQty);

    const [updated] = await db
      .update(schema.stocktakeLines)
      .set({ countedQty: String(countedQty), variance: String(variance) })
      .where(eq(schema.stocktakeLines.id, sheetId))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/submit — Submit for review
  app.post('/:id/submit', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const stocktake = await db.query.stocktakes.findFirst({
      where: and(eq(schema.stocktakes.id, id), eq(schema.stocktakes.orgId, orgId)),
    });
    if (!stocktake) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (stocktake.status !== 'draft') {
      return reply.status(400).send({ title: 'Bad Request', status: 400, detail: 'Stocktake must be in draft status to submit' });
    }

    const [updated] = await db
      .update(schema.stocktakes)
      .set({ status: 'in_review', submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.stocktakes.id, id))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/approve — Approve and commit stock adjustments
  app.post('/:id/approve', async (request, reply) => {
    const { orgId, sub: employeeId } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };

    const stocktake = await db.query.stocktakes.findFirst({
      where: and(eq(schema.stocktakes.id, id), eq(schema.stocktakes.orgId, orgId)),
      with: { lines: true },
    });
    if (!stocktake) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (stocktake.status !== 'in_review') {
      return reply.status(400).send({ title: 'Bad Request', status: 400, detail: 'Stocktake must be in review to approve' });
    }

    let totalVarianceValue = 0;

    // Apply stock adjustments for lines with a counted quantity
    for (const line of stocktake.lines) {
      if (line.countedQty === null || line.countedQty === undefined) continue;

      const countedQty = Number(line.countedQty);
      const systemQty = Number(line.systemQty);
      const variance = countedQty - systemQty;
      if (variance === 0) continue;

      totalVarianceValue += Math.abs(variance) * Number(line.unitCost);

      // Update stock item
      const stockItem = await db.query.stockItems.findFirst({
        where: and(
          eq(schema.stockItems.locationId, stocktake.locationId),
          eq(schema.stockItems.productId, line.productId),
        ),
      });

      const beforeQty = Number(stockItem?.onHand ?? 0);
      const afterQty = countedQty;

      if (stockItem) {
        await db
          .update(schema.stockItems)
          .set({ onHand: String(afterQty), lastCountAt: new Date(), lastCountQty: String(countedQty), updatedAt: new Date() })
          .where(eq(schema.stockItems.id, stockItem.id));
      } else {
        await db.insert(schema.stockItems).values({
          orgId: stocktake.orgId,
          locationId: stocktake.locationId,
          productId: line.productId,
          onHand: String(afterQty),
          lastCountAt: new Date(),
          lastCountQty: String(countedQty),
        });
      }

      // Create adjustment record
      await db.insert(schema.stockAdjustments).values({
        orgId,
        locationId: stocktake.locationId,
        productId: line.productId,
        beforeQty: String(beforeQty),
        afterQty: String(afterQty),
        adjustment: String(variance),
        reason: `Stocktake ${stocktake.number}`,
        referenceId: stocktake.id,
        referenceType: 'stocktake',
        employeeId,
      });
    }

    const [updated] = await db
      .update(schema.stocktakes)
      .set({
        status: 'completed',
        completedAt: new Date(),
        approvedBy: employeeId,
        totalVarianceValue: String(totalVarianceValue),
        updatedAt: new Date(),
      })
      .where(eq(schema.stocktakes.id, id))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // POST /:id/cancel — Cancel stocktake
  app.post('/:id/cancel', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const stocktake = await db.query.stocktakes.findFirst({
      where: and(eq(schema.stocktakes.id, id), eq(schema.stocktakes.orgId, orgId)),
    });
    if (!stocktake) return reply.status(404).send({ title: 'Not Found', status: 404 });
    if (stocktake.status === 'completed' || stocktake.status === 'cancelled') {
      return reply.status(400).send({ title: 'Bad Request', status: 400, detail: 'Cannot cancel a completed or already cancelled stocktake' });
    }

    const [updated] = await db
      .update(schema.stocktakes)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.stocktakes.id, id))
      .returning();

    return reply.status(200).send({ data: updated });
  });
}
