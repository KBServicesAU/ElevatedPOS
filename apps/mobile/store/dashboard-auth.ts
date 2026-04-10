/**
 * Dashboard web-auth credential store.
 *
 * Stores the email/password the merchant enters into the native dashboard
 * login screen so we can auto-submit the embedded web dashboard's login
 * form without asking the user a second time.
 *
 * Credentials are stored in SecureStore (encrypted), never in plaintext
 * storage. Clearing the credentials (or signing out) wipes them.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  email: 'dashboard_email',
  password: 'dashboard_password',
  rememberMe: 'dashboard_remember',
} as const;

export interface DashboardAuthStore {
  email: string;
  password: string;
  rememberMe: boolean;
  ready: boolean;

  /** Load credentials from SecureStore on app start. */
  hydrate: () => Promise<void>;
  /** Save credentials (when rememberMe is on). */
  save: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  /** Clear stored credentials. */
  clear: () => Promise<void>;
}

export const useDashboardAuthStore = create<DashboardAuthStore>((set) => ({
  email: '',
  password: '',
  rememberMe: false,
  ready: false,

  hydrate: async () => {
    try {
      const [email, password, rememberRaw] = await Promise.all([
        SecureStore.getItemAsync(KEYS.email),
        SecureStore.getItemAsync(KEYS.password),
        SecureStore.getItemAsync(KEYS.rememberMe),
      ]);
      set({
        email: email ?? '',
        password: password ?? '',
        rememberMe: rememberRaw === '1',
        ready: true,
      });
    } catch {
      set({ ready: true });
    }
  },

  save: async (email: string, password: string, rememberMe: boolean) => {
    if (rememberMe) {
      await Promise.all([
        SecureStore.setItemAsync(KEYS.email, email),
        SecureStore.setItemAsync(KEYS.password, password),
        SecureStore.setItemAsync(KEYS.rememberMe, '1'),
      ]);
    } else {
      await Promise.all([
        SecureStore.deleteItemAsync(KEYS.email),
        SecureStore.deleteItemAsync(KEYS.password),
        SecureStore.deleteItemAsync(KEYS.rememberMe),
      ]);
    }
    set({ email, password, rememberMe });
  },

  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.email),
      SecureStore.deleteItemAsync(KEYS.password),
      SecureStore.deleteItemAsync(KEYS.rememberMe),
    ]);
    set({ email: '', password: '', rememberMe: false });
  },
}));
