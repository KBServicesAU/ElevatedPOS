import { useDeviceStore } from '../store/device';
import { useAuthStore } from '../store/auth';
import { getDeviceJwt, refreshDeviceJwt } from './device-jwt';

/**
 * Authenticated fetch wrapper for the Catalog service.
 *
 * Production API gateway routes catalog at /api/v1/catalog/*
 * which gets rewritten to /api/v1/* on the catalog service.
 * For local development point EXPO_PUBLIC_CATALOG_API_URL at port 4002.
 */
const API_BASE =
  process.env['EXPO_PUBLIC_API_URL'] ?? process.env['EXPO_PUBLIC_CATALOG_API_URL'] ?? '';

const CATALOG_BASE =
  process.env['EXPO_PUBLIC_CATALOG_API_URL'] ?? '';

/**
 * Map bare catalog paths to the gateway's /api/v1/catalog/* prefix.
 * e.g. /api/v1/categories → /api/v1/catalog/categories
 * When EXPO_PUBLIC_CATALOG_API_URL is set (direct to catalog service), skip remapping.
 */
function resolveUrl(path: string): string {
  if (CATALOG_BASE) return `${CATALOG_BASE}${path}`;
  // Rewrite /api/v1/xxx → /api/v1/catalog/xxx for the API gateway
  return `${API_BASE}${path.replace('/api/v1/', '/api/v1/catalog/')}`;
}

/**
 * Get the best available auth token for downstream (catalog/orders/...)
 * services.
 *
 * Preference order:
 *   1. Employee JWT — minted on PIN login, carries employee claims.
 *      Available in the POS; kiosks never have one.
 *   2. Device JWT — minted on demand from the device token via the
 *      auth service's access-token exchange (v2.7.37). Required for
 *      unattended devices (kiosk / signage / KDS) whose only identity
 *      is the paired device token.
 *
 * v2.7.37 — previously this fell back to the raw device token, which
 * downstream services rejected because they use `request.jwtVerify()`.
 * The kiosk would fail every catalog call with "Unauthorized — please
 * log in again" even though it had no PIN login flow at all.
 */
async function getToken(): Promise<string | null> {
  const employeeToken = useAuthStore.getState().employeeToken;
  if (employeeToken) return employeeToken;
  return getDeviceJwt();
}

/** Synchronous variant — returns the employee JWT only. Caller handles
 *  device JWT via the async `getToken()`. Kept because a few callers
 *  (catalogApiPost) were synchronous and don't need device auth. */
function getEmployeeTokenSync(): string | null {
  return useAuthStore.getState().employeeToken ?? null;
}

/** POST / PATCH helper for mutating catalog resources */
export async function catalogApiPost<T = unknown>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const token = await getToken();
  const url = resolveUrl(path);
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ title: res.statusText }))) as { title?: string };
    throw new Error(err.title ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function catalogApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const url = resolveUrl(path);
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });

  if (res.status === 401) {
    // v2.7.37 — token might be a stale device JWT; force a refresh and
    // retry once. If we were using an employee token and it's stale,
    // the caller (POS) will already prompt for re-login elsewhere.
    const employeeToken = getEmployeeTokenSync();
    if (!employeeToken) {
      const fresh = await refreshDeviceJwt();
      if (fresh && fresh !== token) {
        const retry = await fetch(url, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${fresh}`,
            ...((init?.headers as Record<string, string>) ?? {}),
          },
        });
        if (retry.ok) return retry.json() as Promise<T>;
      }
    }
    throw new Error('Unauthorized — please log in again.');
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ title: res.statusText }))) as { title?: string };
    throw new Error(err.title ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}
