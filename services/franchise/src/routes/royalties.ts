import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const NOTIFICATIONS_URL = process.env['NOTIFICATIONS_SERVICE_URL'] ?? 'http://notifications:4009';

async function sendRoyaltyStatementNotification(opts: {
  toEmail: string;
  contactName: string | null;
  groupName: string;
  period: string;
  royaltyAmount: string;
  orgId: string;
}): Promise<void> {
  const { toEmail, contactName, groupName, period, royaltyAmount, orgId } = opts;
  const internalToken = process.env['INTERNAL_SERVICE_TOKEN'] ?? process.env['JWT_SECRET'];
  try {
    await fetch(`${NOTIFICATIONS_URL}/api/v1/notifications/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify({
        to: toEmail,
        subject: `Royalty Statement Issued — ${groupName} ${period}`,
        template: 'custom',
        orgId,
        data: {
          body: `<p>Hi ${contactName ?? 'Franchisee'},</p>
<p>Your royalty statement for <strong>${period}</strong> has been issued.</p>
<p><strong>Franchise Group:</strong> ${groupName}<br>
<strong>Royalty Amount Due:</strong> $${royaltyAmount}</p>
<p>Please log in to the franchisee portal to review and pay the statement.</p>
<p>Thank you,<br>ElevatedPOS Franchise Team</p>`,
        },
      }),
    });
  } catch (err) {
    console.error('[royalties] Failed to send notification:', err instanceof Error ? err.message : err);
    // Non-fatal — continue
  }
}

const generateStatementsSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  locationIds: z.array(z.string().uuid()).optional(),
  // Allow caller to pass sales data since we can't cross service DB boundaries
  salesData: z
    .array(
      z.object({
        locationId: z.string().uuid(),
        grossSales: z.number().min(0),
        netSales: z.number().min(0),
      }),
    )
    .optional(),
});

export async function royaltyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /groups/:groupId/statements/generate
  app.post('/groups/:groupId/statements/generate', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId } = request.params as { groupId: string };

    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }

    const parsed = generateStatementsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const allLocations = await db.query.franchiseLocations.findMany({
      where: and(
        eq(schema.franchiseLocations.groupId, groupId),
        eq(schema.franchiseLocations.status, 'active'),
      ),
    });

    const targetLocations = parsed.data.locationIds
      ? allLocations.filter((l) => parsed.data.locationIds!.includes(l.locationId))
      : allLocations;

    const royaltyRate = Number(group.royaltyRate);
    const statements = [];

    for (const loc of targetLocations) {
      const salesEntry = parsed.data.salesData?.find((s) => s.locationId === loc.locationId);
      const grossSales = salesEntry?.grossSales ?? 0;
      const netSales = salesEntry?.netSales ?? 0;
      const baseSales =
        group.royaltyCalculation === 'net_sales' ? netSales : grossSales;
      const royaltyAmount = baseSales * royaltyRate;

      const [stmt] = await db
        .insert(schema.royaltyStatements)
        .values({
          groupId,
          locationId: loc.locationId,
          period: parsed.data.period,
          grossSales: String(grossSales.toFixed(4)),
          netSales: String(netSales.toFixed(4)),
          royaltyRate: String(royaltyRate.toFixed(4)),
          royaltyAmount: String(royaltyAmount.toFixed(4)),
          status: 'draft',
        })
        .returning();
      statements.push(stmt);
    }

    return reply.status(201).send({ data: statements, meta: { count: statements.length } });
  });

  // GET /groups/:groupId/statements — list statements
  app.get('/groups/:groupId/statements', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId } = request.params as { groupId: string };
    const q = request.query as {
      period?: string;
      status?: string;
      locationId?: string;
      limit?: number;
      offset?: number;
    };

    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }

    const whereClause = and(
      eq(schema.royaltyStatements.groupId, groupId),
      q.period ? eq(schema.royaltyStatements.period, q.period) : undefined,
      q.status ? eq(schema.royaltyStatements.status, q.status) : undefined,
      q.locationId ? eq(schema.royaltyStatements.locationId, q.locationId) : undefined,
    );
    const statements = await db.query.royaltyStatements.findMany({
      where: whereClause,
      orderBy: [desc(schema.royaltyStatements.createdAt)],
      limit: q.limit ?? 50,
      offset: q.offset ?? 0,
    });

    return reply.status(200).send({ data: statements });
  });

  // GET /groups/:groupId/statements/:id
  app.get('/groups/:groupId/statements/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId, id } = request.params as { groupId: string; id: string };

    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }

    const stmt = await db.query.royaltyStatements.findFirst({
      where: and(
        eq(schema.royaltyStatements.id, id),
        eq(schema.royaltyStatements.groupId, groupId),
      ),
    });
    if (!stmt) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Statement ${id} not found`,
      });
    }
    return reply.status(200).send({ data: stmt });
  });

  // POST /groups/:groupId/statements/:id/issue
  app.post('/groups/:groupId/statements/:id/issue', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId, id } = request.params as { groupId: string; id: string };

    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }

    const stmt = await db.query.royaltyStatements.findFirst({
      where: and(
        eq(schema.royaltyStatements.id, id),
        eq(schema.royaltyStatements.groupId, groupId),
      ),
    });
    if (!stmt) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Statement ${id} not found`,
      });
    }
    if (stmt.status !== 'draft') {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: `Statement is already ${stmt.status}`,
      });
    }

    const [updated] = await db
      .update(schema.royaltyStatements)
      .set({ status: 'issued', issuedAt: new Date() })
      .where(eq(schema.royaltyStatements.id, id))
      .returning();

    // Notify franchisee — look up their email from the franchise_locations record
    const location = await db.query.franchiseLocations.findFirst({
      where: and(
        eq(schema.franchiseLocations.groupId, groupId),
        eq(schema.franchiseLocations.locationId, stmt.locationId),
      ),
    });
    if (location?.franchiseeEmail) {
      void sendRoyaltyStatementNotification({
        toEmail: location.franchiseeEmail,
        contactName: location.franchiseeContactName ?? null,
        groupName: group.name,
        period: stmt.period,
        royaltyAmount: updated?.royaltyAmount ?? '0',
        orgId,
      });
    }

    return reply.status(200).send({ data: updated });
  });

  // POST /groups/:groupId/statements/:id/pay
  app.post('/groups/:groupId/statements/:id/pay', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { groupId, id } = request.params as { groupId: string; id: string };

    const group = await db.query.franchiseGroups.findFirst({
      where: and(eq(schema.franchiseGroups.id, groupId), eq(schema.franchiseGroups.orgId, orgId)),
    });
    if (!group) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Franchise group ${groupId} not found`,
      });
    }

    const stmt = await db.query.royaltyStatements.findFirst({
      where: and(
        eq(schema.royaltyStatements.id, id),
        eq(schema.royaltyStatements.groupId, groupId),
      ),
    });
    if (!stmt) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Statement ${id} not found`,
      });
    }

    const [updated] = await db
      .update(schema.royaltyStatements)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(schema.royaltyStatements.id, id))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // GET /franchisee/statements — franchisee view of their own statements
  app.get('/franchisee/statements', async (request, reply) => {
    const { orgId: franchiseeOrgId } = request.user as { orgId: string };
    const q = request.query as {
      period?: string;
      status?: string;
      limit?: number;
      offset?: number;
    };

    // Find all locations for this franchisee org
    const locations = await db.query.franchiseLocations.findMany({
      where: eq(schema.franchiseLocations.franchiseeOrgId, franchiseeOrgId),
    });

    if (locations.length === 0) {
      return reply.status(200).send({ data: [] });
    }

    const locationIds = locations.map((l) => l.locationId);

    const statements = await db.query.royaltyStatements.findMany({
      where: and(
        inArray(schema.royaltyStatements.locationId, locationIds),
        q.period ? eq(schema.royaltyStatements.period, q.period) : undefined,
        q.status ? eq(schema.royaltyStatements.status, q.status) : undefined,
      ),
      orderBy: [desc(schema.royaltyStatements.createdAt)],
      limit: q.limit ?? 100,
      offset: q.offset ?? 0,
    });

    return reply.status(200).send({ data: statements });
  });
}
