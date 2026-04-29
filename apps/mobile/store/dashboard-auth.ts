/**
 * Dashboard web-auth credential store.
 *
 * v2.7.70 — C10. The previous version stored the merchant's email AND
 * PASSWORD in SecureStore and injected them into the embedded WebView's
 * login form via JavaScript. That was a serious credential leak:
 *   • The password was kept indefinitely on the device — a stolen tablet
 *     gave an attacker the merchant's actual password (which they likely
 *     reuse on email/banking).
 *   • The injected JS ran via MutationObserver on every navigation, so a
 *     redirect to any page (including a 3rd-party widget, an XSS-poisoned
 *     dashboard route, or a misconfigured CDN) could see the credentials
 *     in the script body.
 *   • The auto-submit selector matched any form on a `/login` path,
 *     including phishing pages reachable from an XSS.
 *
 * The new design:
 *   1. Native dashboard login screen calls /api/v1/auth/login on the
 *      auth service directly, gets back `{accessToken, user}`.
 *   2. We store ONLY the access token (and the user's email, for UI
 *      display purposes — never the password).
 *   3. To open the WebView, we navigate to
 *      /api/auth/device-sso?token=<accessToken>&redirect=<path> on the
 *      web-backoffice. That route validates the token upstream, sets
 *      the elevatedpos_token httpOnly cookie, and 302s to the path.
 *   4. From that point the WebView is logged in via cookie. No
 *      JavaScript injection of credentials anywhere.
 *
 * If the token expires (8h server-side default), the WebView lands on
 * /login normally and the operator re-enters their password on the
 * native screen — same UX as before, without the persistent-credentials
 * footgun.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  email: 'dashboard_email',
  // v2.7.70 — `dashboard_token` replaces `dashboard_password`. We keep
  // a sentinel for the legacy key so hydrate() can wipe any records
  // left over from <= v2.7.69 installs.
  token: 'dashboard_token',
  legacyPassword: 'dashboard_password',
  rememberMe: 'dashboard_remember',
} as const;

const AUTH_API_URL =
  process.env['EXPO_PUBLIC_AUTH_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  '';

export interface DashboardAuthStore {
  email: string;
  /** Short-lived access token (JWT). Stored in SecureStore. Never the
   *  password itself. Empty string when not signed in. */
  token: string;
  rememberMe: boolean;
  ready: boolean;
  loading: boolean;
  error: string | null;

  /** Load credentials from SecureStore on app start. Wipes any legacy
   *  password-key records left behind by pre-v2.7.70 builds. */
  hydrate: () => Promise<void>;
  /** Sign in by calling /api/v1/auth/login. Persists the token (not the
   *  password) on success. Returns true if login succeeded. */
  signIn: (email: string, password: string, rememberMe: boolean) => Promise<boolean>;
  /** Clear the stored token. */
  clear: () => Promise<void>;
}

export const useDashboardAuthStore = create<DashboardAuthStore>((set) => ({
  email: '',
  token: '',
  rememberMe: false,
  ready: false,
  loading: false,
  error: null,

  hydrate: async () => {
    try {
      // Eagerly delete any record left over from the credential-leak era
      // so it can never be read back, even if a future bug accidentally
      // re-adds the legacy code path.
      await SecureStore.deleteItemAsync(KEYS.legacyPassword).catch(() => { /* ignore */ });
      const [email, token, rememberRaw] = await Promise.all([
        SecureStore.getItemAsync(KEYS.email),
        SecureStore.getItemAsync(KEYS.token),
        SecureStore.getItemAsync(KEYS.rememberMe),
      ]);
      set({
        email: email ?? '',
        token: token ?? '',
        rememberMe: rememberRaw === '1',
        ready: true,
      });
    } catch {
      set({ ready: true });
    }
  },

  signIn: async (email, password, rememberMe) => {
    set({ loading: true, error: null });
    try {
      // Talk to the auth service directly (same path the POS employee
      // login uses). The web-backoffice /api/auth/login endpoint sets
      // browser cookies that are useless on the mobile side.
      const res = await fetch(`${AUTH_API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { message?: string; detail?: string; title?: string };
        const msg = errBody.detail ?? errBody.message ?? errBody.title ?? `Login failed (${res.status})`;
        set({ error: msg, loading: false });
        return false;
      }
      const data = (await res.json()) as { accessToken?: string };
      const token = data.accessToken;
      if (!token) {
        set({ error: 'Login response missing accessToken', loading: false });
        return false;
      }
      if (rememberMe) {
        await Promise.all([
          SecureStore.setItemAsync(KEYS.email, email),
          SecureStore.setItemAsync(KEYS.token, token),
          SecureStore.setItemAsync(KEYS.rememberMe, '1'),
        ]);
      } else {
        // Even when rememberMe is off, keep the token in memory for the
        // current session — only persist the email so the form pre-fills
        // next time. The token never reaches disk.
        await Promise.all([
          SecureStore.setItemAsync(KEYS.email, email),
          SecureStore.deleteItemAsync(KEYS.token),
          SecureStore.deleteItemAsync(KEYS.rememberMe),
        ]);
      }
      set({ email, token, rememberMe, loading: false, error: null });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      set({ error: msg, loading: false });
      return false;
    }
  },

  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.email),
      SecureStore.deleteItemAsync(KEYS.token),
      SecureStore.deleteItemAsync(KEYS.rememberMe),
      // Belt-and-braces: also wipe the legacy password key on every
      // explicit sign-out so there's no chance it lingers.
      SecureStore.deleteItemAsync(KEYS.legacyPassword),
    ]);
    set({ email: '', token: '', rememberMe: false });
  },
}));
