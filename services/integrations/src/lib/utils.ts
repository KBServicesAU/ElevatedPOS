/**
 * Integration utility functions — pure, side-effect-free helpers.
 */

import { createHmac, timingSafeEqual } from 'crypto';

// ─── validateWebhookSignature ─────────────────────────────────────────────────

/**
 * Verifies an HMAC-SHA256 webhook signature.
 * Expects `signature` to be a hex-encoded digest (optionally prefixed with "sha256=").
 */
export function validateWebhookSignature(
  payload: string,
  secret: string,
  signature: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    const normalised = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(normalised, 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

// ─── buildWebhookPayload ──────────────────────────────────────────────────────

export interface WebhookPayload {
  id: string;
  eventType: string;
  orgId: string;
  data: unknown;
  timestamp: string;
  signature: string;
}

/**
 * Builds a signed webhook payload for the given event type and data.
 * The signature is an HMAC-SHA256 over the canonical JSON string of the payload body.
 * An `id` field is generated from a timestamp + random suffix to be unique.
 */
export function buildWebhookPayload(
  eventType: string,
  data: unknown,
  orgId: string,
  secret: string,
): WebhookPayload {
  const timestamp = new Date().toISOString();
  const id = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const body = JSON.stringify({ id, eventType, orgId, data, timestamp });
  const signature = 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return { id, eventType, orgId, data, timestamp, signature };
}

// ─── computeBackoffDelay ──────────────────────────────────────────────────────

/**
 * Returns the exponential backoff delay in milliseconds for webhook retries.
 * Formula: min(2^(attempt-1) * 1000, 3600000) — caps at 1 hour.
 */
export function computeBackoffDelay(attempt: number): number {
  const base = Math.pow(2, Math.max(attempt - 1, 0)) * 1_000;
  return Math.min(base, 3_600_000);
}

// ─── maskCredential ───────────────────────────────────────────────────────────

/**
 * Masks an API key or credential, showing only the last 4 characters.
 * Values shorter than 8 characters are fully masked.
 */
export function maskCredential(value: string): string {
  if (!value || value.length <= 4) return '****';
  if (value.length <= 8) return '****' + value.slice(-4);
  return '****' + value.slice(-4);
}

// ─── parseAppKey ──────────────────────────────────────────────────────────────

/**
 * Extracts the app key from a marketplace app URL.
 * Expected format: https://<host>/marketplace/apps/<appKey>[/...]
 * Returns null if the URL does not match the expected pattern.
 */
export function parseAppKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const appsIndex = parts.indexOf('apps');
    if (appsIndex === -1 || appsIndex + 1 >= parts.length) return null;
    const key = parts[appsIndex + 1];
    return key && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

// ─── isValidRedirectUri ───────────────────────────────────────────────────────

/**
 * Validates an OAuth redirect URI against a whitelist of allowed URIs.
 * Performs exact string match; does not attempt URL normalisation.
 */
export function isValidRedirectUri(uri: string, allowedUris: string[]): boolean {
  if (!uri || allowedUris.length === 0) return false;
  return allowedUris.includes(uri);
}
