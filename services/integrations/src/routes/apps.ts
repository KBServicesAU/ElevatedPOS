import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { MARKETPLACE_APPS } from '../lib/marketplace';

const installConfigSchema = z.object({
  config: z.record(z.unknown()).optional().default({}),
});

export async function appRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/integrations/apps — list marketplace apps with install status
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const installed = await db.query.installedApps.findMany({
      where: eq(schema.installedApps.orgId, orgId),
    });

    const installedIds = new Set(installed.map((i: typeof installed[number]) => i.appId));

    const apps = MARKETPLACE_APPS.map((app) => ({
      ...app,
      installed: installedIds.has(app.id),
      installRecord: installed.find((i: typeof installed[number]) => i.appId === app.id) ?? null,
    }));

    return reply.status(200).send({ data: apps, meta: { total: apps.length } });
  });

  // GET /api/v1/integrations/apps/:id — get single marketplace app detail
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const marketplaceApp = MARKETPLACE_APPS.find((a) => a.id === id);
    if (!marketplaceApp) {
      return reply.status(404).send({ title: 'App not found', status: 404 });
    }

    const installRecord = await db.query.installedApps.findFirst({
      where: and(eq(schema.installedApps.orgId, orgId), eq(schema.installedApps.appId, id)),
    });

    return reply.status(200).send({
      data: { ...marketplaceApp, installed: !!installRecord, installRecord: installRecord ?? null },
    });
  });

  // POST /api/v1/integrations/apps/:id/install — install a marketplace app
  app.post('/:id/install', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const marketplaceApp = MARKETPLACE_APPS.find((a) => a.id === id);
    if (!marketplaceApp) {
      return reply.status(404).send({ title: 'App not found', status: 404 });
    }

    const body = installConfigSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const existing = await db.query.installedApps.findFirst({
      where: and(eq(schema.installedApps.orgId, orgId), eq(schema.installedApps.appId, id)),
    });

    if (existing) {
      const [updated] = await db
        .update(schema.installedApps)
        .set({ config: body.data.config, enabled: true, updatedAt: new Date() })
        .where(eq(schema.installedApps.id, existing.id))
        .returning();
      return reply.status(200).send({ data: updated });
    }

    const [created] = await db
      .insert(schema.installedApps)
      .values({ orgId, appId: id, appName: marketplaceApp.name, config: body.data.config })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // DELETE /api/v1/integrations/apps/:id/uninstall — uninstall an app
  app.delete('/:id/uninstall', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    await db
      .delete(schema.installedApps)
      .where(and(eq(schema.installedApps.orgId, orgId), eq(schema.installedApps.appId, id)));

    return reply.status(204).send();
  });
}
