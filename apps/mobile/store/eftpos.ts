import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type EftposProvider = 'tyro' | 'anz';

interface EftposStore {
  provider: EftposProvider | null;
  ready: boolean;
  hydrate: () => Promise<void>;
  setProvider: (provider: EftposProvider) => Promise<void>;
  clearProvider: () => Promise<void>;
}

const STORAGE_KEY = 'elevatedpos_eftpos_provider';

export const useEftposStore = create<EftposStore>((set) => ({
  provider: null,
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw === 'tyro' || raw === 'anz') {
        set({ provider: raw as EftposProvider, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  setProvider: async (provider) => {
    set({ provider });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, provider);
    } catch { /* ignore */ }
  },

  clearProvider: async () => {
    set({ provider: null });
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch { /* ignore */ }
  },
}));
