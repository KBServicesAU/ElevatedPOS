import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  calculateBundlePrice,
  slugify,
  validateSku,
  computeMarkdownPrice,
  buildBarcodeCheckDigit,
} from './lib/utils';

// ── formatPrice ────────────────────────────────────────────────────────────

describe('formatPrice', () => {
  it('formats a standard AUD price correctly', () => {
    const result = formatPrice(12.5);
    expect(result).toContain('12.50');
  });

  it('formats zero as $0.00', () => {
    const result = formatPrice(0);
    expect(result).toContain('0.00');
  });

  it('formats a price with a different currency code', () => {
    const result = formatPrice(9.99, 'USD');
    expect(result).toContain('9.99');
    expect(result).toContain('US');
  });

  it('formats a large price with correct decimals', () => {
    const result = formatPrice(1999.99, 'AUD');
    expect(result).toContain('1,999.99');
  });
});

// ── calculateBundlePrice ───────────────────────────────────────────────────

describe('calculateBundlePrice', () => {
  it('applies a percentage discount to bundle components', () => {
    const components = [
      { price: 10, quantity: 2 },
      { price: 5, quantity: 1 },
    ]; // base = 25, 20% off = 20
    expect(calculateBundlePrice(components, 'percentage', 20)).toBeCloseTo(20.0);
  });

  it('applies a fixed discount to bundle components', () => {
    const components = [{ price: 30, quantity: 2 }]; // base = 60, minus $10 = 50
    expect(calculateBundlePrice(components, 'fixed', 10)).toBeCloseTo(50.0);
  });

  it('returns base total for unknown discount type', () => {
    const components = [{ price: 20, quantity: 3 }];
    expect(calculateBundlePrice(components, 'none', 0)).toBeCloseTo(60.0);
  });

  it('returns 0 when fixed discount exceeds total', () => {
    const components = [{ price: 5, quantity: 1 }];
    expect(calculateBundlePrice(components, 'fixed', 100)).toBe(0);
  });
});

// ── slugify ────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('converts spaces to hyphens and lowercases', () => {
    expect(slugify('Flat White Coffee')).toBe('flat-white-coffee');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify(' Cold Brew ')).toBe('cold-brew');
  });

  it('collapses multiple special characters to a single hyphen', () => {
    expect(slugify('Oat & Almond Latte!')).toBe('oat-almond-latte');
  });

  it('handles strings with numbers', () => {
    expect(slugify('Size 42 Shoe')).toBe('size-42-shoe');
  });
});

// ── validateSku ────────────────────────────────────────────────────────────

describe('validateSku', () => {
  it('accepts a valid alphanumeric SKU with dashes', () => {
    expect(validateSku('CAF-001')).toBe(true);
  });

  it('accepts a SKU with underscores', () => {
    expect(validateSku('PROD_SKU_99')).toBe(true);
  });

  it('rejects a SKU longer than 64 characters', () => {
    expect(validateSku('A'.repeat(65))).toBe(false);
  });

  it('rejects a SKU with spaces or special characters', () => {
    expect(validateSku('SKU 123')).toBe(false);
    expect(validateSku('SKU@123')).toBe(false);
  });
});

// ── computeMarkdownPrice ───────────────────────────────────────────────────

describe('computeMarkdownPrice', () => {
  it('applies a percentage markdown correctly', () => {
    // 25% off $80 = $60
    expect(computeMarkdownPrice(80, 'percentage', 25)).toBeCloseTo(60.0);
  });

  it('applies a fixed markdown correctly', () => {
    // $100 - $15 = $85
    expect(computeMarkdownPrice(100, 'fixed', 15)).toBeCloseTo(85.0);
  });

  it('returns 0 when fixed discount exceeds base price', () => {
    expect(computeMarkdownPrice(10, 'fixed', 20)).toBe(0);
  });

  it('returns 0 for a 100% percentage markdown', () => {
    expect(computeMarkdownPrice(50, 'percentage', 100)).toBe(0);
  });
});

// ── buildBarcodeCheckDigit ─────────────────────────────────────────────────

describe('buildBarcodeCheckDigit', () => {
  it('computes the correct EAN-13 check digit for a known barcode', () => {
    // EAN-13: 4006381333931 — first 12 digits: 400638133393
    expect(buildBarcodeCheckDigit('400638133393')).toBe('1');
  });

  it('returns "0" when the computed check digit is 0', () => {
    // EAN-13: 5901234123457 — first 12 digits: 590123412345
    expect(buildBarcodeCheckDigit('590123412345')).toBe('7');
  });

  it('throws an error for a non-12-digit input', () => {
    expect(() => buildBarcodeCheckDigit('123456789')).toThrow();
    expect(() => buildBarcodeCheckDigit('1234567890123')).toThrow();
  });

  it('throws an error for non-numeric input', () => {
    expect(() => buildBarcodeCheckDigit('ABCDEFGHIJKL')).toThrow();
  });
});
