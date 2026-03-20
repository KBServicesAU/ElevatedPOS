import { describe, it, expect } from 'vitest';

// Unit tests for payments business logic

function calculateTip(subtotal: number, pct: number): number {
  return Math.round(subtotal * pct / 100);
}

function isCapturable(status: string): boolean {
  return status === 'authorised';
}

function isRefundable(status: string, capturedAt?: string, windowDays = 90): boolean {
  if (status !== 'captured') return false;
  if (!capturedAt) return false;
  const days = (Date.now() - new Date(capturedAt).getTime()) / 86_400_000;
  return days <= windowDays;
}

function buildPaymentReference(orgId: string, orderId: string): string {
  return `${orgId.slice(0, 8)}_${orderId.slice(0, 8)}`;
}

function splitAmount(total: number, splits: number): number[] {
  if (splits <= 0) throw new RangeError('splits must be > 0');
  const base = Math.floor(total / splits);
  const remainder = total - base * splits;
  const parts = Array(splits).fill(base);
  for (let i = 0; i < remainder; i++) parts[i]++;
  return parts;
}

function categorisePaymentMethod(method: string): 'card' | 'cash' | 'digital' | 'other' {
  if (['card', 'credit_card', 'debit_card', 'tap'].includes(method)) return 'card';
  if (method === 'cash') return 'cash';
  if (['apple_pay', 'google_pay', 'paypal'].includes(method)) return 'digital';
  return 'other';
}

describe('calculateTip', () => {
  it('calculates 10% tip on $50.00 (5000 cents)', () => {
    expect(calculateTip(5000, 10)).toBe(500);
  });

  it('calculates 15% tip and rounds correctly', () => {
    // 15% of 3333 = 499.95 → rounds to 500
    expect(calculateTip(3333, 15)).toBe(500);
  });

  it('returns 0 for 0% tip', () => {
    expect(calculateTip(5000, 0)).toBe(0);
  });
});

describe('isCapturable', () => {
  it('returns true for authorised', () => {
    expect(isCapturable('authorised')).toBe(true);
  });

  it('returns false for captured', () => {
    expect(isCapturable('captured')).toBe(false);
  });

  it('returns false for failed', () => {
    expect(isCapturable('failed')).toBe(false);
  });
});

describe('isRefundable', () => {
  it('returns true for recently captured payment', () => {
    const recent = new Date().toISOString();
    expect(isRefundable('captured', recent)).toBe(true);
  });

  it('returns false for payment outside refund window', () => {
    const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
    expect(isRefundable('captured', old, 90)).toBe(false);
  });

  it('returns false for non-captured status', () => {
    const recent = new Date().toISOString();
    expect(isRefundable('failed', recent)).toBe(false);
  });

  it('returns false when capturedAt is missing', () => {
    expect(isRefundable('captured', undefined)).toBe(false);
  });
});

describe('buildPaymentReference', () => {
  it('builds reference from orgId and orderId', () => {
    const ref = buildPaymentReference('org_abc12345', 'ord_xyz98765');
    expect(ref).toBe('org_abc1_ord_xyz9');
  });

  it('returns deterministic result for same inputs', () => {
    const a = buildPaymentReference('org_1', 'ord_1');
    const b = buildPaymentReference('org_1', 'ord_1');
    expect(a).toBe(b);
  });
});

describe('splitAmount', () => {
  it('splits evenly when divisible', () => {
    expect(splitAmount(1000, 4)).toEqual([250, 250, 250, 250]);
  });

  it('distributes remainder to first splits', () => {
    const parts = splitAmount(1001, 3);
    expect(parts).toHaveLength(3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(parts[0]).toBe(334);
    expect(parts[1]).toBe(334);
    expect(parts[2]).toBe(333);
  });

  it('returns [total] for splits = 1', () => {
    expect(splitAmount(500, 1)).toEqual([500]);
  });

  it('throws for splits <= 0', () => {
    expect(() => splitAmount(1000, 0)).toThrow(RangeError);
  });
});

describe('categorisePaymentMethod', () => {
  it('categorises card methods', () => {
    expect(categorisePaymentMethod('card')).toBe('card');
    expect(categorisePaymentMethod('tap')).toBe('card');
  });

  it('categorises cash', () => {
    expect(categorisePaymentMethod('cash')).toBe('cash');
  });

  it('categorises digital wallets', () => {
    expect(categorisePaymentMethod('apple_pay')).toBe('digital');
    expect(categorisePaymentMethod('google_pay')).toBe('digital');
  });

  it('returns other for unknown method', () => {
    expect(categorisePaymentMethod('barter')).toBe('other');
  });
});
