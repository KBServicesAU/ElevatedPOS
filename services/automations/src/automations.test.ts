import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluateConditions,
  buildTriggerKey,
  isWithinSchedule,
  parseActionConfig,
  computeRetryDelay,
} from './lib/utils.js';

// ─── evaluateCondition ────────────────────────────────────────────────────────

describe('evaluateCondition', () => {
  it('evaluates eq operator: matches when field equals expected value', () => {
    expect(evaluateCondition({ field: 'status', operator: 'eq', value: 'paid' }, { status: 'paid' })).toBe(true);
  });

  it('evaluates gt operator: returns false when actual is less than value', () => {
    expect(evaluateCondition({ field: 'total', operator: 'gt', value: 100 }, { total: 50 })).toBe(false);
  });

  it('evaluates contains operator: returns true when string contains substring', () => {
    expect(
      evaluateCondition({ field: 'tier', operator: 'contains', value: 'gold' }, { tier: 'gold-vip' }),
    ).toBe(true);
  });

  it('evaluates in operator: returns true when actual is in expected array', () => {
    expect(
      evaluateCondition(
        { field: 'channel', operator: 'in', value: ['web', 'mobile'] },
        { channel: 'mobile' },
      ),
    ).toBe(true);
  });
});

// ─── evaluateConditions ───────────────────────────────────────────────────────

describe('evaluateConditions', () => {
  it('returns true for an empty conditions array', () => {
    expect(evaluateConditions([], {}, 'AND')).toBe(true);
  });

  it('AND logic: returns false when any condition fails', () => {
    const conditions = [
      { field: 'total', operator: 'gt' as const, value: 50 },
      { field: 'status', operator: 'eq' as const, value: 'paid' },
    ];
    expect(evaluateConditions(conditions, { total: 100, status: 'pending' }, 'AND')).toBe(false);
  });

  it('OR logic: returns true when at least one condition passes', () => {
    const conditions = [
      { field: 'total', operator: 'gt' as const, value: 200 },
      { field: 'status', operator: 'eq' as const, value: 'paid' },
    ];
    expect(evaluateConditions(conditions, { total: 100, status: 'paid' }, 'OR')).toBe(true);
  });

  it('AND logic: returns true when all conditions pass', () => {
    const conditions = [
      { field: 'total', operator: 'gte' as const, value: 100 },
      { field: 'status', operator: 'eq' as const, value: 'paid' },
    ];
    expect(evaluateConditions(conditions, { total: 100, status: 'paid' }, 'AND')).toBe(true);
  });
});

// ─── buildTriggerKey ──────────────────────────────────────────────────────────

describe('buildTriggerKey', () => {
  it('builds a key with expected format', () => {
    const key = buildTriggerKey('auto-123', 'evt-456');
    expect(key).toBe('automation:auto-123:event:evt-456');
  });

  it('produces unique keys for different automation IDs', () => {
    const k1 = buildTriggerKey('auto-1', 'evt-1');
    const k2 = buildTriggerKey('auto-2', 'evt-1');
    expect(k1).not.toBe(k2);
  });

  it('produces unique keys for different event IDs', () => {
    const k1 = buildTriggerKey('auto-1', 'evt-1');
    const k2 = buildTriggerKey('auto-1', 'evt-2');
    expect(k1).not.toBe(k2);
  });

  it('handles UUID-style IDs correctly', () => {
    const key = buildTriggerKey(
      '550e8400-e29b-41d4-a716-446655440000',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    );
    expect(key).toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(key).toContain('f47ac10b-58cc-4372-a567-0e02b2c3d479');
  });
});

// ─── isWithinSchedule ─────────────────────────────────────────────────────────

describe('isWithinSchedule', () => {
  it('returns true when schedule has no constraints', () => {
    expect(isWithinSchedule({}, new Date())).toBe(true);
  });

  it('returns false when current time is before startAt', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(isWithinSchedule({ startAt: future }, new Date())).toBe(false);
  });

  it('returns false when current time is after endAt', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isWithinSchedule({ endAt: past }, new Date())).toBe(false);
  });

  it('returns false when current day of week is not in daysOfWeek', () => {
    // Use a fixed Monday (day=1) and allow only Sunday (0)
    const monday = new Date('2026-03-23T10:00:00Z'); // March 23 2026 is a Monday
    expect(isWithinSchedule({ daysOfWeek: [0] }, monday)).toBe(false);
  });
});

// ─── parseActionConfig ────────────────────────────────────────────────────────

describe('parseActionConfig', () => {
  it('accepts a valid send_email config with all required fields', () => {
    const result = parseActionConfig('send_email', {
      to: 'user@example.com',
      subject: 'Hello',
      body: 'Welcome!',
    });
    expect(result.valid).toBe(true);
    expect(result.parsed?.type).toBe('send_email');
  });

  it('rejects send_email config missing required subject field', () => {
    const result = parseActionConfig('send_email', { to: 'user@example.com', body: 'Hi' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/subject/i);
  });

  it('accepts a valid add_loyalty_points config', () => {
    const result = parseActionConfig('add_loyalty_points', {
      accountId: 'acc-1',
      points: 100,
    });
    expect(result.valid).toBe(true);
  });

  it('returns valid: false for an unknown action type', () => {
    // @ts-expect-error intentional unknown type
    const result = parseActionConfig('unknown_type', {});
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unknown/i);
  });
});

// ─── computeRetryDelay ────────────────────────────────────────────────────────

describe('computeRetryDelay', () => {
  it('returns 1 minute (60000ms) for attempt 1', () => {
    expect(computeRetryDelay(1)).toBe(60_000);
  });

  it('returns 5 minutes (300000ms) for attempt 2', () => {
    expect(computeRetryDelay(2)).toBe(300_000);
  });

  it('returns 30 minutes (1800000ms) for attempt 3', () => {
    expect(computeRetryDelay(3)).toBe(1_800_000);
  });

  it('returns 24 hours (86400000ms) for attempt 5 and above', () => {
    expect(computeRetryDelay(5)).toBe(86_400_000);
    expect(computeRetryDelay(10)).toBe(86_400_000);
  });
});
