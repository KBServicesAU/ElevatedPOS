import { describe, it, expect } from 'vitest';

// Unit tests for integrations business logic

function normaliseWebhookUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return 'https://' + trimmed;
  }
  return trimmed;
}

function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function generateWebhookSecret(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function maskWebhookSecret(secret: string): string {
  if (secret.length <= 8) return '****';
  return secret.slice(0, 4) + '****' + secret.slice(-4);
}

type WebhookEvent =
  | 'order.created'
  | 'order.updated'
  | 'customer.created'
  | 'payment.captured'
  | 'inventory.low_stock';

function isValidEvent(event: string): event is WebhookEvent {
  return [
    'order.created',
    'order.updated',
    'customer.created',
    'payment.captured',
    'inventory.low_stock',
  ].includes(event);
}

function formatEventList(events: string[]): string {
  if (events.length === 0) return 'No events';
  if (events.length === 1) return events[0];
  if (events.length === 2) return `${events[0]} and ${events[1]}`;
  return `${events[0]}, ${events[1]}, +${events.length - 2} more`;
}

function deliveryStatusIcon(success: boolean): '✓' | '✗' {
  return success ? '✓' : '✗';
}

function appCategoryFromId(appId: string): string {
  if (appId.startsWith('pos_')) return 'POS';
  if (appId.startsWith('ecom_')) return 'E-Commerce';
  if (appId.startsWith('acct_')) return 'Accounting';
  if (appId.startsWith('ship_')) return 'Shipping';
  if (appId.startsWith('mktg_')) return 'Marketing';
  return 'Other';
}

function buildWebhookPayloadPreview(payload: Record<string, unknown>, maxKeys = 3): string {
  const keys = Object.keys(payload).slice(0, maxKeys);
  const preview = keys.map((k) => `${k}: ${JSON.stringify(payload[k])}`).join(', ');
  const extra = Object.keys(payload).length - keys.length;
  return extra > 0 ? `{ ${preview}, +${extra} more }` : `{ ${preview} }`;
}

describe('normaliseWebhookUrl', () => {
  it('prepends https to bare domain', () => {
    expect(normaliseWebhookUrl('example.com/hook')).toBe('https://example.com/hook');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normaliseWebhookUrl('  https://example.com/hook  ')).toBe('https://example.com/hook');
  });

  it('leaves existing https:// urls unchanged', () => {
    expect(normaliseWebhookUrl('https://example.com/hook')).toBe('https://example.com/hook');
  });

  it('leaves existing http:// urls unchanged', () => {
    expect(normaliseWebhookUrl('http://localhost:3000/hook')).toBe('http://localhost:3000/hook');
  });
});

describe('isValidWebhookUrl', () => {
  it('accepts valid https urls', () => {
    expect(isValidWebhookUrl('https://example.com/webhook')).toBe(true);
  });

  it('accepts valid http urls', () => {
    expect(isValidWebhookUrl('http://localhost:3000/webhook')).toBe(true);
  });

  it('rejects invalid urls', () => {
    expect(isValidWebhookUrl('not a url')).toBe(false);
    expect(isValidWebhookUrl('')).toBe(false);
  });
});

describe('generateWebhookSecret', () => {
  it('generates a string of the requested length', () => {
    const secret = generateWebhookSecret(32);
    expect(secret).toHaveLength(32);
  });

  it('generates only alphanumeric characters', () => {
    const secret = generateWebhookSecret(100);
    expect(/^[A-Za-z0-9]+$/.test(secret)).toBe(true);
  });

  it('generates different values on each call', () => {
    const a = generateWebhookSecret(32);
    const b = generateWebhookSecret(32);
    expect(a).not.toBe(b);
  });
});

describe('maskWebhookSecret', () => {
  it('masks middle portion of long secrets', () => {
    const result = maskWebhookSecret('ABCD1234WXYZ5678');
    expect(result).toBe('ABCD****5678');
  });

  it('returns **** for short secrets', () => {
    expect(maskWebhookSecret('12345678')).toBe('****');
    expect(maskWebhookSecret('abc')).toBe('****');
  });
});

describe('isValidEvent', () => {
  it('accepts known event names', () => {
    expect(isValidEvent('order.created')).toBe(true);
    expect(isValidEvent('inventory.low_stock')).toBe(true);
  });

  it('rejects unknown event names', () => {
    expect(isValidEvent('order.deleted')).toBe(false);
    expect(isValidEvent('')).toBe(false);
  });
});

describe('formatEventList', () => {
  it('returns "No events" for empty array', () => {
    expect(formatEventList([])).toBe('No events');
  });

  it('returns the single event name for one event', () => {
    expect(formatEventList(['order.created'])).toBe('order.created');
  });

  it('joins two events with "and"', () => {
    expect(formatEventList(['order.created', 'order.updated'])).toBe('order.created and order.updated');
  });

  it('shows first two plus count for three or more events', () => {
    const result = formatEventList(['order.created', 'order.updated', 'customer.created', 'payment.captured']);
    expect(result).toBe('order.created, order.updated, +2 more');
  });
});

describe('deliveryStatusIcon', () => {
  it('returns ✓ for successful deliveries', () => {
    expect(deliveryStatusIcon(true)).toBe('✓');
  });

  it('returns ✗ for failed deliveries', () => {
    expect(deliveryStatusIcon(false)).toBe('✗');
  });
});

describe('appCategoryFromId', () => {
  it('identifies POS apps', () => {
    expect(appCategoryFromId('pos_square')).toBe('POS');
  });

  it('identifies e-commerce apps', () => {
    expect(appCategoryFromId('ecom_shopify')).toBe('E-Commerce');
  });

  it('identifies accounting apps', () => {
    expect(appCategoryFromId('acct_xero')).toBe('Accounting');
  });

  it('returns Other for unknown prefixes', () => {
    expect(appCategoryFromId('misc_app')).toBe('Other');
  });
});

describe('buildWebhookPayloadPreview', () => {
  it('shows all keys when under limit', () => {
    const result = buildWebhookPayloadPreview({ id: '123', status: 'paid' });
    expect(result).toContain('id:');
    expect(result).toContain('status:');
    expect(result).not.toContain('+');
  });

  it('truncates and shows overflow count when over limit', () => {
    const result = buildWebhookPayloadPreview(
      { a: 1, b: 2, c: 3, d: 4, e: 5 },
      3,
    );
    expect(result).toContain('+2 more');
  });

  it('handles empty payload', () => {
    expect(buildWebhookPayloadPreview({})).toBe('{  }');
  });
});
