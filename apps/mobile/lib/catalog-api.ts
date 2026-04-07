import { useDeviceStore } from '../store/device';

/**
 * Authenticated fetch wrapper for the Catalog service.
 *
 * In production the API gateway routes `/api/v1/products` and `/api/v1/categories`
 * to the catalog micro-service automatically, so the same base URL works.
 * For local development you can point EXPO_PUBLIC_CATALOG_API_URL at port 4002.
 */
const CATALOG_BASE =
  process.env['EXPO_PUBLIC_CATALOG_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4002';

export async function catalogApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const identity = useDeviceStore.getState().identity;
  const res = await fetch(`${CATALOG_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(identity ? { Authorization: `Bearer ${identity.deviceToken}` } : {}),
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });

  if (res.status === 401) {
    await useDeviceStore.getState().clearIdentity();
    throw new Error('Device has been revoked. Please re-pair this device.');
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ title: res.statusText }))) as { title?: string };
    throw new Error(err.title ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}
