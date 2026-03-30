import { describe, it, expect } from 'vitest';
import {
  formatCurrencyAmount,
  validateCardNumber,
  maskCardNumber,
  computePaymentFee,
  generatePaymentReference,
  isRefundable,
} from './lib/utils';

// ── formatCurrencyAmount ───────────────────────────────────────────────────

describe('formatCurrencyAmount', () => {
  it('formats an AUD amount correctly', () => {
    const result = formatCurrencyAmount(19.99, 'AUD');
    expect(result).toContain('19.99');
  });

  it('formats a USD amount with correct symbol', () => {
    const result = formatCurrencyAmount(5.5, 'USD');
    expect(result).toContain('5.50');
    expect(result).toContain('US');
  });

  it('formats zero correctly', () => {
    const result = formatCurrencyAmount(0, 'AUD');
    expect(result).toContain('0.00');
  });

  it('formats a large amount with thousands separator', () => {
    const result = formatCurrencyAmount(1500.0, 'AUD');
    expect(result).toContain('1,500.00');
  });
});

// ── validateCardNumber ─────────────────────────────────────────────────────

describe('validateCardNumber', () => {
  it('validates a known good Visa test card number', () => {
    // Standard Luhn-valid Visa test number
    expect(validateCardNumber('4111111111111111')).toBe(true);
  });

  it('validates a card number containing spaces', () => {
    expect(validateCardNumber('4111 1111 1111 1111')).toBe(true);
  });

  it('rejects a card number with an invalid check digit', () => {
    expect(validateCardNumber('4111111111111112')).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(validateCardNumber('abcd-efgh-ijkl-mnop')).toBe(false);
  });
});

// ── maskCardNumber ─────────────────────────────────────────────────────────

describe('maskCardNumber', () => {
  it('masks all but the last 4 digits with asterisks', () => {
    expect(maskCardNumber('4111111111111111')).toBe('**** **** **** 1111');
  });

  it('exposes exactly the last 4 digits', () => {
    const result = maskCardNumber('5500005555555559');
    expect(result.endsWith('5559')).toBe(true);
  });

  it('works for card numbers with spaces', () => {
    const result = maskCardNumber('4111 1111 1111 1234');
    expect(result).toBe('**** **** **** 1234');
  });

  it('always outputs the fixed **** **** **** XXXX format', () => {
    const result = maskCardNumber('4111111111111111');
    expect(result).toMatch(/^\*{4} \*{4} \*{4} \d{4}$/);
  });
});

// ── computePaymentFee ──────────────────────────────────────────────────────

describe('computePaymentFee', () => {
  it('computes a 1.75% fee on $100.00', () => {
    expect(computePaymentFee(100, 'stripe', 1.75)).toBeCloseTo(1.75);
  });

  it('rounds fee to 2 decimal places', () => {
    // 1.5% of $33.33 = 0.49995 → rounds to 0.50
    expect(computePaymentFee(33.33, 'square', 1.5)).toBeCloseTo(0.5, 1);
  });

  it('returns 0 for a 0% fee', () => {
    expect(computePaymentFee(200, 'cash', 0)).toBe(0);
  });

  it('computes fee correctly for large amounts', () => {
    // 2% of $1000 = $20
    expect(computePaymentFee(1000, 'tyro', 2)).toBeCloseTo(20.0);
  });
});

// ── generatePaymentReference ───────────────────────────────────────────────

describe('generatePaymentReference', () => {
  it('starts with the provided prefix', () => {
    const ref = generatePaymentReference('PAY');
    expect(ref.startsWith('PAY-')).toBe(true);
  });

  it('generates unique references on successive calls', () => {
    const ref1 = generatePaymentReference('PAY');
    const ref2 = generatePaymentReference('PAY');
    expect(ref1).not.toBe(ref2);
  });

  it('includes a UUID portion after the prefix', () => {
    const ref = generatePaymentReference('REF');
    const uuidPart = ref.replace('REF-', '');
    // UUID format: 8-4-4-4-12
    expect(uuidPart).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('works with different prefix strings', () => {
    const ref = generatePaymentReference('TXN');
    expect(ref.startsWith('TXN-')).toBe(true);
  });
});

// ── isRefundable ───────────────────────────────────────────────────────────

describe('isRefundable', () => {
  it('returns true for a recently captured payment within the default 90-day window', () => {
    const createdAt = new Date();
    expect(isRefundable('captured', createdAt)).toBe(true);
  });

  it('returns false for a payment older than the refund window', () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    expect(isRefundable('captured', old, 90)).toBe(false);
  });

  it('returns false for a non-captured status', () => {
    const recent = new Date();
    expect(isRefundable('authorised', recent)).toBe(false);
    expect(isRefundable('failed', recent)).toBe(false);
  });

  it('respects a custom maxDays window', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(isRefundable('captured', threeDaysAgo, 2)).toBe(false);
    expect(isRefundable('captured', threeDaysAgo, 5)).toBe(true);
  });
});
