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
  /**
   * Whether Stripe Terminal (Tap to Pay) is actively enabled on this device.
   * Defaults to false — the merchant must explicitly enable it in device settings.
   * Having a publishableKey alone is NOT enough to activate Terminal; the SDK
   * (@stripe/stripe-terminal-react-native) must also be installed.
   */
  enabled: boolean;
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
  // Stripe Terminal is opt-in — must be explicitly enabled via device settings.
  // This prevents card payments routing through an uninstalled Terminal SDK.
  enabled: false,
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
