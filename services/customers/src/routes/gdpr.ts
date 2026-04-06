import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db, schema } from '../db';

export async function gdprRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ── GET /customers/:id/export ──────────────────────────────────────────────
  // Full personal data export (GDPR Article 20 — right to data portability)
  app.get('/customers/:id/export', async (request, reply) => {
    const { orgId, sub: requestedBy } = request.user as { orgId: string; sub: string };
    const { id } = request.params as { id: string };

    const customer = await db.query.customers.findFirst({
      where: and(eq(schema.customers.id, id), eq(schema.customers.orgId, orgId)),
    });

    if (!customer) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Customer ${id} not found`,
      });
    }

    // Fetch notes (non-deleted)
    const notes = await db.query.customerNotes.findMany({
      where: and(
        eq(schema.customerNotes.customerId, id),
        eq(schema.customerNotes.orgId, orgId),
        isNull(schema.customerNotes.deletedAt),
      ),
      orderBy: [desc(schema.customerNotes.createdAt)],
    });

    // Fetch store credit account
    const storeCredit = await db.query.storeCreditAccounts.findFirst({
      where: and(
        eq(schema.storeCreditAccounts.customerId, id),
        eq(schema.storeCreditAccounts.orgId, orgId),
      ),
    });

    // Log the export request
    await db.insert(schema.gdprRequests).values({
      orgId,
      customerId: id,
      requestType: 'export',
      requestedBy,
      completedAt: new Date(),
    });

    const exportPayload = {
      profile: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        dob: customer.dob,
        gender: customer.gender,
        addressLine1: customer.addressLine1,
        suburb: customer.suburb,
        state: customer.state,
        postcode: customer.postcode,
        country: customer.country,
        company: customer.company,
        abn: customer.abn,
        tags: customer.tags,
        marketingOptIn: customer.marketingOptIn,
        marketingOptInAt: customer.marketingOptInAt,
        rfmScore: customer.rfmScore,
        lifetimeValue: customer.lifetimeValue,
        visitCount: customer.visitCount,
        lastPurchaseAt: customer.lastPurchaseAt,
        preferredLanguage: customer.preferredLanguage,
        dietaryPreferences: customer.dietaryPreferences,
        allergenAlerts: customer.allergenAlerts,
        source: customer.source,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      notes: notes.map((n) => ({
        id: n.id,
        content: n.content,
        type: n.type,
        isInternal: n.isInternal,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
      storeCredit: storeCredit
        ? {
            id: storeCredit.id,
            balance: storeCredit.balance,
            expiresAt: storeCredit.expiresAt,
            createdAt: storeCredit.createdAt,
          }
        : null,
      exportedAt: new Date().toISOString(),
    };

    const filename = `customer-${id}-export.json`;
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Type', 'application/json');
    return reply.status(200).send(exportPayload);
  });

  // ── DELETE /customers/:id/erasure ──────────────────────────────────────────
  // Right to erasure (GDPR Article 17) — anonymises PII, preserves order history
  app.delete('/customers/:id/erasure', async (request, reply) => {
    const { orgId, sub: requestedBy, role } = request.user as {
      orgId: string;
      sub: string;
      role?: string;
    };
    const { id } = request.params as { id: string };

    // Only admin / owner may perform erasure
    const isAuthorised = role === 'admin' || role === 'owner';
    if (!isAuthorised) {
      return reply.status(403).send({
        type: 'https://elevatedpos.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Only admin or owner roles can perform GDPR erasure requests',
      });
    }

    const customer = await db.query.customers.findFirst({
      where: and(eq(schema.customers.id, id), eq(schema.customers.orgId, orgId)),
    });

    if (!customer) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Customer ${id} not found`,
      });
    }

    if (customer.gdprDeleted) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/conflict',
        title: 'Already Erased',
        status: 422,
        detail: `Customer ${id} has already been anonymised`,
      });
    }

    const anonymisedAt = new Date();

    // Anonymise the customer record — preserve id and orgId for referential integrity
    await db
      .update(schema.customers)
      .set({
        firstName: 'Deleted',
        lastName: 'User',
        email: `deleted-${id}@deleted.invalid`,
        phone: null,
        dob: null,
        gender: null,
        addressLine1: null,
        suburb: null,
        state: null,
        postcode: null,
        company: null,
        abn: null,
        notes: null,
        tags: [],
        dietaryPreferences: [],
        allergenAlerts: [],
        marketingOptIn: false,
        marketingOptInAt: null,
        householdId: null,
        rfmScore: null,
        churnRiskScore: null,
        gdprDeleted: true,
        gdprDeletedAt: anonymisedAt,
        updatedAt: anonymisedAt,
      })
      .where(eq(schema.customers.id, id));

    // Soft-delete all notes (they may contain personal info)
    await db
      .update(schema.customerNotes)
      .set({ deletedAt: anonymisedAt, updatedAt: anonymisedAt })
      .where(
        and(
          eq(schema.customerNotes.customerId, id),
          eq(schema.customerNotes.orgId, orgId),
          isNull(schema.customerNotes.deletedAt),
        ),
      );

    // Log the erasure request
    await db.insert(schema.gdprRequests).values({
      orgId,
      customerId: id,
      requestType: 'erasure',
      requestedBy,
      completedAt: anonymisedAt,
    });

    return reply.status(200).send({
      customerId: id,
      anonymisedAt: anonymisedAt.toISOString(),
      fieldsCleared: ['name', 'email', 'phone', 'address', 'notes'],
    });
  });

  // ── GET /gdpr/requests ─────────────────────────────────────────────────────
  // List all GDPR requests (erasure + export log) — admin/owner only
  app.get('/gdpr/requests', async (request, reply) => {
    const { orgId, role } = request.user as { orgId: string; role?: string };

    const isAuthorised = role === 'admin' || role === 'owner' || role === 'manager';
    if (!isAuthorised) {
      return reply.status(403).send({
        type: 'https://elevatedpos.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Only admin, owner or manager roles can view GDPR requests',
      });
    }

    const q = request.query as { limit?: string; offset?: string; type?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);

    const conditions = [eq(schema.gdprRequests.orgId, orgId)];
    if (q.type === 'erasure' || q.type === 'export') {
      conditions.push(eq(schema.gdprRequests.requestType, q.type));
    }

    const requests = await db.query.gdprRequests.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.gdprRequests.createdAt)],
      limit,
      offset,
    });

    return reply.status(200).send({
      data: requests,
      meta: { total: requests.length, limit, offset },
    });
  });
}
