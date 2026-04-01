import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { initClickHouseTables } from './clickhouse.js';
import { ingestOrder } from './ingest.js';
import {
  querySalesSummary,
  queryTopProducts,
  queryRevenueByHour,
  queryRevenueByChannel,
  queryRevenueByDay,
} from './queries.js';

// Extend FastifyInstance to include the `authenticate` decoration
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const app = Fastify({ logger: true, trustProxy: true });

const INTERNAL_SECRET = process.env['INTERNAL_SECRET'] ?? 'internal-dev-secret';

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
  });

  app.decorate(
    'authenticate',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      try {
        await request.jwtVerify({ issuer: 'elevatedpos-auth' });
      } catch {
        return reply.status(401).send({
          type: 'https://nexus.app/errors/unauthorized',
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

  app.get(
    '/api/v1/reports/sales',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId, from, to } = request.query as { orgId?: string; from?: string; to?: string };
      if (!orgId || !from || !to) {
        return reply.status(400).send({ error: 'orgId, from and to are required' });
      }
      const data = await querySalesSummary(orgId, from, to);
      return { data };
    },
  );

  app.get(
    '/api/v1/reports/products',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId, from, to, limit } = request.query as {
        orgId?: string;
        from?: string;
        to?: string;
        limit?: string;
      };
      if (!orgId || !from || !to) {
        return reply.status(400).send({ error: 'orgId, from and to are required' });
      }
      const data = await queryTopProducts(orgId, from, to, limit ? Number(limit) : 10);
      return { data };
    },
  );

  app.get(
    '/api/v1/reports/revenue-by-hour',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId, date } = request.query as { orgId?: string; date?: string };
      if (!orgId || !date) {
        return reply.status(400).send({ error: 'orgId and date are required' });
      }
      const data = await queryRevenueByHour(orgId, date);
      return { data };
    },
  );

  app.get(
    '/api/v1/reports/revenue-by-channel',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId, from, to } = request.query as { orgId?: string; from?: string; to?: string };
      if (!orgId || !from || !to) {
        return reply.status(400).send({ error: 'orgId, from and to are required' });
      }
      const data = await queryRevenueByChannel(orgId, from, to);
      return { data };
    },
  );

  app.get(
    '/api/v1/reports/revenue-by-day',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orgId, from, to } = request.query as { orgId?: string; from?: string; to?: string };
      if (!orgId || !from || !to) {
        return reply.status(400).send({ error: 'orgId, from and to are required' });
      }
      const data = await queryRevenueByDay(orgId, from, to);
      return { data };
    },
  );

  const port = Number(process.env['PORT'] ?? 4014);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Reporting service listening on port ${port}`);

  // Non-fatal ClickHouse table initialisation
  initClickHouseTables().catch((e) => {
    app.log.warn({ e }, '[reporting] ClickHouse init failed — continuing without analytics tables');
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
