export async function salesFetch(path: string, options?: RequestInit) {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get('sales_token')?.value;
  const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://auth:4001';

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
