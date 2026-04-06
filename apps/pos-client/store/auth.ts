import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Employee {
  id: string;
  name: string;
  role: string;
  orgId: string;
}

/** Minutes value or 0 for "Never" */
export type AutoLogoutMinutes = 5 | 10 | 15 | 30 | 60 | 0;

interface AuthState {
  token: string | null;
  employee: Employee | null;
  org: string | null;
  /** @deprecated use token instead */
  accessToken: string | null;
  isAuthenticated: boolean;
  /** Auto-logout after N minutes of inactivity. 0 = never. */
  autoLogoutMinutes: AutoLogoutMinutes;
}

interface AuthActions {
  setAuth: (payload: { token: string; employee: Employee; org?: string }) => Promise<void>;
  clearAuth: () => Promise<void>;
  /** @deprecated use setAuth instead */
  login: (employee: Employee, token: string) => void;
  /** @deprecated use clearAuth instead */
  logout: () => void;
  setAutoLogoutMinutes: (minutes: AutoLogoutMinutes) => void;
  _hydrate: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

const STORAGE_KEY = 'elevatedpos_auth';
const SETTINGS_KEY = 'elevatedpos_settings';

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  employee: null,
  org: null,
  accessToken: null,
  isAuthenticated: false,
  autoLogoutMinutes: 15,

  setAuth: async ({ token, employee, org }) => {
    set({ token, accessToken: token, employee, org: org ?? null, isAuthenticated: true });
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token, employee, org: org ?? null }),
    );
  },

  clearAuth: async () => {
    set({ token: null, accessToken: null, employee: null, org: null, isAuthenticated: false });
    await AsyncStorage.removeItem(STORAGE_KEY);
  },

  login: (employee, token) => {
    set({ employee, token, accessToken: token, isAuthenticated: true });
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token, employee, org: null }),
    ).catch(() => undefined);
  },

  logout: () => {
    set({ employee: null, token: null, accessToken: null, org: null, isAuthenticated: false });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  },

  setAutoLogoutMinutes: (minutes) => {
    set({ autoLogoutMinutes: minutes });
    AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ autoLogoutMinutes: minutes }),
    ).catch(() => undefined);
  },

  _hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { token, employee, org } = JSON.parse(raw) as {
          token: string;
          employee: Employee;
          org: string | null;
        };
        if (token && employee) {
          set({ token, accessToken: token, employee, org: org ?? null, isAuthenticated: true });
        }
      }
    } catch {
      // Corrupted storage — clear it and leave unauthenticated
      await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    }

    // Hydrate settings
    try {
      const settingsRaw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (settingsRaw) {
        const settings = JSON.parse(settingsRaw) as { autoLogoutMinutes?: AutoLogoutMinutes };
        if (settings.autoLogoutMinutes !== undefined) {
          set({ autoLogoutMinutes: settings.autoLogoutMinutes });
        }
      }
    } catch {
      // Ignore corrupted settings
    }
  },
}));
