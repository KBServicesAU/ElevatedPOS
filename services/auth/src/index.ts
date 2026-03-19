import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { db } from './db';
import { authRoutes } from './routes/auth';
import { employeeRoutes } from './routes/employees';
import { roleRoutes } from './routes/roles';

const app = Fastify({
  logger: {
    level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
  },
  requestIdHeader: 'x-request-id',
  trustProxy: true,
});

async function start() {
  await app.register(helmet);
  await app.register(cors, {
    origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });
  await app.register(sensible);
  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    sign: {
      expiresIn: process.env['JWT_ACCESS_EXPIRY'] ?? '15m',
      issuer: 'nexus-auth',
    },
    verify: {
      issuer: 'nexus-auth',
    },
  });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(employeeRoutes, { prefix: '/api/v1/employees' });
  await app.register(roleRoutes, { prefix: '/api/v1/roles' });

  app.get('/health', async () => ({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() }));

  const port = Number(process.env['PORT'] ?? 4001);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Auth service listening on port ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
