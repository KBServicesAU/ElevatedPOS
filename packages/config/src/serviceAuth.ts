// Service-to-service JWT authentication
// Short-lived tokens (5 min) for inter-service calls.
// Uses the same JWT_SECRET env var as user auth so no additional secrets are needed.

import jwt from 'jsonwebtoken';

const SECRET = () => process.env['JWT_SECRET'] ?? 'dev-secret';

/**
 * Create a short-lived JWT for a service-to-service call.
 * @param fromService  Name of the calling service (e.g. 'customers')
 * @param toService    Name of the target service (e.g. 'orders')
 */
export function createServiceToken(fromService: string, toService: string): string {
  return jwt.sign(
    { sub: fromService, aud: toService, type: 'service' },
    SECRET(),
    { expiresIn: '5m', issuer: 'elevatedpos-auth' },
  );
}

/**
 * Verify a service token received on an incoming request.
 * @param token           Raw JWT string (without "Bearer " prefix)
 * @param expectedService The service name that this token should be addressed to
 */
export function verifyServiceToken(token: string, expectedService: string): boolean {
  try {
    const payload = jwt.verify(token, SECRET(), {
      issuer: 'elevatedpos-auth',
    }) as { type?: string; aud?: string | string[] };

    if (payload.type !== 'service') return false;

    // aud may be a string or array
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    return aud.includes(expectedService);
  } catch {
    return false;
  }
}
