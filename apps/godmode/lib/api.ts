export async function platformFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api/proxy/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      message = String(parsed['message'] ?? parsed['error'] ?? parsed['title'] ?? text);
    } catch {
      // not JSON — use raw text
    }
    throw new Error(message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}
