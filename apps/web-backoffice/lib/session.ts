/**
 * Server-side session helper.
 * Decodes the elevatedpos_token JWT payload WITHOUT signature verification
 * (acceptable because we only use it for display purposes — the proxy
 * route and auth service still enforce real auth on every API call).
 */
import { cookies } from 'next/headers';

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string | null;
  orgId: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get('elevatedpos_token')?.value;
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const firstName =
    (payload.firstName as string) ??
    (payload.given_name as string) ??
    (payload.name as string)?.split(' ')[0] ??
    'User';

  const lastName =
    (payload.lastName as string) ??
    (payload.family_name as string) ??
    (payload.name as string)?.split(' ').slice(1).join(' ') ??
    '';

  const role =
    (payload.role as string) ??
    (payload.roleName as string) ??
    null;

  return {
    id: (payload.sub as string) ?? '',
    firstName,
    lastName,
    email: (payload.email as string) ?? '',
    role,
    orgId: (payload.orgId as string) ?? '',
  };
}
