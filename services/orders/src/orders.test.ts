import { describe, it, expect } from 'vitest';

// Unit tests for order business logic helpers (no DB/Kafka required)

function calculateOrderTotals(lines: { qty: number; unitPrice: number }[], taxRate = 0.1) {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const taxTotal = parseFloat((subtotal * taxRate).toFixed(2));
  const total = parseFloat((subtotal + taxTotal).toFixed(2));
  return { subtotal, taxTotal, total };
}

function generateOrderNumber(locationCode = 'HQ') {
  return `${locationCode}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function isRefundable(status: string) {
  return status === 'completed' || status === 'partially_refunded';
}

describe('calculateOrderTotals', () => {
  it('calculates correct totals for a single line', () => {
    const result = calculateOrderTotals([{ qty: 2, unitPrice: 5.5 }]);
    expect(result.subtotal).toBe(11);
    expect(result.taxTotal).toBe(1.1);
    expect(result.total).toBe(12.1);
  });

  it('calculates correct totals for multiple lines', () => {
    const result = calculateOrderTotals([
      { qty: 1, unitPrice: 5.5 },
      { qty: 2, unitPrice: 3.0 },
      { qty: 1, unitPrice: 18.0 },
    ]);
    expect(result.subtotal).toBe(29.5);
    expect(result.taxTotal).toBe(2.95);
    expect(result.total).toBe(32.45);
  });

  it('returns zero totals for empty lines', () => {
    const result = calculateOrderTotals([]);
    expect(result.subtotal).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.total).toBe(0);
  });

  it('handles custom tax rates', () => {
    const result = calculateOrderTotals([{ qty: 1, unitPrice: 100 }], 0.15);
    expect(result.taxTotal).toBe(15);
    expect(result.total).toBe(115);
  });
});

describe('generateOrderNumber', () => {
  it('returns a string starting with the location code', () => {
    expect(generateOrderNumber('CBD').startsWith('CBD-')).toBe(true);
  });

  it('number portion is 4 digits', () => {
    const num = generateOrderNumber();
    const parts = num.split('-');
    expect(parts[1]).toMatch(/^\d{4}$/);
  });
});

describe('isRefundable', () => {
  it('allows refund for completed orders', () => {
    expect(isRefundable('completed')).toBe(true);
  });

  it('allows refund for partially_refunded orders', () => {
    expect(isRefundable('partially_refunded')).toBe(true);
  });

  it('rejects refund for open, cancelled, or pending orders', () => {
    expect(isRefundable('open')).toBe(false);
    expect(isRefundable('cancelled')).toBe(false);
    expect(isRefundable('pending')).toBe(false);
  });
});
