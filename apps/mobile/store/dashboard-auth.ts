/**
 * Dashboard SSO token store.
 *
 * The user enters their email + password ONCE via the native login modal.
 * We call the auth service to get a real access + refresh token pair,
 * then store ONLY the refresh token (30-day lifetime) in SecureStore.
 * Passwords are NEVER persisted.
 *
 * On every subsequent "Open Web Dashboard" tap:
 *   1. getValidToken() exchanges the stored refresh token for a fresh
 *      15-minute access token via POST /api/v1/auth/refresh.
 *   2. The WebView loads /api/auth/device-sso?token=<accessToken> on
 *      the web app, which validates the token, sets the session cookie,
 *      and redirects to /dashboard — fully authenticated, no second
 *      login screen.
 *
 * If the refresh token has expired (after 30 days of inactivity)
 * getValidToken() returns null and the caller should prompt the user
 * to sign in again.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  email: 'dashboard_email',
  refreshToken: 'dashboard_refresh_token',
} as const;

export interface DashboardAuthStore {
  /** Display email — shown in the dashboard header / "Forget Login" section */
  email: string;
  /** Long-lived refresh token (30 days). Never the raw password. */
  refreshToken: string;
  ready: boolean;

  /** Load from SecureStore on app start. */
  hydrate: () => Promise<void>;

  /**
   * Persist credentials after a successful login.
   * Only the refresh token is stored — never the password.
   */
  save: (email: string, refreshToken: string) => Promise<void>;

  /**
   * Exchange the stored refresh token for a fresh access token.
   * Returns the access token string, or null if:
   *   - No refresh token is stored yet (first use)
   *   - The refresh token has expired (>30 days)
   *   - The auth service is unreachable
   *
   * On null the caller should clear() and prompt the user to sign in.
   */
  getValidToken: (apiBase: string) => Promise<string | null>;

  /** Clear all stored credentials (forget / sign out). */
  clear: () => Promise<void>;
}

export const useDashboardAuthStore = create<DashboardAuthStore>((set, get) => ({
  email: '',
  refreshToken: '',
  ready: false,

  hydrate: async () => {
    try {
      const [email, refreshToken] = await Promise.all([
        SecureStore.getItemAsync(KEYS.email),
        SecureStore.getItemAsync(KEYS.refreshToken),
      ]);
      set({ email: email ?? '', refreshToken: refreshToken ?? '', ready: true });
    } catch {
      set({ ready: true });
    }
  },

  save: async (email: string, refreshToken: string) => {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.email, email),
      SecureStore.setItemAsync(KEYS.refreshToken, refreshToken),
    ]);
    set({ email, refreshToken });
  },

  getValidToken: async (apiBase: string) => {
    const { refreshToken } = get();
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken?: string };
      return data.accessToken ?? null;
    } catch {
      return null;
    }
  },

  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.email),
      SecureStore.deleteItemAsync(KEYS.refreshToken),
    ]);
    set({ email: '', refreshToken: '' });
  },
}));
