import { useDeviceStore } from '../store/device';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

export async function deviceApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const identity = useDeviceStore.getState().identity;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(identity ? { Authorization: `Bearer ${identity.deviceToken}` } : {}),
      ...(init?.headers as Record<string, string> ?? {}),
    },
  });
  if (res.status === 401) {
    await useDeviceStore.getState().clearIdentity();
    throw new Error('Device has been revoked. Please re-pair this device.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ title: res.statusText })) as { title?: string };
    throw new Error(err.title ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}
