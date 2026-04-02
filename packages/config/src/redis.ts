import Redis from 'ioredis';

let client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!process.env['REDIS_URL']) return null;
  if (!client) {
    const isTls = process.env['REDIS_URL']?.startsWith('rediss://');
    client = new Redis(process.env['REDIS_URL'], {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5000,
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    });
    client.on('error', (err) => console.error('[Redis]', err.message));
  }
  return client;
}

export async function connectRedis(): Promise<void> {
  const r = getRedisClient();
  if (!r) { console.log('[Redis] REDIS_URL not set, skipping'); return; }
  try { await r.connect(); console.log('[Redis] connected'); }
  catch (err) { console.error('[Redis] connection failed:', err); }
}

export { Redis };
