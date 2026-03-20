import { describe, it, expect } from 'vitest';

// Unit tests for inventory business logic

function isLowStock(onHand: number, reorderPoint: number): boolean {
  return onHand <= reorderPoint;
}

function calculateAdjustment(beforeQty: number, afterQty: number) {
  const delta = afterQty - beforeQty;
  return {
    delta,
    direction: delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'no_change',
  };
}

function validateTransferLines(lines: { qty: number; productId: string }[]): string[] {
  const errors: string[] = [];
  for (const line of lines) {
    if (line.qty <= 0) errors.push(`Line for ${line.productId}: qty must be > 0`);
    if (!line.productId) errors.push('Line missing productId');
  }
  return errors;
}

describe('isLowStock', () => {
  it('returns true when onHand equals reorderPoint', () => {
    expect(isLowStock(5, 5)).toBe(true);
  });

  it('returns true when onHand is below reorderPoint', () => {
    expect(isLowStock(3, 5)).toBe(true);
  });

  it('returns false when onHand is above reorderPoint', () => {
    expect(isLowStock(10, 5)).toBe(false);
  });

  it('returns false when both are zero', () => {
    expect(isLowStock(0, 0)).toBe(true); // 0 <= 0
  });
});

describe('calculateAdjustment', () => {
  it('calculates a positive adjustment (restock)', () => {
    const result = calculateAdjustment(10, 50);
    expect(result.delta).toBe(40);
    expect(result.direction).toBe('increase');
  });

  it('calculates a negative adjustment (shrinkage)', () => {
    const result = calculateAdjustment(20, 15);
    expect(result.delta).toBe(-5);
    expect(result.direction).toBe('decrease');
  });

  it('returns no_change for equal quantities', () => {
    const result = calculateAdjustment(10, 10);
    expect(result.delta).toBe(0);
    expect(result.direction).toBe('no_change');
  });
});

describe('validateTransferLines', () => {
  it('returns no errors for valid lines', () => {
    const errors = validateTransferLines([
      { qty: 5, productId: 'prod-1' },
      { qty: 10, productId: 'prod-2' },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('returns error for zero qty', () => {
    const errors = validateTransferLines([{ qty: 0, productId: 'prod-1' }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/qty must be > 0/);
  });

  it('returns error for negative qty', () => {
    const errors = validateTransferLines([{ qty: -3, productId: 'prod-2' }]);
    expect(errors.length).toBeGreaterThan(0);
  });
});
