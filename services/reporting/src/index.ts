import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { getRedisClient } from '@nexus/config';
import { initClickHouseTables } from './clickhouse.js';
import { ingestOrder } from './ingest.js';
import { startKafkaConsumer } from './consumer.js';
import {
  querySalesSummary,
  queryTopProducts,
  queryRevenueByHour,
  queryRevenueByChannel,
  queryRevenueByDay,
  queryToday,
} from './queries.js';

// Extend FastifyInstance to include the `authenticate` decoration
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const app = Fastify({ logger: true, trustProxy: true });

const INTERNAL_SECRET = process.env['INTERNAL_SECRET'];
if (!INTERNAL_SECRET) {
  throw new Error('INTERNAL_SECRET environment variable is required');
}

async function start() {
  await app.register(helmet);
  await app.register(cors, {
    origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  await app.register(sensible);
  const redis = getRedisClient();
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    ...(redis ? { redis } : {}),
  });
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
  await app.register(jwt, {
    secret: jwtSecret,
  });

  app.decorate(
    'authenticate',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          type: 'https://elevatedpos.com/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
        });
      }
    },
  );

  // ─── Health ────────────────────────────────────────────────────────────────

  app.get('/health', async () => ({ status: 'ok', service: 'reporting' }));

  // ─── Ingest — internal only ────────────────────────────────────────────────

  app.post('/api/v1/reports/ingest/order', async (request, reply) => {
    const internalSecret = request.headers['x-internal-secret'];
    if (internalSecret !== INTERNAL_SECRET) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    try {
      const order = request.body as Parameters<typeof ingestOrder>[0];
      await ingestOrder(order);
      return reply.status(202).send({ accepted: true });
    } catch (e) {
      app.log.warn({ e }, '[reporting] ingest error');
      return reply.status(500).send({ error: 'Ingest failed' });
    }
  });

  // ─── Report routes (authenticated) ────────────────────────────────────────

  // GET /api/v1/reports/today — used by the mobile dashboard
  // Returns salesToday, ordersToday, pendingOrders for the current calendar day.
  app.get(
    '/api/v1/reports/today',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId: userOrgId } = request.user as { orgId: string };
      const { orgId, locationId } = request.query as { orgId?: string; locationId?: string };
      const requestedOrgId = orgId ?? userOrgId;
      if (requestedOrgId !== userOrgId) {
        return reply.status(403).send({ title: 'Access denied to this organisation\'s reports', status: 403 });
      }

      // Fetch pending orders count from the orders service using the caller's JWT token (best-effort)
      let pendingOrdersCount = 0;
      try {
        const ordersUrl = process.env['ORDERS_SERVICE_URL'] ?? 'http://orders:4004';
        const forwardedToken = (request.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '') ?? '';
        const locationParam = locationId ? `&locationId=${encodeURIComponent(locationId)}` : '';
        const ordersRes = await fetch(
          `${ordersUrl}/api/v1/orders?status=open&limit=1${locationParam}`,
          {
            headers: { 'Authorization': `Bearer ${forwardedToken}` },
            signal: AbortSignal.timeout(3000),
          },
        );
        if (ordersRes.ok) {
          const body = await ordersRes.json() as { meta?: { totalCount?: number }; data?: unknown[] };
          pendingOrdersCount = body.meta?.totalCount ?? (Array.isArray(body.data) ? body.data.length : 0);
        }
      } catch {
        // Non-fatal — dashboard shows 0 pending if orders service is unreachable
      }

      const data = await queryToday(requestedOrgId, locationId, pendingOrdersCount);
      return { data };
    },
  );

  app.get(
    '/api/v1/reports/sales',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId: userOrgId } = request.user as { orgId: string };
      const { orgId, from, to } = request.query as { orgId?: string; from?: string; to?: string };
      const requestedOrgId = orgId ?? userOrgId;
      if (requestedOrgId !== userOrgId) {
        return reply.status(403).send({ title: 'Access denied to this organisation\'s reports', status: 403 });
      }
      if (!requestedOrgId || !from || !to) {
        return reply.status(400).send({ error: 'orgId, from and to are required' });
      }
      const data = await querySalesSummary(requestedOrgId, from, to);
      return { data };
    },
  );

  app.get(
    '/api/v1/reports/products',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId: userOrgId } = request.user as { orgId: string };
      const { orgId, from, to, limit } = request.query as {
        orgId?: string;
        from?: string;
        to?: string;
        limit?: string;
      };
      const requestedOrgId = orgId ?? userOrgId;
      if (requestedOrgId !== userOrgId) {
        return reply.status(403).send({ title: 'Access denied to this organisation\'s reports', status: 403 });
      }
      if (!requestedOrgId || !from || !to) {
        return reply.status(400).send({ error: 'orgId, from and to are required' });
      }
      const data = await queryTopProducts(requestedOrgId, from, to, limit ? Number(limit) : 10);
      return { data };
    },
  );

  app.get(
    '/api/v1/reports/revenue-by-hour',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId: userOrgId } = request.user as { orgId: string };
      const { orgId, date } = request.query as { orgId?: string; date?: string };
      const requestedOrgId = orgId ?? userOrgId;
      if (requestedOrgId !== userOrgId) {
        return reply.status(403).send({ title: 'Access denied to this organisation\'s reports', status: 403 });
      }
      if (!requestedOrgId || !date) {
        return reply.status(400).send({ error: 'orgId and date are required' });
      }
      const data = await queryRevenueByHour(requestedOrgId, date);
      return { data };
    },
  );

  app.get(
    '/api/v1/reports/revenue-by-channel',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId: userOrgId } = request.user as { orgId: string };
      const { orgId, from, to } = request.query as { orgId?: string; from?: string; to?: string };
      const requestedOrgId = orgId ?? userOrgId;
      if (requestedOrgId !== userOrgId) {
        return reply.status(403).send({ title: 'Access denied to this organisation\'s reports', status: 403 });
      }
      if (!requestedOrgId || !from || !to) {
        return reply.status(400).send({ error: 'orgId, from and to are required' });
      }
      const data = await queryRevenueByChannel(requestedOrgId, from, to);
      return { data };
    },
  );

  app.get(
    '/api/v1/reports/revenue-by-day',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId: userOrgId } = request.user as { orgId: string };
      const { orgId, from, to } = request.query as { orgId?: string; from?: string; to?: string };
      const requestedOrgId = orgId ?? userOrgId;
      if (requestedOrgId !== userOrgId) {
        return reply.status(403).send({ title: 'Access denied to this organisation\'s reports', status: 403 });
      }
      if (!requestedOrgId || !from || !to) {
        return reply.status(400).send({ error: 'orgId, from and to are required' });
      }
      const data = await queryRevenueByDay(requestedOrgId, from, to);
      return { data };
    },
  );

  // Non-fatal ClickHouse table initialisation — must complete before accepting traffic
  try {
    await initClickHouseTables();
  } catch (err) {
    app.log.warn({ err }, '[reporting] ClickHouse init warning — continuing without analytics tables');
  }

  // Start the Kafka consumer that drives live sales ingestion into ClickHouse.
  // Non-fatal if Kafka is unavailable — HTTP routes and the /ingest/order fallback still work.
  try {
    await startKafkaConsumer();
  } catch (err) {
    app.log.warn({ err }, '[reporting] Kafka consumer failed to start — live sales ingestion disabled');
  }

  const port = Number(process.env['PORT'] ?? 4014);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Reporting service listening on port ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
