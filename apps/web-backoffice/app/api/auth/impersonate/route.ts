import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt, { type JwtPayload } from 'jsonwebtoken';

/**
 * POST /api/auth/impersonate
 * Accepts a platform-issued impersonation access token and sets it as the
 * session cookie so support staff can browse as the merchant.
 *
 * v2.7.68 — was previously accepting ANY string ≥ 20 chars and writing it
 * verbatim to the `elevatedpos_token` cookie. Combined with the dashboard
 * middleware decoding JWT payload WITHOUT signature verification (see
 * middleware.ts isTokenExpired), an attacker could:
 *   1. Mint their own JWT with a future `exp` and any `sub` they wanted
 *      (no signature, since no one verified).
 *   2. POST it to this endpoint → cookie set.
 *   3. Browse the dashboard authenticated as the impersonated user.
 * The login page also auto-submits `?impersonate=…` query strings to this
 * endpoint on mount (apps/web-backoffice/app/login/page.tsx), turning
 * a malicious link into a one-click drive-by login.
 *
 * Now:
 *   - The token MUST be a valid HS256 JWT signed with JWT_SECRET (i.e.,
 *     issued by services/auth/src/routes/platform.ts).
 *   - It MUST carry `impersonatedBy` and `iss === 'elevatedpos-auth'` so
 *     a regular login token can't be repurposed via this endpoint.
 *   - It MUST not be expired.
 * The downstream dashboard middleware still sees a properly-signed token
 * and (separately, in middleware.ts:11-23) needs to be upgraded to verify
 * the signature too — that's tracked as C4 in the same audit batch.
 */
export async function POST(request: NextRequest) {
  const { token } = (await request.json()) as { token?: string };

  if (!token || typeof token !== 'string' || token.length < 20) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    // Fail closed — without a secret we can't verify, so we won't trust.
    return NextResponse.json(
      { error: 'Server misconfigured: JWT_SECRET missing' },
      { status: 500 },
    );
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'elevatedpos-auth',
    }) as JwtPayload;
  } catch (err) {
    const detail =
      err instanceof jwt.TokenExpiredError ? 'Impersonation token expired'
      : err instanceof jwt.JsonWebTokenError ? 'Impersonation token signature invalid'
      : 'Impersonation token verification failed';
    return NextResponse.json({ error: 'Invalid token', detail }, { status: 401 });
  }

  // Defence-in-depth: only accept tokens that carry the impersonatedBy
  // claim, which only `services/auth/src/routes/platform.ts:401` mints.
  // A regular login JWT is signed with the same secret + same issuer,
  // but doesn't carry impersonatedBy — without this check, a stolen
  // login JWT could be replayed via this endpoint to convert a
  // short-lived URL exposure into a 30m session.
  if (typeof payload !== 'object' || !payload['impersonatedBy']) {
    return NextResponse.json(
      { error: 'Token is not an impersonation token (missing impersonatedBy claim)' },
      { status: 403 },
    );
  }

  const cookieStore = cookies();
  cookieStore.set('elevatedpos_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // 30 min — matches the token TTL issued by the auth service
    maxAge: 30 * 60,
  });

  return NextResponse.json({ ok: true });
}
