import { describe, it, expect } from 'vitest';
import {
  calculateOrderTotal,
  applyDiscountToTotal,
  formatOrderNumber,
  validateLaybyDeposit,
  calculateLaybyCancellationFee,
  estimateCompletionDate,
} from './lib/utils';

// ── calculateOrderTotal ────────────────────────────────────────────────────

describe('calculateOrderTotal', () => {
  it('calculates total for a single line with no discount', () => {
    const lines = [{ quantity: 2, unitPrice: 10.0 }];
    expect(calculateOrderTotal(lines)).toBeCloseTo(20.0);
  });

  it('calculates total for multiple lines', () => {
    const lines = [
      { quantity: 1, unitPrice: 5.0 },
      { quantity: 3, unitPrice: 8.0 },
      { quantity: 2, unitPrice: 15.0 },
    ];
    // 5 + 24 + 30 = 59
    expect(calculateOrderTotal(lines)).toBeCloseTo(59.0);
  });

  it('applies per-line discount correctly', () => {
    const lines = [{ quantity: 1, unitPrice: 100.0, discountPercent: 20 }];
    // 100 - 20% = 80
    expect(calculateOrderTotal(lines)).toBeCloseTo(80.0);
  });

  it('returns 0 for an empty lines array', () => {
    expect(calculateOrderTotal([])).toBe(0);
  });
});

// ── applyDiscountToTotal ───────────────────────────────────────────────────

describe('applyDiscountToTotal', () => {
  it('applies a 10% discount to a subtotal', () => {
    expect(applyDiscountToTotal(200, 10)).toBeCloseTo(180.0);
  });

  it('caps discount at maxDiscount when provided', () => {
    // 20% of 500 = 100, but capped at 50
    expect(applyDiscountToTotal(500, 20, 50)).toBeCloseTo(450.0);
  });

  it('returns the full subtotal when discount is 0%', () => {
    expect(applyDiscountToTotal(150, 0)).toBeCloseTo(150.0);
  });

  it('throws RangeError for discount percentage outside 0–100', () => {
    expect(() => applyDiscountToTotal(100, 110)).toThrow(RangeError);
    expect(() => applyDiscountToTotal(100, -5)).toThrow(RangeError);
  });
});

// ── formatOrderNumber ──────────────────────────────────────────────────────

describe('formatOrderNumber', () => {
  it('produces the correct format ORD-YEAR-NNNNNN', () => {
    expect(formatOrderNumber('ORD', 2024, 1)).toBe('ORD-2024-000001');
  });

  it('zero-pads sequence to 6 digits', () => {
    expect(formatOrderNumber('ORD', 2025, 42)).toBe('ORD-2025-000042');
  });

  it('supports sequences at the 6-digit boundary', () => {
    expect(formatOrderNumber('ORD', 2024, 999999)).toBe('ORD-2024-999999');
  });

  it('uses the provided prefix and year correctly', () => {
    const result = formatOrderNumber('NEX', 2026, 100);
    expect(result).toBe('NEX-2026-000100');
  });
});

// ── validateLaybyDeposit ───────────────────────────────────────────────────

describe('validateLaybyDeposit', () => {
  it('returns true when deposit meets the 10% AU law minimum', () => {
    // 10% of 500 = 50
    expect(validateLaybyDeposit(500, 50)).toBe(true);
  });

  it('returns false when deposit is below the 10% minimum', () => {
    // 9% of 500 = 45
    expect(validateLaybyDeposit(500, 45)).toBe(false);
  });

  it('returns true when deposit exceeds the minimum', () => {
    expect(validateLaybyDeposit(200, 100)).toBe(true);
  });

  it('returns false for zero total amount', () => {
    expect(validateLaybyDeposit(0, 0)).toBe(false);
  });
});

// ── calculateLaybyCancellationFee ──────────────────────────────────────────

describe('calculateLaybyCancellationFee', () => {
  it('calculates default 20% cancellation fee', () => {
    // 20% of 300 = 60
    expect(calculateLaybyCancellationFee(300)).toBeCloseTo(60.0);
  });

  it('calculates a custom fee percentage', () => {
    // 15% of 400 = 60
    expect(calculateLaybyCancellationFee(400, 15)).toBeCloseTo(60.0);
  });

  it('returns 0 for zero total paid', () => {
    expect(calculateLaybyCancellationFee(0)).toBe(0);
  });

  it('throws RangeError for fee percentage outside 0–100', () => {
    expect(() => calculateLaybyCancellationFee(100, 150)).toThrow(RangeError);
    expect(() => calculateLaybyCancellationFee(100, -1)).toThrow(RangeError);
  });
});

// ── estimateCompletionDate ─────────────────────────────────────────────────

describe('estimateCompletionDate', () => {
  it('returns a date in the future when balance > 0', () => {
    const result = estimateCompletionDate(300, 100);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it('estimates ~3 months for $300 balance at $100/month', () => {
    const now = new Date();
    const result = estimateCompletionDate(300, 100);
    // Use day-based diff to avoid month-overflow edge cases (e.g. Mar 31 + 3mo = Jul 1)
    const diffDays = (result.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(85); // ~3 months minimum
    expect(diffDays).toBeLessThanOrEqual(125);   // allow up to ~4 months for overflow
  });

  it('rounds up partial months (e.g. $310 at $100/month = 4 months)', () => {
    const now = new Date();
    const result = estimateCompletionDate(310, 100);
    const diffDays = (result.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(115); // ~4 months minimum
    expect(diffDays).toBeLessThanOrEqual(155);    // allow up to ~5 months for overflow
  });

  it('throws RangeError when avgMonthlyPayment is zero or negative', () => {
    expect(() => estimateCompletionDate(300, 0)).toThrow(RangeError);
    expect(() => estimateCompletionDate(300, -50)).toThrow(RangeError);
  });
});
