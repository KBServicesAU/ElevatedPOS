import { describe, it, expect } from 'vitest';

// Unit tests for loyalty points business logic

function calculatePointsEarned(orderTotal: number, earnRate: number, multiplier = 1.0): number {
  return Math.floor(orderTotal * earnRate * multiplier);
}

function getTierForPoints(points: number, tiers: { name: string; minPoints: number; maxPoints: number | null }[]) {
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  return sorted.find((t) => points >= t.minPoints) ?? tiers[0];
}

function buildIdempotencyKey(orderId: string, type: 'earn' | 'redeem'): string {
  return `${orderId}:${type}`;
}

const TIERS = [
  { name: 'Bronze',   minPoints: 0,    maxPoints: 499 },
  { name: 'Silver',   minPoints: 500,  maxPoints: 1999 },
  { name: 'Gold',     minPoints: 2000, maxPoints: 4999 },
  { name: 'Platinum', minPoints: 5000, maxPoints: null },
];

describe('calculatePointsEarned', () => {
  it('calculates correct points for a $50 order at 10 pts/$1', () => {
    expect(calculatePointsEarned(50, 10)).toBe(500);
  });

  it('floors fractional points', () => {
    expect(calculatePointsEarned(5.55, 10)).toBe(55); // 55.5 → 55
  });

  it('applies multiplier for Silver tier (1.25x)', () => {
    expect(calculatePointsEarned(100, 10, 1.25)).toBe(1250);
  });

  it('returns 0 for a $0 order', () => {
    expect(calculatePointsEarned(0, 10)).toBe(0);
  });
});

describe('getTierForPoints', () => {
  it('returns Bronze for 0 points', () => {
    expect(getTierForPoints(0, TIERS)?.name).toBe('Bronze');
  });

  it('returns Silver for exactly 500 points', () => {
    expect(getTierForPoints(500, TIERS)?.name).toBe('Silver');
  });

  it('returns Gold for 2500 points', () => {
    expect(getTierForPoints(2500, TIERS)?.name).toBe('Gold');
  });

  it('returns Platinum for 10000 points', () => {
    expect(getTierForPoints(10000, TIERS)?.name).toBe('Platinum');
  });

  it('returns Gold for 4999 (just below Platinum)', () => {
    expect(getTierForPoints(4999, TIERS)?.name).toBe('Gold');
  });
});

describe('buildIdempotencyKey', () => {
  it('builds a deterministic key for earn', () => {
    const key = buildIdempotencyKey('ord_123', 'earn');
    expect(key).toBe('ord_123:earn');
  });

  it('builds a deterministic key for redeem', () => {
    const key = buildIdempotencyKey('ord_456', 'redeem');
    expect(key).toBe('ord_456:redeem');
  });

  it('produces unique keys for different order IDs', () => {
    const k1 = buildIdempotencyKey('ord_001', 'earn');
    const k2 = buildIdempotencyKey('ord_002', 'earn');
    expect(k1).not.toBe(k2);
  });
});
