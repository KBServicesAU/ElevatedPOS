import { type FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

/**
 * Settings routes — /api/v1/settings
 *
 * Provides a generic key-value settings surface backed by the
 * organisations.settings JSONB column.  Every sub-path
 * (receipts, tax, notifications, hours, …) is stored as a key under
 * that column so no migrations are needed for new settings sections.
 *
 * The /organisation sub-route is slightly special because several of
 * its fields (name, abn, currency, timezone) have dedicated columns
 * in the organisations table; the rest spill into settings.
 *
 * Supported routes (all require a valid Bearer JWT):
 *   GET  /api/v1/settings/organisation
 *   PUT  /api/v1/settings/organisation
 *   GET  /api/v1/settings/:key          — generic JSONB key read
 *   PUT  /api/v1/settings/:key          — generic JSONB key write (merges)
 */
export async function settingsRoutes(app: FastifyInstance) {

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function getOrgSettings(orgId: string) {
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, orgId),
      columns: { settings: true },
    });
    return (org?.settings ?? {}) as Record<string, unknown>;
  }

  async function setOrgKey(
    orgId: string,
    key: string,
    value: unknown,
  ): Promise<Record<string, unknown>> {
    const current = await getOrgSettings(orgId);
    const merged = { ...current, [key]: value };
    const [updated] = await db
      .update(schema.organisations)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(schema.organisations.id, orgId))
      .returning({ settings: schema.organisations.settings });
    return ((updated?.settings ?? merged) as Record<string, unknown>);
  }

  // ── GET /organisation ──────────────────────────────────────────────────────

  app.get('/organisation', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, orgId),
      columns: { name: true, abn: true, currency: true, timezone: true, settings: true },
    });

    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    const extra = (org.settings ?? {}) as Record<string, unknown>;

    return reply.send({
      businessName:     org.name,
      abn:              org.abn          ?? '',
      currency:         org.currency,
      timezone:         org.timezone,
      website:          (extra['website']          as string) ?? '',
      phone:            (extra['phone']            as string) ?? '',
      address:          (extra['address']          as string) ?? '',
      businessType:     (extra['businessType']     as string) ?? 'hospitality',
      financialYearEnd: (extra['financialYearEnd'] as string) ?? '06-30',
    });
  });

  // ── PUT /organisation ──────────────────────────────────────────────────────

  app.put('/organisation', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const {
      businessName, abn, currency, timezone,
      website, phone, address, businessType, financialYearEnd,
    } = request.body as Record<string, string | undefined>;

    const existing = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, orgId),
      columns: { settings: true },
    });
    if (!existing) return reply.status(404).send({ error: 'Organisation not found' });

    const currentExtra = (existing.settings ?? {}) as Record<string, unknown>;
    const newExtra: Record<string, unknown> = {
      ...currentExtra,
      ...(website          !== undefined && { website }),
      ...(phone            !== undefined && { phone }),
      ...(address          !== undefined && { address }),
      ...(businessType     !== undefined && { businessType }),
      ...(financialYearEnd !== undefined && { financialYearEnd }),
    };

    const colUpdates: Record<string, unknown> = {
      updatedAt: new Date(),
      settings: newExtra,
    };
    if (businessName !== undefined) colUpdates['name']     = businessName;
    if (abn          !== undefined) colUpdates['abn']      = abn || null;
    if (currency     !== undefined) colUpdates['currency'] = currency;
    if (timezone     !== undefined) colUpdates['timezone'] = timezone;

    const [updated] = await db
      .update(schema.organisations)
      .set(colUpdates)
      .where(eq(schema.organisations.id, orgId))
      .returning({
        name: schema.organisations.name,
        abn: schema.organisations.abn,
        currency: schema.organisations.currency,
        timezone: schema.organisations.timezone,
        settings: schema.organisations.settings,
      });

    if (!updated) return reply.status(404).send({ error: 'Organisation not found' });

    const savedExtra = (updated.settings ?? {}) as Record<string, unknown>;

    return reply.send({
      businessName:     updated.name,
      abn:              updated.abn          ?? '',
      currency:         updated.currency,
      timezone:         updated.timezone,
      website:          (savedExtra['website']          as string) ?? '',
      phone:            (savedExtra['phone']            as string) ?? '',
      address:          (savedExtra['address']          as string) ?? '',
      businessType:     (savedExtra['businessType']     as string) ?? 'hospitality',
      financialYearEnd: (savedExtra['financialYearEnd'] as string) ?? '06-30',
    });
  });

  // ── Generic GET /:key ──────────────────────────────────────────────────────
  // Reads settings[key] from the org's JSONB column.
  // Returns {} (empty object) if the key has never been written.

  app.get('/:key', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { key } = request.params as { key: string };

    const allSettings = await getOrgSettings(orgId);
    const value = allSettings[key];

    // Return the stored value, or an empty object so the frontend
    // can safely spread it without null-checking.
    return reply.send(value ?? {});
  });

  // ── Generic PUT /:key ──────────────────────────────────────────────────────
  // Replaces settings[key] with the request body.

  app.put('/:key', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { key } = request.params as { key: string };
    const body = request.body as unknown;

    await setOrgKey(orgId, key, body);

    return reply.send(body);
  });
}
