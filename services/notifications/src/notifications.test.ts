import { describe, it, expect } from 'vitest';
import {
  formatNotificationMessage,
  validateRecipient,
  buildPushPayload,
  deduplicateNotification,
  prioritiseChannel,
  shouldSendNotification,
} from './lib/utils.js';

// ─── formatNotificationMessage ────────────────────────────────────────────────

describe('formatNotificationMessage', () => {
  it('replaces a single {{firstName}} token', () => {
    const result = formatNotificationMessage('Hello, {{firstName}}!', { firstName: 'Alice' });
    expect(result).toBe('Hello, Alice!');
  });

  it('replaces multiple tokens including numeric loyaltyBalance', () => {
    const result = formatNotificationMessage(
      'Hi {{firstName}}, you have {{loyaltyBalance}} points.',
      { firstName: 'Bob', loyaltyBalance: 250 },
    );
    expect(result).toBe('Hi Bob, you have 250 points.');
  });

  it('leaves unknown tokens intact when no value provided', () => {
    const result = formatNotificationMessage('Dear {{firstName}} {{lastName}}', {
      firstName: 'Carol',
    });
    expect(result).toBe('Dear Carol {{lastName}}');
  });

  it('returns the template unchanged when token map is empty', () => {
    const template = 'No tokens here.';
    expect(formatNotificationMessage(template, {})).toBe(template);
  });
});

// ─── validateRecipient ────────────────────────────────────────────────────────

describe('validateRecipient', () => {
  it('accepts a valid email address and reports email channel', () => {
    const result = validateRecipient('user@example.com');
    expect(result.valid).toBe(true);
    expect(result.channel).toBe('email');
  });

  it('accepts a valid E.164 phone number and reports sms channel', () => {
    const result = validateRecipient('+14155552671');
    expect(result.valid).toBe(true);
    expect(result.channel).toBe('sms');
  });

  it('rejects an empty string with a required error', () => {
    const result = validateRecipient('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it('rejects a value that is neither email nor E.164', () => {
    const result = validateRecipient('plaintext');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── buildPushPayload ─────────────────────────────────────────────────────────

describe('buildPushPayload', () => {
  it('builds a payload with the correct title and body', () => {
    const payload = buildPushPayload('Order Ready', 'Your order #42 is ready for pickup.', {});
    expect(payload.notification.title).toBe('Order Ready');
    expect(payload.notification.body).toBe('Your order #42 is ready for pickup.');
  });

  it('coerces numeric data values to strings as required by FCM', () => {
    const payload = buildPushPayload('Points', 'You earned points', { points: 100 });
    expect(payload.data['points']).toBe('100');
  });

  it('sets android priority to high and APNS priority to 10', () => {
    const payload = buildPushPayload('Alert', 'Test', {});
    expect(payload.android.priority).toBe('high');
    expect(payload.apns.headers['apns-priority']).toBe('10');
  });

  it('handles missing data argument and defaults to empty data object', () => {
    const payload = buildPushPayload('Hi', 'Body');
    expect(payload.data).toEqual({});
  });
});

// ─── deduplicateNotification ──────────────────────────────────────────────────

describe('deduplicateNotification', () => {
  it('returns false when the id has never been seen', () => {
    const recent = new Map<string, number>();
    expect(deduplicateNotification(recent, 'notif-1', 60_000)).toBe(false);
  });

  it('returns true when the id was seen within the dedup window', () => {
    const recent = new Map<string, number>([['notif-1', Date.now() - 5_000]]);
    expect(deduplicateNotification(recent, 'notif-1', 60_000)).toBe(true);
  });

  it('returns false when the id was seen outside the dedup window', () => {
    const recent = new Map<string, number>([['notif-1', Date.now() - 120_000]]);
    expect(deduplicateNotification(recent, 'notif-1', 60_000)).toBe(false);
  });

  it('distinguishes between different notification ids', () => {
    const recent = new Map<string, number>([['notif-1', Date.now() - 5_000]]);
    expect(deduplicateNotification(recent, 'notif-2', 60_000)).toBe(false);
  });
});

// ─── prioritiseChannel ────────────────────────────────────────────────────────

describe('prioritiseChannel', () => {
  it('returns the customer preferred channel when it is available', () => {
    const customer = {
      preferredChannel: 'sms' as const,
      hasEmail: true,
      hasPhone: true,
      hasPushToken: false,
    };
    expect(prioritiseChannel(customer, 'order.completed')).toBe('sms');
  });

  it('falls back to event-type default when the preferred channel is unavailable', () => {
    const customer = {
      preferredChannel: 'push' as const,
      hasEmail: true,
      hasPhone: false,
      hasPushToken: false, // push not available
    };
    // order.completed defaults to email
    expect(prioritiseChannel(customer, 'order.completed')).toBe('email');
  });

  it('respects channel opt-outs when selecting fallback', () => {
    const customer = {
      preferredChannel: 'email' as const,
      hasEmail: true,
      hasPhone: true,
      hasPushToken: false,
      optOuts: ['email' as const],
    };
    expect(prioritiseChannel(customer, 'order.completed')).toBe('sms');
  });

  it('returns null when no channel is reachable', () => {
    const customer = { hasEmail: false, hasPhone: false, hasPushToken: false };
    expect(prioritiseChannel(customer, 'order.completed')).toBeNull();
  });
});

// ─── shouldSendNotification ───────────────────────────────────────────────────

describe('shouldSendNotification', () => {
  it('returns false when globalOptOut is true regardless of event type', () => {
    const prefs = { globalOptOut: true, optIns: [], optOuts: [] };
    expect(shouldSendNotification(prefs, 'order.completed')).toBe(false);
  });

  it('returns false when the event type is in optOuts', () => {
    const prefs = { globalOptOut: false, optIns: [], optOuts: ['order.completed'] };
    expect(shouldSendNotification(prefs, 'order.completed')).toBe(false);
  });

  it('returns true when the event type appears in a non-empty optIns list', () => {
    const prefs = { globalOptOut: false, optIns: ['loyalty.tier_changed'], optOuts: [] };
    expect(shouldSendNotification(prefs, 'loyalty.tier_changed')).toBe(true);
  });

  it('returns true when optIns is empty and the event is not opted out', () => {
    const prefs = { globalOptOut: false, optIns: [], optOuts: [] };
    expect(shouldSendNotification(prefs, 'order.completed')).toBe(true);
  });
});
