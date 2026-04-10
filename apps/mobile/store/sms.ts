/**
 * SMS notification settings for KDS bumps.
 *
 * The store keeps:
 *  - whether SMS-on-bump is enabled
 *  - the merchant's "from" name (used as a sender label in the message body)
 *  - the message template (supports {name}, {order} placeholders)
 *  - the API endpoint that the device calls to dispatch each text
 *
 * The actual SMS gateway (Twilio, MessageMedia, etc.) lives on the server;
 * the device just POSTs `{ to, body, from }` to the configured URL.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@elevatedpos/sms_notifications_v1';

const DEFAULT_TEMPLATE =
  'Hi {name}, your order #{order} is ready to collect. Thanks for choosing {merchant}!';

export interface SmsConfig {
  enabled: boolean;
  merchantName: string;
  fromName: string;
  template: string;
  /** Full URL the device POSTs to with `{ to, body, from }`. */
  endpoint: string;
  /** Last successful send timestamp (epoch ms), for the UI status pill. */
  lastSentAt?: number;
  /** Total number of messages successfully dispatched (for the badge). */
  totalSent: number;
}

interface SmsStore {
  config: SmsConfig;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setConfig: (updates: Partial<SmsConfig>) => Promise<void>;
  recordSend: () => Promise<void>;
  reset: () => Promise<void>;
}

const DEFAULTS: SmsConfig = {
  enabled: false,
  merchantName: '',
  fromName: '',
  template: DEFAULT_TEMPLATE,
  endpoint: '',
  totalSent: 0,
};

async function persist(cfg: SmsConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* non-critical */
  }
}

export const useSmsStore = create<SmsStore>((set, get) => ({
  config: { ...DEFAULTS },
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SmsConfig>;
        set({
          config: { ...DEFAULTS, ...parsed },
          hydrated: true,
        });
        return;
      }
    } catch {
      /* fall through */
    }
    set({ hydrated: true });
  },

  setConfig: async (updates) => {
    const next = { ...get().config, ...updates };
    set({ config: next });
    await persist(next);
  },

  recordSend: async () => {
    const next: SmsConfig = {
      ...get().config,
      totalSent: get().config.totalSent + 1,
      lastSentAt: Date.now(),
    };
    set({ config: next });
    await persist(next);
  },

  reset: async () => {
    set({ config: { ...DEFAULTS }, hydrated: true });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
}));

/**
 * Render an SMS body from the configured template, replacing the supported
 * placeholders. Unknown placeholders are left as-is so the merchant can spot
 * typos in their template editor.
 */
export function renderSmsBody(
  template: string,
  vars: { name?: string; order?: string; merchant?: string },
): string {
  return template
    .replace(/\{name\}/g, vars.name?.trim() || 'there')
    .replace(/\{order\}/g, vars.order ?? '')
    .replace(/\{merchant\}/g, vars.merchant?.trim() || 'us');
}

/**
 * Quick sanity check on Australian / international mobile phone numbers.
 * Strips spaces and accepts +61.../04.../international formats. Returns the
 * normalised number or null if it doesn't look dialable.
 */
export function normaliseMobile(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s()-]/g, '');
  if (!/^\+?\d{8,15}$/.test(cleaned)) return null;
  return cleaned;
}
