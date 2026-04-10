import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { createServiceToken } from '@nexus/config';

// Internal service URLs — resolved from env at runtime
const ORDERS_SERVICE = process.env['ORDERS_API_URL'] ?? 'http://localhost:4004';
const LOYALTY_SERVICE = process.env['LOYALTY_API_URL'] ?? 'http://localhost:4007';

async function fetchServiceToService(url: string, targetService: string): Promise<Record<string, unknown> | null> {
  const serviceToken = createServiceToken('customers', targetService);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'X-Service-Call': 'true',
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

export async function crmRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ── Notes ──────────────────────────────────────────────────────────────────

  // POST /customers/:id/notes — add note to customer profile
  app.post('/customers/:id/notes', async (request, reply) => {
    const { orgId, sub: authorId, role: _role } = request.user as { orgId: string; sub: string; role?: string };
    const { id } = request.params as { id: string };

    const parsed = z
      .object({
        content: z.string().min(1),
        isInternal: z.boolean().default(true),
        type: z.string().default('general'),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const customer = await db.query.customers.findFirst({
      where: and(eq(schema.customers.id, id), eq(schema.customers.orgId, orgId), eq(schema.customers.gdprDeleted, false)),
    });
    if (!customer) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Customer ${id} not found`,
      });
    }

    const [note] = await db
      .insert(schema.customerNotes)
      .values({
        customerId: id,
        orgId,
        content: parsed.data.content,
        type: parsed.data.type,
        authorId,
        isInternal: parsed.data.isInternal,
        employeeId: authorId,
      })
      .returning();
    return reply.status(201).send({ data: note });
  });

  // GET /customers/:id/notes — list notes (filter internal if not manager role)
  app.get('/customers/:id/notes', async (request, reply) => {
    const { orgId, role, permissions: rawPermissions } = request.user as { orgId: string; role?: string; permissions?: Record<string, boolean> };
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

    const permissions = rawPermissions ?? {};
    const isManager = permissions['view_internal_notes'] === true ||
                      permissions['manage_customers'] === true ||
                      role === 'superadmin';  // fallback for platform tokens

    const conditions = [
      eq(schema.customerNotes.customerId, id),
      eq(schema.customerNotes.orgId, orgId),
      isNull(schema.customerNotes.deletedAt),
    ];

    // Non-managers cannot see internal notes
    if (!isManager) {
      conditions.push(eq(schema.customerNotes.isInternal, false));
    }

    const notes = await db.query.customerNotes.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.customerNotes.createdAt)],
    });
    return reply.status(200).send({ data: notes });
  });

  // DELETE /customers/:id/notes/:noteId — delete note (own notes only or manager)
  app.delete('/customers/:id/notes/:noteId', async (request, reply) => {
    const { orgId, sub: authorId, role, permissions: rawPermissions } = request.user as { orgId: string; sub: string; role?: string; permissions?: Record<string, boolean> };
    const { id, noteId } = request.params as { id: string; noteId: string };

    const note = await db.query.customerNotes.findFirst({
      where: and(
        eq(schema.customerNotes.id, noteId),
        eq(schema.customerNotes.customerId, id),
        eq(schema.customerNotes.orgId, orgId),
        isNull(schema.customerNotes.deletedAt),
      ),
    });
    if (!note) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Note ${noteId} not found`,
      });
    }

    const permissions = rawPermissions ?? {};
    const isManager = permissions['view_internal_notes'] === true ||
                      permissions['manage_customers'] === true ||
                      role === 'superadmin';  // fallback for platform tokens
    const isOwner = note.authorId === authorId;

    if (!isManager && !isOwner) {
      return reply.status(403).send({
        type: 'https://elevatedpos.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'You can only delete your own notes',
      });
    }

    await db
      .update(schema.customerNotes)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.customerNotes.id, noteId));

    return reply.status(204).send();
  });

  // ── Timeline ───────────────────────────────────────────────────────────────

  // GET /customers/:id/timeline — unified activity timeline
  app.get('/customers/:id/timeline', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const customer = await db.query.customers.findFirst({
      where: and(eq(schema.customers.id, id), eq(schema.customers.orgId, orgId), eq(schema.customers.gdprDeleted, false)),
    });
    if (!customer) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Customer ${id} not found`,
      });
    }

    const events: Array<{
      type: string;
      date: string;
      description: string;
      metadata: Record<string, unknown>;
    }> = [];

    // Fetch orders from orders service (service-to-service auth)
    try {
      const ordersData = await fetchServiceToService(
        `${ORDERS_SERVICE}/api/v1/orders?customerId=${id}&limit=20`,
        'orders',
      );
      if (ordersData?.['data']) {
        for (const order of (ordersData['data'] as any[])) {
          events.push({
            type: 'order',
            date: order.createdAt ?? order.created_at,
            description: `Order #${order.orderNumber ?? order.id?.slice(0, 8)} — $${Number(order.total ?? 0).toFixed(2)}`,
            metadata: {
              orderId: order.id,
              total: order.total,
              status: order.status,
              itemCount: order.items?.length ?? 0,
            },
          });
        }
      }
    } catch {
      // Orders service unavailable — continue without orders
    }

    // Fetch loyalty transactions from loyalty service (service-to-service auth)
    try {
      const accountsData = await fetchServiceToService(
        `${LOYALTY_SERVICE}/api/v1/loyalty/accounts/customer/${id}`,
        'loyalty',
      );
      const accountsDataArr = accountsData?.['data'] as any[] | undefined;
      if (accountsDataArr && accountsDataArr.length > 0) {
        const accountId = (accountsDataArr[0] as any).id;
        const txData = await fetchServiceToService(
          `${LOYALTY_SERVICE}/api/v1/loyalty/accounts/${accountId}/transactions`,
          'loyalty',
        );
        if (txData?.['data']) {
          for (const tx of (txData['data'] as any[])) {
            const isEarn = tx.type === 'earn';
            events.push({
              type: 'loyalty',
              date: tx.createdAt ?? tx.created_at,
              description: isEarn
                ? `Earned ${tx.points} points`
                : tx.type === 'redeem'
                ? `Redeemed ${Math.abs(tx.points)} points`
                : `Points adjustment: ${tx.points > 0 ? '+' : ''}${tx.points}`,
              metadata: {
                transactionId: tx.id,
                points: tx.points,
                type: tx.type,
              },
            });
          }
        }
      }
    } catch {
      // Loyalty service unavailable — continue without loyalty events
    }

    // Merge notes as timeline events
    const notes = await db.query.customerNotes.findMany({
      where: and(
        eq(schema.customerNotes.customerId, id),
        eq(schema.customerNotes.orgId, orgId),
        isNull(schema.customerNotes.deletedAt),
      ),
    });
    for (const note of notes) {
      events.push({
        type: 'note',
        date: note.createdAt.toISOString(),
        description: note.isInternal ? `[Internal] ${note.content.slice(0, 80)}` : note.content.slice(0, 80),
        metadata: {
          noteId: note.id,
          isInternal: note.isInternal,
          authorId: note.authorId,
        },
      });
    }

    // Sort all events by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return reply.status(200).send({ events });
  });

  // ── Merge ──────────────────────────────────────────────────────────────────

  // POST /customers/merge — merge two customer records
  app.post('/customers/merge', async (request, reply) => {
    const { orgId, sub: mergedBy } = request.user as { orgId: string; sub: string };

    const parsed = z
      .object({
        keepId: z.string().uuid(),
        mergeId: z.string().uuid(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const { keepId, mergeId } = parsed.data;

    if (keepId === mergeId) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: 'keepId and mergeId must be different customers',
      });
    }

    const [keepCustomer, mergeCustomer] = await Promise.all([
      db.query.customers.findFirst({
        where: and(eq(schema.customers.id, keepId), eq(schema.customers.orgId, orgId)),
      }),
      db.query.customers.findFirst({
        where: and(eq(schema.customers.id, mergeId), eq(schema.customers.orgId, orgId)),
      }),
    ]);

    if (!keepCustomer) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Customer ${keepId} not found`,
      });
    }
    if (!mergeCustomer) {
      return reply.status(404).send({
        type: 'https://elevatedpos.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Customer ${mergeId} not found`,
      });
    }
    if (mergeCustomer.mergedIntoId !== null) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: `Customer ${mergeId} has already been merged`,
      });
    }

    // Merge tags from mergeCustomer into keepCustomer (union, deduplicated)
    const keepTags = (keepCustomer.tags ?? []) as string[];
    const mergeTags = (mergeCustomer.tags ?? []) as string[];
    const mergedTags = [...new Set([...keepTags, ...mergeTags])];

    const log = await db.transaction(async (trx) => {
      // Update keepCustomer with merged tags
      await trx
        .update(schema.customers)
        .set({ tags: mergedTags, updatedAt: new Date() })
        .where(eq(schema.customers.id, keepId));

      // Re-attribute notes from mergeCustomer to keepCustomer
      await trx
        .update(schema.customerNotes)
        .set({ customerId: keepId, updatedAt: new Date() })
        .where(and(eq(schema.customerNotes.customerId, mergeId), eq(schema.customerNotes.orgId, orgId)));

      // Re-attribute store credit accounts from mergeCustomer to keepCustomer
      await trx
        .update(schema.storeCreditAccounts)
        .set({ customerId: keepId, updatedAt: new Date() })
        .where(and(eq(schema.storeCreditAccounts.customerId, mergeId), eq(schema.storeCreditAccounts.orgId, orgId)));

      // Mark the merged customer as merged
      await trx
        .update(schema.customers)
        .set({ mergedIntoId: keepId, updatedAt: new Date() })
        .where(eq(schema.customers.id, mergeId));

      // Record in merge log
      const [mergeLogEntry] = await trx
        .insert(schema.customerMergeLog)
        .values({ orgId, keepId, mergedId: mergeId, mergedBy })
        .returning();

      return mergeLogEntry;
    });

    return reply.status(200).send({
      data: {
        mergeLog: log,
        keepId,
        mergeId,
        message: `Customer ${mergeId} has been merged into ${keepId}`,
      },
    });
  });
}
