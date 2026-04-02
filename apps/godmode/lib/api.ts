export async function platformFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api/proxy/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<unknown>;
}
