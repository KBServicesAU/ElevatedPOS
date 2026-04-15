/**
 * Terminal Connection Store
 *
 * Tracks which payment terminal credential the operator has selected
 * in the POS settings (More screen), and whether it has been successfully
 * paired (connect → login → activate).
 *
 * Selection is persisted to AsyncStorage so it survives app restarts.
 * Connection status is in-memory only (needs re-pairing after restart).
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deviceApiFetch } from '../lib/api';

const STORAGE_KEY = '@elevated_terminal_selection';

export type PairingStatus = 'idle' | 'pairing' | 'paired' | 'error';

export interface TerminalCredential {
  id: string;
  label: string | null;
  provider: 'anz' | 'tyro' | 'stripe' | string;
  terminalIp?: string;
  terminalPort?: number;
  integratorId?: string;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

interface TerminalConnectionState {
  /** All terminal credentials available for this org */
  credentials: TerminalCredential[];
  /** Which credential the operator selected */
  selectedId: string | null;
  /** Whether credentials have been loaded from server */
  loaded: boolean;
  /** Current pairing status */
  pairingStatus: PairingStatus;
  /** Error message if pairingStatus === 'error' */
  errorMessage: string | null;

  /** Fetch available credentials from server */
  fetchCredentials: () => Promise<void>;
  /** Select a credential (persists to AsyncStorage) */
  setSelectedId: (id: string | null) => Promise<void>;
  /** Load saved selection from AsyncStorage */
  hydrateSelection: () => Promise<void>;
  /** Mark pairing as in progress */
  setPairing: () => void;
  /** Mark pairing as succeeded */
  setPaired: () => void;
  /** Mark pairing as failed */
  setPairError: (message: string) => void;
  /** Reset pairing status to idle */
  resetPairing: () => void;
}

export const useTerminalConnectionStore = create<TerminalConnectionState>((set, get) => ({
  credentials: [],
  selectedId: null,
  loaded: false,
  pairingStatus: 'idle',
  errorMessage: null,

  fetchCredentials: async () => {
    try {
      // /api/v1/devices/terminals proxies through the auth service using a
      // service JWT — device tokens (opaque hashes) cannot call the payments
      // service's /api/v1/terminal/credentials endpoint directly.
      const res = await deviceApiFetch<{ data: TerminalCredential[] }>('/api/v1/devices/terminals');
      set({ credentials: res.data ?? [], loaded: true });
    } catch {
      // Non-fatal — operator may still have a server-assigned terminal config
      set({ loaded: true });
    }
  },

  setSelectedId: async (id) => {
    set({ selectedId: id, pairingStatus: 'idle', errorMessage: null });
    try {
      if (id) {
        await AsyncStorage.setItem(STORAGE_KEY, id);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* ignore storage errors */ }
  },

  hydrateSelection: async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) set({ selectedId: saved });
    } catch { /* ignore */ }
  },

  setPairing: () => set({ pairingStatus: 'pairing', errorMessage: null }),
  setPaired:  () => set({ pairingStatus: 'paired',  errorMessage: null }),
  setPairError: (message) => set({ pairingStatus: 'error', errorMessage: message }),
  resetPairing: () => set({ pairingStatus: 'idle', errorMessage: null }),
}));

/** Returns the selected credential from the store, or null */
export function getSelectedTerminalCredential(): TerminalCredential | null {
  const { credentials, selectedId } = useTerminalConnectionStore.getState();
  if (!selectedId) return null;
  return credentials.find((c) => c.id === selectedId) ?? null;
}

/** Returns ANZ config from selected credential, or null */
export function getSelectedAnzConfig(): { terminalIp: string; terminalPort: number; integratorId: string } | null {
  const cred = getSelectedTerminalCredential();
  if (!cred || cred.provider !== 'anz' || !cred.terminalIp) return null;
  return {
    terminalIp:   cred.terminalIp,
    terminalPort: cred.terminalPort ?? 80,
    integratorId: cred.integratorId ?? '',
  };
}
