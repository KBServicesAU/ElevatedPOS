import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * Persistent ANZ Worldline TIM configuration.
 *
 * The TIM (Terminal Integration Module) is a local HTTP server on the
 * EFTPOS terminal. The POS calls it directly over the local network —
 * no cloud credentials required, just the terminal's IP address.
 */

const STORAGE_KEY = 'elevatedpos_anz_config';

export interface AnzConfig {
  merchantId: string;
  terminalId: string;
  merchantName: string;
  environment: 'production' | 'development';
  enableSurcharge: boolean;
  enableTipping: boolean;
  /** IPv4 address of the EFTPOS terminal on the local network */
  terminalIp: string;
  /** HTTP port the TIM listens on — default 8080 */
  terminalPort: number;
}

interface AnzStore {
  config: AnzConfig;
  ready: boolean;
  hydrate: () => Promise<void>;
  setConfig: (updates: Partial<AnzConfig>) => Promise<void>;
  clearConfig: () => Promise<void>;
}

const DEFAULTS: AnzConfig = {
  merchantId: '',
  terminalId: '',
  merchantName: '',
  environment: 'production',
  enableSurcharge: false,
  enableTipping: false,
  terminalIp: '',
  terminalPort: 8080,
};

export const useAnzStore = create<AnzStore>((set, get) => ({
  config: { ...DEFAULTS },
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AnzConfig>;
        set({ config: { ...DEFAULTS, ...parsed }, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  setConfig: async (updates) => {
    const next = { ...get().config, ...updates };
    set({ config: next });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage write failed — config is still in memory
    }
  },

  clearConfig: async () => {
    set({ config: { ...DEFAULTS } });
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
}));

/** Returns true if the ANZ terminal IP is configured */
export function isAnzConfigured(): boolean {
  return !!useAnzStore.getState().config.terminalIp.trim();
}
