import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getRedisClient } from '@nexus/config';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function addToBlacklist(jti: string, expiresAt: number): Promise<void> {
  const r = getRedisClient();
  if (!r) return;
  const ttl = Math.floor(expiresAt - Date.now() / 1000);
  if (ttl <= 0) return;
  try {
    await r.setex(`blacklist:${jti}`, ttl, '1');
  } catch (err) {
    console.error('[Redis] addToBlacklist failed:', err);
  }
}

export async function isBlacklisted(jti: string): Promise<boolean> {
  const r = getRedisClient();
  if (!r) return false; // fail open — Redis unavailable
  try {
    const val = await r.exists(`blacklist:${jti}`);
    return val === 1;
  } catch {
    return false; // fail open on error
  }
}
