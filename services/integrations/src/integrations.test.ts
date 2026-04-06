import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  validateWebhookSignature,
  buildWebhookPayload,
  computeBackoffDelay,
  maskCredential,
  parseAppKey,
  isValidRedirectUri,
} from './lib/utils.js';

// ─── validateWebhookSignature ─────────────────────────────────────────────────

describe('validateWebhookSignature', () => {
  const secret = 'my-secret-key';
  const payload = JSON.stringify({ event: 'order.created', orderId: 'ord-123' });

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    expect(validateWebhookSignature(payload, secret, sig)).toBe(true);
  });

  it('returns true when signature is prefixed with sha256=', () => {
    const sig = 'sha256=' + createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    expect(validateWebhookSignature(payload, secret, sig)).toBe(true);
  });

  it('returns false for a tampered payload', () => {
    const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    expect(validateWebhookSignature('tampered-payload', secret, sig)).toBe(false);
  });

  it('returns false for an incorrect signature', () => {
    expect(validateWebhookSignature(payload, secret, 'deadbeef'.repeat(8))).toBe(false);
  });
});

// ─── buildWebhookPayload ──────────────────────────────────────────────────────

describe('buildWebhookPayload', () => {
  const secret = 'webhook-secret';

  it('includes the correct eventType and orgId in the payload', () => {
    const payload = buildWebhookPayload('order.created', { id: 'ord-1' }, 'org-abc', secret);
    expect(payload.eventType).toBe('order.created');
    expect(payload.orgId).toBe('org-abc');
  });

  it('includes a signature prefixed with sha256=', () => {
    const payload = buildWebhookPayload('order.created', {}, 'org-abc', secret);
    expect(payload.signature).toMatch(/^sha256=/);
  });

  it('generates a unique id for each call', () => {
    const p1 = buildWebhookPayload('order.created', {}, 'org-abc', secret);
    const p2 = buildWebhookPayload('order.created', {}, 'org-abc', secret);
    expect(p1.id).not.toBe(p2.id);
  });

  it('includes a valid ISO timestamp', () => {
    const payload = buildWebhookPayload('order.created', {}, 'org-abc', secret);
    expect(() => new Date(payload.timestamp)).not.toThrow();
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });
});

// ─── computeBackoffDelay ──────────────────────────────────────────────────────

describe('computeBackoffDelay', () => {
  it('returns 1 second delay for attempt 1', () => {
    expect(computeBackoffDelay(1)).toBe(1_000);
  });

  it('returns 2 second delay for attempt 2', () => {
    expect(computeBackoffDelay(2)).toBe(2_000);
  });

  it('returns 4 second delay for attempt 3', () => {
    expect(computeBackoffDelay(3)).toBe(4_000);
  });

  it('caps the delay at 1 hour (3600000ms)', () => {
    expect(computeBackoffDelay(20)).toBe(3_600_000);
  });
});

// ─── maskCredential ───────────────────────────────────────────────────────────

describe('maskCredential', () => {
  it('shows only the last 4 characters for a long credential', () => {
    const result = maskCredential('sk_live_ABCDEFGHIJKLMN1234');
    expect(result).toBe('****1234');
  });

  it('fully masks very short credentials', () => {
    expect(maskCredential('abc')).toBe('****');
  });

  it('handles a credential of exactly 8 characters', () => {
    const result = maskCredential('12345678');
    expect(result.endsWith('5678')).toBe(true);
    expect(result.startsWith('****')).toBe(true);
  });

  it('returns **** for empty string', () => {
    expect(maskCredential('')).toBe('****');
  });
});

// ─── parseAppKey ──────────────────────────────────────────────────────────────

describe('parseAppKey', () => {
  it('extracts the app key from a well-formed marketplace URL', () => {
    const key = parseAppKey('https://marketplace.elevatedpos.com.au/marketplace/apps/shopify');
    expect(key).toBe('shopify');
  });

  it('extracts the app key when additional path segments follow', () => {
    const key = parseAppKey('https://marketplace.elevatedpos.com.au/marketplace/apps/xero/settings');
    expect(key).toBe('xero');
  });

  it('returns null when the URL has no apps path segment', () => {
    const key = parseAppKey('https://marketplace.elevatedpos.com.au/marketplace/other');
    expect(key).toBeNull();
  });

  it('returns null for an invalid URL', () => {
    expect(parseAppKey('not-a-url')).toBeNull();
  });
});

// ─── isValidRedirectUri ───────────────────────────────────────────────────────

describe('isValidRedirectUri', () => {
  const allowed = [
    'https://app.nexus.com/oauth/callback',
    'https://staging.nexus.com/oauth/callback',
  ];

  it('returns true for an exact match in the whitelist', () => {
    expect(isValidRedirectUri('https://app.nexus.com/oauth/callback', allowed)).toBe(true);
  });

  it('returns false for a URI not in the whitelist', () => {
    expect(isValidRedirectUri('https://evil.com/steal', allowed)).toBe(false);
  });

  it('returns false for an empty URI', () => {
    expect(isValidRedirectUri('', allowed)).toBe(false);
  });

  it('returns false when the allowed list is empty', () => {
    expect(isValidRedirectUri('https://app.nexus.com/oauth/callback', [])).toBe(false);
  });
});
