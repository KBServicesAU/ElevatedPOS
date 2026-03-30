/**
 * Notification utility functions — pure, side-effect-free helpers.
 */

// ─── formatNotificationMessage ────────────────────────────────────────────────

/**
 * Replaces {{tokenName}} placeholders in a template string with values from
 * the provided token map. Unknown tokens are left intact.
 */
export function formatNotificationMessage(
  template: string,
  tokens: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const val = tokens[key];
    return val !== undefined ? String(val) : match;
  });
}

// ─── validateRecipient ────────────────────────────────────────────────────────

export interface RecipientValidationResult {
  valid: boolean;
  channel?: 'email' | 'sms';
  error?: string;
}

/**
 * Validates an email address or E.164 phone number.
 * Returns the detected channel when valid.
 */
export function validateRecipient(recipient: string): RecipientValidationResult {
  if (!recipient || recipient.trim().length === 0) {
    return { valid: false, error: 'Recipient is required' };
  }

  const trimmed = recipient.trim();

  // E.164 phone: starts with + followed by 7-15 digits
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) {
    return { valid: true, channel: 'sms' };
  }

  // Basic email validation
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: true, channel: 'email' };
  }

  return { valid: false, error: 'Must be a valid email or E.164 phone number' };
}

// ─── buildPushPayload ─────────────────────────────────────────────────────────

export interface FcmPayload {
  notification: { title: string; body: string };
  data: Record<string, string>;
  android: { priority: 'high' | 'normal' };
  apns: { headers: { 'apns-priority': string } };
}

/**
 * Builds an FCM-compatible push notification payload.
 * All `data` values are coerced to strings as required by FCM.
 */
export function buildPushPayload(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): FcmPayload {
  const stringData: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = String(v);
  }

  return {
    notification: { title, body },
    data: stringData,
    android: { priority: 'high' },
    apns: { headers: { 'apns-priority': '10' } },
  };
}

// ─── deduplicateNotification ──────────────────────────────────────────────────

/**
 * Returns true if `newId` appears in `recentIds` within the given time window.
 * The recentIds map stores { id -> timestamp (ms) }.
 */
export function deduplicateNotification(
  recentIds: Map<string, number>,
  newId: string,
  windowMs: number,
): boolean {
  const now = Date.now();
  const seen = recentIds.get(newId);
  if (seen === undefined) return false;
  return now - seen <= windowMs;
}

// ─── prioritiseChannel ────────────────────────────────────────────────────────

export type NotificationChannel = 'email' | 'sms' | 'push';

export interface CustomerPreferences {
  preferredChannel?: NotificationChannel;
  hasEmail: boolean;
  hasPhone: boolean;
  hasPushToken: boolean;
  optOuts?: NotificationChannel[];
}

const EVENT_CHANNEL_DEFAULTS: Record<string, NotificationChannel> = {
  'order.completed': 'email',
  'payment.failed': 'push',
  'loyalty.tier_changed': 'email',
  'inventory.low_stock': 'push',
  'order.cancelled': 'sms',
};

/**
 * Returns the preferred notification channel for a customer given an event type.
 * Falls back through preferred → event default → available channel.
 */
export function prioritiseChannel(
  customer: CustomerPreferences,
  eventType: string,
): NotificationChannel | null {
  const optOuts = customer.optOuts ?? [];

  const isAvailable = (ch: NotificationChannel): boolean => {
    if (optOuts.includes(ch)) return false;
    if (ch === 'email') return customer.hasEmail;
    if (ch === 'sms') return customer.hasPhone;
    if (ch === 'push') return customer.hasPushToken;
    return false;
  };

  // 1. Respect stated preference if available
  if (customer.preferredChannel && isAvailable(customer.preferredChannel)) {
    return customer.preferredChannel;
  }

  // 2. Use event-type default if available
  const defaultCh = EVENT_CHANNEL_DEFAULTS[eventType];
  if (defaultCh && isAvailable(defaultCh)) return defaultCh;

  // 3. Fall back through email → sms → push
  const fallbacks: NotificationChannel[] = ['email', 'sms', 'push'];
  for (const ch of fallbacks) {
    if (isAvailable(ch)) return ch;
  }

  return null;
}

// ─── shouldSendNotification ───────────────────────────────────────────────────

export interface NotificationPreferences {
  globalOptOut: boolean;
  optIns: string[]; // event types the customer has opted into
  optOuts: string[]; // event types the customer has explicitly opted out of
}

/**
 * Returns true if a notification should be sent based on the customer's
 * opt-in/out preferences for the given event type.
 */
export function shouldSendNotification(
  preferences: NotificationPreferences,
  eventType: string,
): boolean {
  if (preferences.globalOptOut) return false;
  if (preferences.optOuts.includes(eventType)) return false;
  // If optIns list is non-empty, require explicit opt-in
  if (preferences.optIns.length > 0) {
    return preferences.optIns.includes(eventType);
  }
  return true;
}
