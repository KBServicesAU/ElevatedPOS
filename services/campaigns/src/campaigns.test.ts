import { describe, it, expect } from 'vitest';

// Unit tests for campaign business logic

type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';

function isEditable(status: CampaignStatus): boolean {
  return status === 'draft' || status === 'scheduled';
}

function canActivate(status: CampaignStatus, scheduledAt?: string): boolean {
  if (status !== 'scheduled') return false;
  if (!scheduledAt) return false;
  return new Date(scheduledAt) <= new Date();
}

function estimateReach(
  totalCustomers: number,
  optInRate: number,
  segmentFilter: number,
): number {
  return Math.floor(totalCustomers * optInRate * segmentFilter);
}

function buildSubjectLine(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function validateSendSchedule(scheduledAt: string): { valid: boolean; error?: string } {
  const date = new Date(scheduledAt);
  if (isNaN(date.getTime())) return { valid: false, error: 'Invalid date' };
  if (date <= new Date()) return { valid: false, error: 'Scheduled time must be in the future' };
  return { valid: true };
}

function campaignTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    email: 'Email Campaign',
    sms: 'SMS Campaign',
    push: 'Push Notification',
    discount: 'Discount Offer',
    points_multiplier: 'Points Multiplier',
  };
  return labels[type] ?? 'Campaign';
}

describe('isEditable', () => {
  it('draft campaigns are editable', () => {
    expect(isEditable('draft')).toBe(true);
  });

  it('scheduled campaigns are editable', () => {
    expect(isEditable('scheduled')).toBe(true);
  });

  it('active campaigns are not editable', () => {
    expect(isEditable('active')).toBe(false);
  });

  it('completed campaigns are not editable', () => {
    expect(isEditable('completed')).toBe(false);
  });
});

describe('canActivate', () => {
  it('activates scheduled campaign past scheduled time', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(canActivate('scheduled', past)).toBe(true);
  });

  it('does not activate future scheduled campaign', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(canActivate('scheduled', future)).toBe(false);
  });

  it('does not activate draft campaign', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(canActivate('draft', past)).toBe(false);
  });

  it('does not activate without scheduledAt', () => {
    expect(canActivate('scheduled', undefined)).toBe(false);
  });
});

describe('estimateReach', () => {
  it('estimates reach correctly', () => {
    // 1000 customers × 80% opt-in × 50% segment = 400
    expect(estimateReach(1000, 0.8, 0.5)).toBe(400);
  });

  it('returns 0 when opt-in rate is 0', () => {
    expect(estimateReach(1000, 0, 1)).toBe(0);
  });

  it('floors fractional results', () => {
    expect(estimateReach(3, 1, 1)).toBe(3);
  });
});

describe('buildSubjectLine', () => {
  it('replaces known template variables', () => {
    const result = buildSubjectLine('Hi {{firstName}}, your order {{orderNumber}} is ready!', {
      firstName: 'Jane',
      orderNumber: 'ORD-1042',
    });
    expect(result).toBe('Hi Jane, your order ORD-1042 is ready!');
  });

  it('leaves unknown variables as-is', () => {
    const result = buildSubjectLine('{{greeting}} {{name}}!', { name: 'Sarah' });
    expect(result).toBe('{{greeting}} Sarah!');
  });

  it('handles empty vars', () => {
    const result = buildSubjectLine('Static subject', {});
    expect(result).toBe('Static subject');
  });
});

describe('validateSendSchedule', () => {
  it('rejects past dates', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const result = validateSendSchedule(past);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/future/i);
  });

  it('accepts future dates', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(validateSendSchedule(future).valid).toBe(true);
  });

  it('rejects invalid date strings', () => {
    const result = validateSendSchedule('not-a-date');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid date/i);
  });
});

describe('campaignTypeLabel', () => {
  it('returns correct label for email', () => {
    expect(campaignTypeLabel('email')).toBe('Email Campaign');
  });

  it('returns correct label for points_multiplier', () => {
    expect(campaignTypeLabel('points_multiplier')).toBe('Points Multiplier');
  });

  it('falls back to Campaign for unknown types', () => {
    expect(campaignTypeLabel('unknown_type')).toBe('Campaign');
  });
});
