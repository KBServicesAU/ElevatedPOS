import { describe, it, expect } from 'vitest';

// Unit tests for notifications business logic

type NotificationChannel = 'email' | 'sms' | 'push';
type NotificationStatus = 'queued' | 'sent' | 'failed';

function isValidRecipient(channel: NotificationChannel, recipient: string): boolean {
  if (channel === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
  }
  if (channel === 'sms') {
    return /^\+?[1-9]\d{7,14}$/.test(recipient);
  }
  // push: any non-empty device token
  return recipient.trim().length > 0;
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  const vars = new Set<string>();
  for (const m of matches) vars.add(m[1]);
  return [...vars];
}

function missingVariables(template: string, vars: Record<string, string>): string[] {
  return extractVariables(template).filter((v) => !(v in vars));
}

function channelLabel(channel: NotificationChannel): string {
  const labels: Record<NotificationChannel, string> = {
    email: 'Email',
    sms: 'SMS',
    push: 'Push Notification',
  };
  return labels[channel];
}

function statusBadge(status: NotificationStatus): 'green' | 'yellow' | 'red' {
  if (status === 'sent') return 'green';
  if (status === 'queued') return 'yellow';
  return 'red';
}

function truncateBody(body: string, maxLength = 160): string {
  if (body.length <= maxLength) return body;
  return body.slice(0, maxLength - 1) + '…';
}

function buildSubjectPreview(subject: string | undefined, channel: NotificationChannel): string {
  if (channel === 'sms' || channel === 'push') return '';
  return subject ?? '(no subject)';
}

describe('isValidRecipient', () => {
  it('accepts valid email address', () => {
    expect(isValidRecipient('email', 'user@example.com')).toBe(true);
  });

  it('rejects email without @', () => {
    expect(isValidRecipient('email', 'userexample.com')).toBe(false);
  });

  it('accepts valid E.164 phone number for sms', () => {
    expect(isValidRecipient('sms', '+14155550100')).toBe(true);
  });

  it('rejects phone number that is too short for sms', () => {
    expect(isValidRecipient('sms', '+123')).toBe(false);
  });

  it('accepts any non-empty token for push', () => {
    expect(isValidRecipient('push', 'ExponentPushToken[xxxxxx]')).toBe(true);
  });

  it('rejects blank token for push', () => {
    expect(isValidRecipient('push', '   ')).toBe(false);
  });
});

describe('renderTemplate', () => {
  it('replaces known variables', () => {
    const result = renderTemplate('Hello {{name}}, your code is {{code}}!', {
      name: 'Alice',
      code: 'ABC123',
    });
    expect(result).toBe('Hello Alice, your code is ABC123!');
  });

  it('leaves unknown variables intact', () => {
    const result = renderTemplate('Hi {{name}}, see {{unknown}}', { name: 'Bob' });
    expect(result).toBe('Hi Bob, see {{unknown}}');
  });

  it('handles template with no variables', () => {
    expect(renderTemplate('Static message', {})).toBe('Static message');
  });
});

describe('extractVariables', () => {
  it('extracts all unique variable names', () => {
    const vars = extractVariables('Hello {{firstName}} {{lastName}}, order {{orderId}} is ready.');
    expect(vars).toContain('firstName');
    expect(vars).toContain('lastName');
    expect(vars).toContain('orderId');
    expect(vars).toHaveLength(3);
  });

  it('deduplicates repeated variable names', () => {
    const vars = extractVariables('{{name}} and {{name}} again');
    expect(vars).toEqual(['name']);
  });

  it('returns empty array for templates without variables', () => {
    expect(extractVariables('No variables here')).toEqual([]);
  });
});

describe('missingVariables', () => {
  it('returns names of variables not provided', () => {
    const missing = missingVariables('Hi {{name}}, code {{code}}', { name: 'Sam' });
    expect(missing).toEqual(['code']);
  });

  it('returns empty array when all variables are provided', () => {
    const missing = missingVariables('Hi {{name}}', { name: 'Sam' });
    expect(missing).toEqual([]);
  });
});

describe('channelLabel', () => {
  it('returns correct label for email', () => {
    expect(channelLabel('email')).toBe('Email');
  });

  it('returns correct label for sms', () => {
    expect(channelLabel('sms')).toBe('SMS');
  });

  it('returns correct label for push', () => {
    expect(channelLabel('push')).toBe('Push Notification');
  });
});

describe('statusBadge', () => {
  it('returns green for sent', () => {
    expect(statusBadge('sent')).toBe('green');
  });

  it('returns yellow for queued', () => {
    expect(statusBadge('queued')).toBe('yellow');
  });

  it('returns red for failed', () => {
    expect(statusBadge('failed')).toBe('red');
  });
});

describe('truncateBody', () => {
  it('does not truncate short messages', () => {
    expect(truncateBody('Short message')).toBe('Short message');
  });

  it('truncates at maxLength and appends ellipsis', () => {
    const long = 'A'.repeat(200);
    const result = truncateBody(long, 160);
    expect(result).toHaveLength(160);
    expect(result.endsWith('…')).toBe(true);
  });

  it('exact length message is not truncated', () => {
    const exact = 'B'.repeat(160);
    expect(truncateBody(exact, 160)).toBe(exact);
  });
});

describe('buildSubjectPreview', () => {
  it('returns subject for email channel', () => {
    expect(buildSubjectPreview('Your receipt', 'email')).toBe('Your receipt');
  });

  it('returns (no subject) when subject is undefined for email', () => {
    expect(buildSubjectPreview(undefined, 'email')).toBe('(no subject)');
  });

  it('returns empty string for sms channel', () => {
    expect(buildSubjectPreview('Any subject', 'sms')).toBe('');
  });

  it('returns empty string for push channel', () => {
    expect(buildSubjectPreview('Any subject', 'push')).toBe('');
  });
});
