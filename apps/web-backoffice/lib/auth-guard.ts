/**
 * v2.7.68 — Server-side auth guard for Next.js Route Handlers.
 *
 * The lib/session.ts helper decodes the JWT WITHOUT verifying its
 * signature, which is fine for "show me the user's name in the header"
 * but unsafe as a gate on routes that mint Stripe charges, capture
 * PaymentIntents, issue Terminal connection tokens, etc.
 *
 * Three Next.js routes under app/api/stripe/* were previously unauthed
 * — anyone on the public internet could POST to them and create real
 * Stripe charges against the platform's STRIPE_SECRET_KEY (see the
 * v2.7.68 bug audit). This helper closes that hole.
 *
 * Auth sources, in priority order:
 *   1. `Authorization: Bearer <jwt>` header — used by the mobile apps
 *      (POS / Kiosk) which carry their device JWT.
 *   2. `elevatedpos_token` cookie — used by the web-backoffice browser
 *      session.
 *
 * Either way the JWT is verified against `JWT_SECRET` (HS256) before
 * the request proceeds. Returns the verified payload on success or
 * a `Response` with 401 on failure (caller should `if (!ok) return ok`
 * the response straight back).
 */
import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import jwt, { type JwtPayload } from 'jsonwebtoken';

export interface VerifiedSession {
  /** Subject — usually employee.id or device.id depending on the token type. */
  sub: string;
  /** Org scope. Required for multi-tenant gating downstream. */
  orgId?: string;
  /** Token type from auth-service: 'employee' | 'device' | 'platform' | 'system'. */
  type?: string;
  /** Anything else the auth service signed in. */
  [key: string]: unknown;
}

/**
 * Verify the request is authenticated. Returns the decoded payload, or a
 * 401 Response if not. Idiomatic usage:
 *
 *     const auth = await requireAuth(req);
 *     if (auth instanceof Response) return auth;
 *     // safe to use auth.sub / auth.orgId from here on
 */
export async function requireAuth(req: NextRequest): Promise<VerifiedSession | Response> {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    // Fail closed — without a secret we cannot verify anything. This should
    // never happen in production (the deployment fails earlier without it),
    // but guard against the misconfigured-staging case.
    return Response.json(
      { error: 'Server misconfigured: JWT_SECRET missing' },
      { status: 500 },
    );
  }

  // 1) Authorization header (mobile + service-to-service)
  let token: string | undefined;
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  }

  // 2) Session cookie (browser)
  if (!token) {
    const cookieStore = cookies();
    token = cookieStore.get('elevatedpos_token')?.value;
  }

  if (!token) {
    return Response.json(
      { error: 'Unauthorized', detail: 'No bearer token or session cookie present.' },
      { status: 401 },
    );
  }

  try {
    // The auth service signs with `issuer: 'elevatedpos-auth'` (see
    // services/auth/src/index.ts JWT registration). Verify both the
    // signature and the issuer claim so a JWT minted by some other
    // service that happens to share JWT_SECRET (e.g. a future
    // device-token signer) cannot impersonate an auth-service token.
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'elevatedpos-auth',
    }) as JwtPayload;

    if (typeof payload !== 'object' || !payload.sub) {
      return Response.json(
        { error: 'Unauthorized', detail: 'Token payload missing sub claim.' },
        { status: 401 },
      );
    }

    return payload as VerifiedSession;
  } catch (err) {
    const detail =
      err instanceof jwt.TokenExpiredError ? 'Token expired'
      : err instanceof jwt.JsonWebTokenError ? 'Token signature invalid'
      : 'Token verification failed';
    return Response.json({ error: 'Unauthorized', detail }, { status: 401 });
  }
}
