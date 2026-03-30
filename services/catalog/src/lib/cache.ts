import { getRedisClient } from '@nexus/config';

const TTL = 300; // 5 minutes

export async function getCached<T>(key: string): Promise<T | null> {
  const r = getRedisClient();
  if (!r) return null;
  try {
    const val = await r.get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch { return null; }
}

export async function setCached(key: string, value: unknown, ttl = TTL): Promise<void> {
  const r = getRedisClient();
  if (!r) return;
  try { await r.setex(key, ttl, JSON.stringify(value)); } catch {}
}

export async function invalidateCache(pattern: string): Promise<void> {
  const r = getRedisClient();
  if (!r) return;
  try {
    const keys = await r.keys(pattern);
    if (keys.length) await r.del(...keys);
  } catch {}
}
