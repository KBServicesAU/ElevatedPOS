import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * Persistent ANZ Worldline TIM configuration.
 *
 * The TIM API uses the SIXml (XML-based) protocol over WebSocket. The
 * JavaScript SDK (timapi.js) connects to ws://<ip>:<port>/SIXml. The
 * standard SIXml port per ANZ Worldline validation is 7784 for both
 * real Castles terminals and the EftSimulator.
 *
 * Reference: ANZWL - TIM API - Integration (RETAIL) Validation Template
 *            (04-JAN-2026), section 3 — log extract shows
 *            connectionIPPort: 7784 and protocolType: sixml.
 */

const STORAGE_KEY = 'elevatedpos_anz_config';

/** SIXml default port per ANZ Worldline validation. */
export const DEFAULT_ANZ_PORT = 7784;

export interface AnzConfig {
  merchantId: string;
  terminalId: string;
  merchantName: string;
  environment: 'production' | 'development';
  enableSurcharge: boolean;
  enableTipping: boolean;
  /** IPv4 address of the EFTPOS terminal on the local network */
  terminalIp: string;
  /** SIXml WebSocket port (default 7784) */
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
  terminalPort: DEFAULT_ANZ_PORT,
};

/**
 * Legacy ports that were never correct for the TIM API. Any persisted
 * config using these ports is migrated to the real SIXml default (7784)
 * on hydrate so upgraded installs start working immediately.
 *
 * - 8080 = old "HTTP fetch" placeholder (never worked — TIM API is not HTTP)
 * - 80   = previous incorrect default used while diagnosing mixed content
 * - 4100 = legacy Linkly/PC-EFTPOS default (unrelated to ANZ Worldline)
 */
const LEGACY_BAD_PORTS: ReadonlySet<number> = new Set([80, 8080, 4100]);

export const useAnzStore = create<AnzStore>((set, get) => ({
  config: { ...DEFAULTS },
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AnzConfig>;
        const next: AnzConfig = { ...DEFAULTS, ...parsed };
        // Migrate known-bad legacy ports to the real SIXml default.
        if (!next.terminalPort || LEGACY_BAD_PORTS.has(next.terminalPort)) {
          next.terminalPort = DEFAULT_ANZ_PORT;
          try {
            await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
          } catch { /* non-fatal — in-memory still correct */ }
        }
        set({ config: next, ready: true });
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
