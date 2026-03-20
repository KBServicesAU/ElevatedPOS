import { describe, it, expect } from 'vitest';

// Unit tests for customer business logic

function buildFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(0, local.length - 2))}@${domain}`;
}

function isValidPhone(phone: string): boolean {
  return /^\+?[0-9\s\-().]{7,20}$/.test(phone.trim());
}

function calculateDaysSinceVisit(lastVisitIso: string): number {
  const ms = Date.now() - new Date(lastVisitIso).getTime();
  return Math.floor(ms / 86_400_000);
}

function isAtRisk(lastVisitDays: number, thresholdDays = 30): boolean {
  return lastVisitDays > thresholdDays;
}

function applyStoreCredit(totalCents: number, creditCents: number): { charge: number; creditUsed: number } {
  const creditUsed = Math.min(creditCents, totalCents);
  return { charge: totalCents - creditUsed, creditUsed };
}

describe('buildFullName', () => {
  it('combines first and last name', () => {
    expect(buildFullName('Jane', 'Smith')).toBe('Jane Smith');
  });

  it('trims surrounding whitespace', () => {
    expect(buildFullName('  Jane ', ' Smith  ')).toBe('Jane Smith');
  });
});

describe('maskEmail', () => {
  it('masks middle of local part', () => {
    expect(maskEmail('john.doe@example.com')).toBe('jo******@example.com');
  });

  it('handles short local part', () => {
    expect(maskEmail('ab@test.com')).toBe('ab@test.com');
  });

  it('handles single char local part without masking', () => {
    expect(maskEmail('a@x.com')).toContain('@x.com');
  });
});

describe('isValidPhone', () => {
  it('accepts Australian mobile', () => {
    expect(isValidPhone('+61 412 345 678')).toBe(true);
  });

  it('accepts US format', () => {
    expect(isValidPhone('+1 (555) 000-1234')).toBe(true);
  });

  it('rejects too-short number', () => {
    expect(isValidPhone('123')).toBe(false);
  });

  it('rejects number with letters', () => {
    expect(isValidPhone('555-CALL-US')).toBe(false);
  });
});

describe('calculateDaysSinceVisit', () => {
  it('returns 0 for today', () => {
    const today = new Date().toISOString();
    expect(calculateDaysSinceVisit(today)).toBe(0);
  });

  it('returns approximately 7 for a week ago', () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const result = calculateDaysSinceVisit(weekAgo);
    expect(result).toBeGreaterThanOrEqual(6);
    expect(result).toBeLessThanOrEqual(8);
  });
});

describe('isAtRisk', () => {
  it('returns true when days > threshold', () => {
    expect(isAtRisk(45, 30)).toBe(true);
  });

  it('returns false when days <= threshold', () => {
    expect(isAtRisk(30, 30)).toBe(false);
  });

  it('uses default threshold of 30 days', () => {
    expect(isAtRisk(31)).toBe(true);
    expect(isAtRisk(29)).toBe(false);
  });
});

describe('applyStoreCredit', () => {
  it('applies partial credit when credit < total', () => {
    const result = applyStoreCredit(1000, 300);
    expect(result.charge).toBe(700);
    expect(result.creditUsed).toBe(300);
  });

  it('zeroes charge when credit >= total', () => {
    const result = applyStoreCredit(500, 600);
    expect(result.charge).toBe(0);
    expect(result.creditUsed).toBe(500);
  });

  it('does not apply credit when zero', () => {
    const result = applyStoreCredit(1000, 0);
    expect(result.charge).toBe(1000);
    expect(result.creditUsed).toBe(0);
  });
});
