import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';

const app = Fastify({ logger: true, trustProxy: true });

async function start() {
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(jwt, { secret: process.env['JWT_SECRET'] ?? 'dev-secret', verify: { issuer: 'nexus-auth' } });
  app.decorate('authenticate', async (request: Parameters<typeof app.authenticate>[0], reply: Parameters<typeof app.authenticate>[1]) => {
    try { await request.jwtVerify(); } catch { return reply.status(401).send({ title: 'Unauthorized', status: 401 }); }
  });

  app.get('/api/v1/integrations/apps', { onRequest: [app.authenticate] }, async (_request, reply) => {
    return reply.status(200).send({ data: [] });
  });

  app.post('/api/v1/integrations/webhooks', { onRequest: [app.authenticate] }, async (request, reply) => {
    return reply.status(201).send({ data: { id: 'wh_placeholder' } });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'integrations' }));
  await app.listen({ port: Number(process.env['PORT'] ?? 4010), host: '0.0.0.0' });
}

start().catch((err) => { console.error(err); process.exit(1); });
