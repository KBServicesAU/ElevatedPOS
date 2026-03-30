import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { createConnector, getSupportedConnectors } from '../connectors/registry';
import type { ConnectorConfig, SyncResult } from '../connectors/base';
import type { ShopifyProductInput } from '../connectors/shopify';
import type { UberEatsConnector } from '../connectors/uberEats';
import type { ShopifyConnector } from '../connectors/shopify';

interface InstalledAppConfig {
  credentials?: Record<string, string>;
  lastSync?: SyncResult;
  [key: string]: unknown;
}

const acceptOrderSchema = z.object({
  prepTime: z.number().int().positive().default(15),
});

const denyOrderSchema = z.object({
  reason: z.string().min(1).default('Unable to fulfill order'),
});

const syncProductsSchema = z.object({
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sku: z.string(),
      price: z.number().nonnegative(),
      stock: z.number().int(),
      description: z.string().optional(),
      imageUrl: z.string().url().optional(),
    }),
  ),
});

async function loadConnectorConfig(
  orgId: string,
  appKey: string,
): Promise<ConnectorConfig | null> {
  const record = await db.query.installedApps.findFirst({
    where: and(
      eq(schema.installedApps.orgId, orgId),
      eq(schema.installedApps.appId, appKey),
      eq(schema.installedApps.enabled, true),
    ),
  });

  if (!record) return null;

  const config = (record.config ?? {}) as InstalledAppConfig;

  return {
    appKey,
    credentials: config.credentials ?? {},
    orgId,
  };
}

async function persistSyncResult(orgId: string, appKey: string, result: SyncResult): Promise<void> {
  const record = await db.query.installedApps.findFirst({
    where: and(eq(schema.installedApps.orgId, orgId), eq(schema.installedApps.appId, appKey)),
  });

  if (!record) return;

  const existingConfig = (record.config ?? {}) as InstalledAppConfig;

  await db
    .update(schema.installedApps)
    .set({
      config: { ...existingConfig, lastSync: result },
      updatedAt: new Date(),
    })
    .where(eq(schema.installedApps.id, record.id));
}

export async function connectorRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /api/v1/connectors — list supported connector appKeys
  app.get('/', async (_request, reply) => {
    return reply.status(200).send({ data: getSupportedConnectors() });
  });

  // GET /api/v1/connectors/:appKey/status — return last sync time and connection status
  app.get('/:appKey/status', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { appKey } = request.params as { appKey: string };

    if (!getSupportedConnectors().includes(appKey)) {
      return reply.status(404).send({ title: 'Connector not found', status: 404, detail: `No connector registered for appKey: ${appKey}` });
    }

    const record = await db.query.installedApps.findFirst({
      where: and(eq(schema.installedApps.orgId, orgId), eq(schema.installedApps.appId, appKey)),
    });

    if (!record) {
      return reply.status(404).send({ title: 'App not installed', status: 404, detail: `${appKey} is not installed for this organisation` });
    }

    const config = (record.config ?? {}) as InstalledAppConfig;
    const lastSync = config.lastSync ?? null;

    return reply.status(200).send({
      data: {
        appKey,
        installed: true,
        enabled: record.enabled,
        lastSyncAt: lastSync?.lastSyncAt ?? null,
        lastSyncSuccess: lastSync?.success ?? null,
        lastSyncErrors: lastSync?.errors ?? [],
        lastSyncRecordsProcessed: lastSync?.recordsProcessed ?? 0,
      },
    });
  });

  // POST /api/v1/connectors/:appKey/test — test connection using stored credentials
  app.post('/:appKey/test', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { appKey } = request.params as { appKey: string };

    if (!getSupportedConnectors().includes(appKey)) {
      return reply.status(404).send({ title: 'Connector not found', status: 404, detail: `No connector registered for appKey: ${appKey}` });
    }

    const connectorConfig = await loadConnectorConfig(orgId, appKey);
    if (!connectorConfig) {
      return reply.status(404).send({ title: 'App not installed', status: 404, detail: `${appKey} is not installed or enabled for this organisation` });
    }

    const connector = createConnector(appKey, connectorConfig);
    if (!connector) {
      return reply.status(404).send({ title: 'Connector not found', status: 404, detail: `No connector registered for appKey: ${appKey}` });
    }

    const result = await connector.testConnection();
    return reply.status(200).send({ data: result });
  });

  // POST /api/v1/connectors/:appKey/sync — run sync and persist result
  app.post('/:appKey/sync', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { appKey } = request.params as { appKey: string };

    if (!getSupportedConnectors().includes(appKey)) {
      return reply.status(404).send({ title: 'Connector not found', status: 404, detail: `No connector registered for appKey: ${appKey}` });
    }

    const connectorConfig = await loadConnectorConfig(orgId, appKey);
    if (!connectorConfig) {
      return reply.status(404).send({ title: 'App not installed', status: 404, detail: `${appKey} is not installed or enabled for this organisation` });
    }

    const connector = createConnector(appKey, connectorConfig);
    if (!connector) {
      return reply.status(404).send({ title: 'Connector not found', status: 404, detail: `No connector registered for appKey: ${appKey}` });
    }

    const result = await connector.sync();
    await persistSyncResult(orgId, appKey, result);

    return reply.status(200).send({ data: result });
  });

  // POST /api/v1/connectors/uber-eats/orders — return current Uber Eats active orders
  app.post('/uber-eats/orders', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const connectorConfig = await loadConnectorConfig(orgId, 'uber-eats');
    if (!connectorConfig) {
      return reply.status(404).send({ title: 'Uber Eats not installed', status: 404, detail: 'Uber Eats integration is not installed or enabled for this organisation' });
    }

    const connector = createConnector('uber-eats', connectorConfig) as UberEatsConnector | null;
    if (!connector) {
      return reply.status(404).send({ title: 'Connector not found', status: 404 });
    }

    const orders = await connector.getOrders();
    return reply.status(200).send({ data: orders, meta: { total: orders.length } });
  });

  // POST /api/v1/connectors/uber-eats/orders/:orderId/accept — accept an Uber Eats order
  app.post('/uber-eats/orders/:orderId/accept', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { orderId } = request.params as { orderId: string };

    const body = acceptOrderSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const connectorConfig = await loadConnectorConfig(orgId, 'uber-eats');
    if (!connectorConfig) {
      return reply.status(404).send({ title: 'Uber Eats not installed', status: 404, detail: 'Uber Eats integration is not installed or enabled for this organisation' });
    }

    const connector = createConnector('uber-eats', connectorConfig) as UberEatsConnector | null;
    if (!connector) {
      return reply.status(404).send({ title: 'Connector not found', status: 404 });
    }

    await connector.acceptOrder(orderId, body.data.prepTime);
    return reply.status(200).send({ data: { orderId, accepted: true, prepTime: body.data.prepTime } });
  });

  // POST /api/v1/connectors/uber-eats/orders/:orderId/deny — deny an Uber Eats order
  app.post('/uber-eats/orders/:orderId/deny', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { orderId } = request.params as { orderId: string };

    const body = denyOrderSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const connectorConfig = await loadConnectorConfig(orgId, 'uber-eats');
    if (!connectorConfig) {
      return reply.status(404).send({ title: 'Uber Eats not installed', status: 404, detail: 'Uber Eats integration is not installed or enabled for this organisation' });
    }

    const connector = createConnector('uber-eats', connectorConfig) as UberEatsConnector | null;
    if (!connector) {
      return reply.status(404).send({ title: 'Connector not found', status: 404 });
    }

    await connector.denyOrder(orderId, body.data.reason);
    return reply.status(200).send({ data: { orderId, denied: true, reason: body.data.reason } });
  });

  // POST /api/v1/connectors/shopify/sync-products — push products to Shopify
  app.post('/shopify/sync-products', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const body = syncProductsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://nexus.app/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const connectorConfig = await loadConnectorConfig(orgId, 'shopify');
    if (!connectorConfig) {
      return reply.status(404).send({ title: 'Shopify not installed', status: 404, detail: 'Shopify integration is not installed or enabled for this organisation' });
    }

    const connector = createConnector('shopify', connectorConfig) as ShopifyConnector | null;
    if (!connector) {
      return reply.status(404).send({ title: 'Connector not found', status: 404 });
    }

    const result = await connector.syncProducts(body.data.products as ShopifyProductInput[]);
    return reply.status(200).send({ data: result });
  });
}
