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
  /** IPv4 address of the EFTPOS terminal on the local network */
  terminalIp: string;
  /** TIM API port (SIXml WebSocket) the terminal listens on — default 7784 */
  terminalPort: number;
  // NOTE: v2.7.23 — `enableSurcharge` and `enableTipping` used to live here
  // but were cosmetic toggles that nothing read. Real surcharge/tip
  // capability is reported by the Terminal after activation
  // (see AnzBridgeHost.capabilities / terminal.canSurcharge()).
  // Persisted payloads that still carry those fields load cleanly — the
  // hydrator discards unknown keys via the Partial<AnzConfig> spread.
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
  terminalIp: '',
  terminalPort: 7784,
};

export const useAnzStore = create<AnzStore>((set, get) => ({
  config: { ...DEFAULTS },
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        // Parse permissively — older payloads carry deprecated fields
        // (enableSurcharge, enableTipping) that we now strip so the in-memory
        // shape matches AnzConfig exactly.
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const clean: AnzConfig = {
          merchantId:    typeof parsed['merchantId']    === 'string' ? parsed['merchantId']    : DEFAULTS.merchantId,
          terminalId:    typeof parsed['terminalId']    === 'string' ? parsed['terminalId']    : DEFAULTS.terminalId,
          merchantName:  typeof parsed['merchantName']  === 'string' ? parsed['merchantName']  : DEFAULTS.merchantName,
          environment:
            parsed['environment'] === 'development' || parsed['environment'] === 'production'
              ? parsed['environment']
              : DEFAULTS.environment,
          terminalIp:    typeof parsed['terminalIp']    === 'string' ? parsed['terminalIp']    : DEFAULTS.terminalIp,
          terminalPort:  typeof parsed['terminalPort']  === 'number' ? parsed['terminalPort']  : DEFAULTS.terminalPort,
        };
        set({ config: clean, ready: true });
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
