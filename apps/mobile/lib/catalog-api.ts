import { useDeviceStore } from '../store/device';
import { useAuthStore } from '../store/auth';

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

/** Get the best available auth token: prefer employee JWT, fall back to device token */
function getToken(): string | null {
  return useAuthStore.getState().employeeToken
    ?? useDeviceStore.getState().identity?.deviceToken
    ?? null;
}

/** POST / PATCH helper for mutating catalog resources */
export async function catalogApiPost<T = unknown>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const token = getToken();
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
  const token = getToken();
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
    // Try once more with device token if employee token was stale
    const deviceToken = useDeviceStore.getState().identity?.deviceToken;
    if (deviceToken && token !== deviceToken) {
      const retry = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`,
          ...((init?.headers as Record<string, string>) ?? {}),
        },
      });
      if (retry.ok) return retry.json() as Promise<T>;
    }
    throw new Error('Unauthorized — please log in again.');
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ title: res.statusText }))) as { title?: string };
    throw new Error(err.title ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}
