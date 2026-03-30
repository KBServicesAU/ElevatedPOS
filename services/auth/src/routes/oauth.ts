import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { db, schema } from '../db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/** Parse Basic Auth header: "Basic base64(clientId:clientSecret)" */
function parseBasicAuth(authHeader: string | undefined): { clientId: string; clientSecret: string } | null {
  if (!authHeader?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon === -1) return null;
    return { clientId: decoded.slice(0, colon), clientSecret: decoded.slice(colon + 1) };
  } catch {
    return null;
  }
}

async function resolveClient(
  authHeader: string | undefined,
  bodyClientId?: string,
  bodyClientSecret?: string,
): Promise<typeof schema.oauthClients.$inferSelect | null> {
  let clientId: string | undefined;
  let clientSecret: string | undefined;

  const basic = parseBasicAuth(authHeader);
  if (basic) {
    clientId = basic.clientId;
    clientSecret = basic.clientSecret;
  } else if (bodyClientId && bodyClientSecret) {
    clientId = bodyClientId;
    clientSecret = bodyClientSecret;
  }

  if (!clientId || !clientSecret) return null;

  const client = await db.query.oauthClients.findFirst({
    where: and(eq(schema.oauthClients.clientId, clientId), eq(schema.oauthClients.isActive, true)),
  });

  if (!client) return null;
  if (client.clientSecret !== hashSecret(clientSecret)) return null;
  return client;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function oauthRoutes(app: FastifyInstance) {
  // NOTE: No app.addHook('onRequest', app.authenticate) here.
  // OAuth endpoints use their own client_id/secret auth logic.

  // GET /api/v1/oauth/authorize
  // Returns consent screen data for the client to render
  app.get('/authorize', async (request, reply) => {
    const q = request.query as {
      client_id?: string;
      redirect_uri?: string;
      scope?: string;
      response_type?: string;
      state?: string;
    };

    if (q.response_type !== 'code') {
      return reply.status(400).send({ error: 'unsupported_response_type', error_description: 'Only response_type=code is supported' });
    }
    if (!q.client_id) {
      return reply.status(400).send({ error: 'invalid_request', error_description: 'client_id is required' });
    }
    if (!q.redirect_uri) {
      return reply.status(400).send({ error: 'invalid_request', error_description: 'redirect_uri is required' });
    }

    const client = await db.query.oauthClients.findFirst({
      where: and(eq(schema.oauthClients.clientId, q.client_id), eq(schema.oauthClients.isActive, true)),
    });

    if (!client) {
      return reply.status(400).send({ error: 'invalid_client', error_description: 'Unknown or inactive client' });
    }

    const allowedUris = client.redirectUris as string[];
    if (!allowedUris.includes(q.redirect_uri)) {
      return reply.status(400).send({ error: 'invalid_request', error_description: 'redirect_uri not registered for this client' });
    }

    const requestedScopes = q.scope ? q.scope.split(' ') : [];
    const allowedScopes = client.scopes as string[];
    const invalidScopes = requestedScopes.filter((s) => !allowedScopes.includes(s));
    if (invalidScopes.length > 0) {
      return reply.status(400).send({ error: 'invalid_scope', error_description: `Scopes not allowed: ${invalidScopes.join(', ')}` });
    }

    return reply.status(200).send({
      clientName: client.name,
      requestedScopes,
      authorizeUrl: `/api/v1/oauth/authorize`,
      clientId: q.client_id,
      redirectUri: q.redirect_uri,
      state: q.state ?? null,
    });
  });

  // POST /api/v1/oauth/authorize
  // User approves — creates auth code and redirects
  app.post('/authorize', async (request, reply) => {
    const bodySchema = z.object({
      client_id: z.string(),
      redirect_uri: z.string().url(),
      scope: z.string().default(''),
      state: z.string().optional(),
      user_id: z.string().uuid(), // The authenticated user approving the request
      org_id: z.string().uuid(),
    });

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', error_description: body.error.message });
    }

    const client = await db.query.oauthClients.findFirst({
      where: and(eq(schema.oauthClients.clientId, body.data.client_id), eq(schema.oauthClients.isActive, true)),
    });

    if (!client) {
      return reply.status(400).send({ error: 'invalid_client', error_description: 'Unknown or inactive client' });
    }

    const allowedUris = client.redirectUris as string[];
    if (!allowedUris.includes(body.data.redirect_uri)) {
      return reply.status(400).send({ error: 'invalid_request', error_description: 'redirect_uri not registered' });
    }

    const scopes = body.data.scope ? body.data.scope.split(' ').filter(Boolean) : [];
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(schema.oauthAuthCodes).values({
      clientId: client.id,
      userId: body.data.user_id,
      orgId: body.data.org_id,
      scopes,
      code,
      redirectUri: body.data.redirect_uri,
      expiresAt,
    });

    const redirectUrl = new URL(body.data.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (body.data.state) redirectUrl.searchParams.set('state', body.data.state);

    return reply.status(302).redirect(redirectUrl.toString());
  });

  // POST /api/v1/oauth/token
  app.post('/token', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const grantType = body['grant_type'];

    reply.header('Cache-Control', 'no-store');
    reply.header('Pragma', 'no-cache');

    // ── authorization_code ───────────────────────────────────────────────────
    if (grantType === 'authorization_code') {
      const client = await resolveClient(
        request.headers.authorization,
        body['client_id'],
        body['client_secret'],
      );
      if (!client) {
        return reply.status(401).send({ error: 'invalid_client', error_description: 'Client authentication failed' });
      }

      const { code, redirect_uri } = body;
      if (!code || !redirect_uri) {
        return reply.status(400).send({ error: 'invalid_request', error_description: 'code and redirect_uri are required' });
      }

      const authCode = await db.query.oauthAuthCodes.findFirst({
        where: and(
          eq(schema.oauthAuthCodes.code, code),
          eq(schema.oauthAuthCodes.clientId, client.id),
        ),
      });

      if (!authCode) {
        return reply.status(400).send({ error: 'invalid_grant', error_description: 'Invalid authorization code' });
      }
      if (authCode.usedAt) {
        return reply.status(400).send({ error: 'invalid_grant', error_description: 'Authorization code already used' });
      }
      if (new Date() > authCode.expiresAt) {
        return reply.status(400).send({ error: 'invalid_grant', error_description: 'Authorization code expired' });
      }
      if (authCode.redirectUri !== redirect_uri) {
        return reply.status(400).send({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
      }

      // Mark code as used
      await db.update(schema.oauthAuthCodes).set({ usedAt: new Date() }).where(eq(schema.oauthAuthCodes.id, authCode.id));

      const accessToken = generateToken();
      const refreshToken = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await db.insert(schema.oauthTokens).values({
        clientId: client.id,
        userId: authCode.userId,
        orgId: authCode.orgId,
        accessToken,
        refreshToken,
        scopes: authCode.scopes,
        expiresAt,
      });

      return reply.status(200).send({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        refresh_token: refreshToken,
        scope: (authCode.scopes as string[]).join(' '),
      });
    }

    // ── refresh_token ─────────────────────────────────────────────────────────
    if (grantType === 'refresh_token') {
      const client = await resolveClient(
        request.headers.authorization,
        body['client_id'],
        body['client_secret'],
      );
      if (!client) {
        return reply.status(401).send({ error: 'invalid_client', error_description: 'Client authentication failed' });
      }

      const { refresh_token } = body;
      if (!refresh_token) {
        return reply.status(400).send({ error: 'invalid_request', error_description: 'refresh_token is required' });
      }

      const existingToken = await db.query.oauthTokens.findFirst({
        where: and(
          eq(schema.oauthTokens.refreshToken, refresh_token),
          eq(schema.oauthTokens.clientId, client.id),
        ),
      });

      if (!existingToken || existingToken.revokedAt) {
        return reply.status(400).send({ error: 'invalid_grant', error_description: 'Invalid or revoked refresh token' });
      }

      // Revoke old token
      await db.update(schema.oauthTokens).set({ revokedAt: new Date() }).where(eq(schema.oauthTokens.id, existingToken.id));

      const accessToken = generateToken();
      const newRefreshToken = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(schema.oauthTokens).values({
        clientId: client.id,
        userId: existingToken.userId,
        orgId: existingToken.orgId,
        accessToken,
        refreshToken: newRefreshToken,
        scopes: existingToken.scopes,
        expiresAt,
      });

      return reply.status(200).send({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        refresh_token: newRefreshToken,
        scope: (existingToken.scopes as string[]).join(' '),
      });
    }

    // ── client_credentials ────────────────────────────────────────────────────
    if (grantType === 'client_credentials') {
      const client = await resolveClient(
        request.headers.authorization,
        body['client_id'],
        body['client_secret'],
      );
      if (!client) {
        return reply.status(401).send({ error: 'invalid_client', error_description: 'Client authentication failed' });
      }

      const requestedScopes = body['scope'] ? body['scope'].split(' ').filter(Boolean) : (client.scopes as string[]);
      const allowedScopes = client.scopes as string[];
      const invalidScopes = requestedScopes.filter((s) => !allowedScopes.includes(s));
      if (invalidScopes.length > 0) {
        return reply.status(400).send({ error: 'invalid_scope', error_description: `Scopes not allowed: ${invalidScopes.join(', ')}` });
      }

      const accessToken = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const orgId = client.orgId ?? '00000000-0000-0000-0000-000000000000';

      await db.insert(schema.oauthTokens).values({
        clientId: client.id,
        userId: null,
        orgId,
        accessToken,
        refreshToken: null,
        scopes: requestedScopes,
        expiresAt,
      });

      return reply.status(200).send({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        scope: requestedScopes.join(' '),
      });
    }

    return reply.status(400).send({ error: 'unsupported_grant_type', error_description: `Grant type '${grantType}' is not supported` });
  });

  // POST /api/v1/oauth/revoke
  app.post('/revoke', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const { token } = body;

    if (!token) {
      return reply.status(400).send({ error: 'invalid_request', error_description: 'token is required' });
    }

    const client = await resolveClient(
      request.headers.authorization,
      body['client_id'],
      body['client_secret'],
    );
    if (!client) {
      return reply.status(401).send({ error: 'invalid_client', error_description: 'Client authentication failed' });
    }

    // Try revoke as access_token or refresh_token
    await db
      .update(schema.oauthTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.oauthTokens.clientId, client.id),
          eq(schema.oauthTokens.accessToken, token),
        ),
      );

    await db
      .update(schema.oauthTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.oauthTokens.clientId, client.id),
          eq(schema.oauthTokens.refreshToken, token),
        ),
      );

    // Per RFC 7009: always return 200 even if token not found
    return reply.status(200).send({});
  });

  // GET /api/v1/oauth/introspect — RFC 7662 Token Introspection
  app.post('/introspect', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const { token } = body;

    if (!token) {
      return reply.status(400).send({ error: 'invalid_request', error_description: 'token is required' });
    }

    const client = await resolveClient(
      request.headers.authorization,
      body['client_id'],
      body['client_secret'],
    );
    if (!client) {
      return reply.status(401).send({ error: 'invalid_client', error_description: 'Client authentication failed' });
    }

    const tokenRecord = await db.query.oauthTokens.findFirst({
      where: eq(schema.oauthTokens.accessToken, token),
    });

    if (!tokenRecord || tokenRecord.revokedAt || new Date() > tokenRecord.expiresAt) {
      return reply.status(200).send({ active: false });
    }

    return reply.status(200).send({
      active: true,
      client_id: client.clientId,
      username: tokenRecord.userId ?? undefined,
      scope: (tokenRecord.scopes as string[]).join(' '),
      exp: Math.floor(tokenRecord.expiresAt.getTime() / 1000),
      iat: Math.floor(tokenRecord.createdAt.getTime() / 1000),
      sub: tokenRecord.userId ?? undefined,
      org_id: tokenRecord.orgId,
    });
  });
}
