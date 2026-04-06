import { cookies } from 'next/headers';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://auth:4001';

/**
 * Server-side helper to call the upstream auth/platform API with the
 * sales_token cookie forwarded as a Bearer token.
 * Only usable in Server Components or Route Handlers (not 'use client').
 */
export async function salesFetch(path: string, options?: RequestInit) {
  const cookieStore = await cookies();
  const token = cookieStore.get('sales_token')?.value;

  const res = await fetch(`${AUTH_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
  });

  return res;
}
