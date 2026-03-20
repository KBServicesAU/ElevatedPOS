import { describe, it, expect } from 'vitest';

// Unit tests for catalog business logic

function formatPrice(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function validateSku(sku: string): { valid: boolean; error?: string } {
  if (!sku || sku.trim().length === 0) return { valid: false, error: 'SKU is required' };
  if (sku.length > 100) return { valid: false, error: 'SKU must be 100 characters or fewer' };
  if (/\s/.test(sku)) return { valid: false, error: 'SKU must not contain whitespace' };
  return { valid: true };
}

function buildProductSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function applyDiscount(basePrice: number, discountPct: number): number {
  if (discountPct < 0 || discountPct > 100) throw new RangeError('Discount must be 0–100');
  return Math.round(basePrice * (1 - discountPct / 100));
}

function calcKitPrice(components: { price: number; qty: number }[]): number {
  return components.reduce((sum, c) => sum + c.price * c.qty, 0);
}

function isVariantProductType(type: string): boolean {
  return type === 'variant';
}

describe('formatPrice', () => {
  it('formats 550 cents as $5.50', () => {
    expect(formatPrice(550)).toBe('$5.50');
  });

  it('formats 0 as $0.00', () => {
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('formats 14999 as $149.99', () => {
    expect(formatPrice(14999)).toBe('$149.99');
  });
});

describe('validateSku', () => {
  it('accepts a valid SKU', () => {
    expect(validateSku('CAF-001')).toMatchObject({ valid: true });
  });

  it('rejects empty SKU', () => {
    const result = validateSku('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it('rejects SKU with whitespace', () => {
    const result = validateSku('CAF 001');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/whitespace/i);
  });

  it('rejects SKU longer than 100 chars', () => {
    const result = validateSku('A'.repeat(101));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/100/);
  });
});

describe('buildProductSlug', () => {
  it('converts spaces to hyphens', () => {
    expect(buildProductSlug('Flat White')).toBe('flat-white');
  });

  it('strips leading/trailing hyphens', () => {
    expect(buildProductSlug(' Cold Brew ')).toBe('cold-brew');
  });

  it('collapses multiple special chars to single hyphen', () => {
    expect(buildProductSlug('Oat & Almond Latte!')).toBe('oat-almond-latte');
  });
});

describe('applyDiscount', () => {
  it('applies 10% discount correctly', () => {
    expect(applyDiscount(1000, 10)).toBe(900);
  });

  it('returns full price for 0% discount', () => {
    expect(applyDiscount(550, 0)).toBe(550);
  });

  it('returns 0 for 100% discount', () => {
    expect(applyDiscount(550, 100)).toBe(0);
  });

  it('throws for discount > 100', () => {
    expect(() => applyDiscount(550, 150)).toThrow(RangeError);
  });

  it('throws for negative discount', () => {
    expect(() => applyDiscount(550, -5)).toThrow(RangeError);
  });
});

describe('calcKitPrice', () => {
  it('sums components correctly', () => {
    const components = [
      { price: 500, qty: 2 },
      { price: 300, qty: 1 },
    ];
    expect(calcKitPrice(components)).toBe(1300);
  });

  it('returns 0 for empty kit', () => {
    expect(calcKitPrice([])).toBe(0);
  });

  it('handles single component with qty > 1', () => {
    expect(calcKitPrice([{ price: 450, qty: 4 }])).toBe(1800);
  });
});

describe('isVariantProductType', () => {
  it('returns true for variant', () => {
    expect(isVariantProductType('variant')).toBe(true);
  });

  it('returns false for standard', () => {
    expect(isVariantProductType('standard')).toBe(false);
  });

  it('returns false for service', () => {
    expect(isVariantProductType('service')).toBe(false);
  });
});
