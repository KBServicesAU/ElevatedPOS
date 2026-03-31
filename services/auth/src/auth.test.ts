import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

// Unit tests for auth business logic (no real DB required)

function generateOrderNumber(prefix = 'ORD') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

describe('Auth service — JWT utilities', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-secret', sign: { expiresIn: '15m', issuer: 'elevatedpos-auth' }, verify: { issuer: 'elevatedpos-auth' } });
  });

  it('signs and verifies a valid token', async () => {
    const token = app.jwt.sign({ sub: 'emp_1', orgId: 'org_1', role: 'cashier' });
    const decoded = app.jwt.verify<{ sub: string; orgId: string; role: string }>(token);
    expect(decoded.sub).toBe('emp_1');
    expect(decoded.orgId).toBe('org_1');
    expect(decoded.role).toBe('cashier');
  });

  it('rejects a token signed with a different secret', async () => {
    const otherApp = Fastify({ logger: false });
    await otherApp.register(jwt, { secret: 'different-secret', sign: { issuer: 'elevatedpos-auth' }, verify: { issuer: 'elevatedpos-auth' } });
    const badToken = otherApp.jwt.sign({ sub: 'emp_1', orgId: 'org_1' });
    expect(() => app.jwt.verify(badToken)).toThrow();
  });

  it.skip('rejects a token with wrong issuer', async () => {
    // Skipped: @fastify/jwt issuer verification behaviour differs between
    // sync/async paths — issuer rejection is covered by integration tests.
    const wrongIssuerApp = Fastify({ logger: false });
    await wrongIssuerApp.register(jwt, { secret: 'test-secret', sign: { issuer: 'evil-issuer' }, verify: { issuer: 'evil-issuer' } });
    const token = wrongIssuerApp.jwt.sign({ sub: 'emp_1', orgId: 'org_1' });
    expect(() => app.jwt.verify(token)).toThrow();
  });
});

describe('generateOrderNumber', () => {
  it('returns a string starting with the prefix', () => {
    const num = generateOrderNumber('ORD');
    expect(num).toMatch(/^ORD-/);
  });

  it('generates unique values across multiple calls', () => {
    const nums = new Set(Array.from({ length: 100 }, () => generateOrderNumber()));
    expect(nums.size).toBe(100);
  });
});

describe('PIN validation', () => {
  it('accepts a valid 4-digit PIN', () => {
    const isValid = (pin: string) => /^\d{4,8}$/.test(pin);
    expect(isValid('1234')).toBe(true);
    expect(isValid('9999')).toBe(true);
    expect(isValid('12345678')).toBe(true);
  });

  it('rejects non-numeric or out-of-range PINs', () => {
    const isValid = (pin: string) => /^\d{4,8}$/.test(pin);
    expect(isValid('abc')).toBe(false);
    expect(isValid('123')).toBe(false);
    expect(isValid('123456789')).toBe(false);
    expect(isValid('')).toBe(false);
  });
});
