import { useAuthStore } from '../store/auth';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4001';

export async function posApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ title: res.statusText }));
    throw new Error((err as { title?: string }).title ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}
