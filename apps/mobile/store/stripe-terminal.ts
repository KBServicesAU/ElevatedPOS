/**
 * Stripe Terminal store
 *
 * Stores the Stripe publishable key (needed by StripeProvider)
 * and per-device Stripe Terminal config (location ID if applicable).
 *
 * The publishable key is fetched from the server device config
 * (via /api/v1/devices/config → terminal.publishableKey).
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'stripe_terminal_config';

export interface StripeTerminalConfig {
  publishableKey: string;
  /** Stripe Terminal location ID (optional — used for reader registration) */
  locationId?: string;
}

interface StripeTerminalStore {
  config: StripeTerminalConfig;
  setConfig: (config: Partial<StripeTerminalConfig>) => Promise<void>;
  hydrate: () => Promise<void>;
}

const DEFAULT_CONFIG: StripeTerminalConfig = {
  publishableKey: process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? '',
};

export const useStripeTerminalStore = create<StripeTerminalStore>((set, get) => ({
  config: DEFAULT_CONFIG,

  setConfig: async (updates) => {
    const next = { ...get().config, ...updates };
    set({ config: next });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<StripeTerminalConfig>;
        set({ config: { ...DEFAULT_CONFIG, ...saved } });
      }
    } catch { /* use defaults */ }
  },
}));
