import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { getRedisClient } from '@nexus/config';
import { isBlacklisted } from './lib/tokens';
import { authRoutes } from './routes/auth';
import { employeeRoutes } from './routes/employees';
import { roleRoutes } from './routes/roles';
import { approvalRoutes } from './routes/approvals';
import { timeClockRoutes } from './routes/timeClock';
import { oauthRoutes } from './routes/oauth';
import { locationRoutes } from './routes/locations';
import { payrollRoutes } from './routes/payroll';
import { deviceRoutes } from './routes/devices';

// Type augmentation — allows app.authenticate to be used as a preHandler
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}


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
  const redis = getRedisClient();
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    ...(redis ? { redis } : {}),
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' }),
  });
  await app.register(sensible);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(jwt as any, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    sign: {
      expiresIn: process.env['JWT_ACCESS_EXPIRY'] ?? '15m',
      issuer: 'elevatedpos-auth',
    },
    verify: {
      issuer: 'elevatedpos-auth',
    },
  });

  app.decorate('authenticate', async (
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => {
    try {
      await request.jwtVerify();
      const payload = request.user as { jti?: string };
      if (payload.jti && await isBlacklisted(payload.jti)) {
        return reply.status(401).send({
          type: 'https://nexus.app/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
          detail: 'Token has been revoked.',
        });
      }
    } catch {
      return reply.status(401).send({
        type: 'https://nexus.app/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
      });
    }
  });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(employeeRoutes, { prefix: '/api/v1/employees' });
  await app.register(roleRoutes, { prefix: '/api/v1/roles' });
  await app.register(approvalRoutes, { prefix: '/api/v1/approvals' });
  await app.register(timeClockRoutes, { prefix: '/api/v1/time-clock' });
  // OAuth 2.0 — no JWT authenticate hook; uses its own client_id/secret auth
  await app.register(oauthRoutes, { prefix: '/api/v1/oauth' });
  await app.register(locationRoutes, { prefix: '/api/v1/locations' });
  await app.register(payrollRoutes, { prefix: '/api/v1/payroll' });
  await app.register(deviceRoutes, { prefix: '/api/v1/devices' });

  app.get('/health', async () => ({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() }));

  const port = Number(process.env['PORT'] ?? 4001);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Auth service listening on port ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
