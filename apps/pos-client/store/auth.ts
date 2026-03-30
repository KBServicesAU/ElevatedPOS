import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Employee {
  id: string;
  name: string;
  role: string;
  orgId: string;
}

interface AuthState {
  token: string | null;
  employee: Employee | null;
  org: string | null;
  /** @deprecated use token instead */
  accessToken: string | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  setAuth: (payload: { token: string; employee: Employee; org?: string }) => Promise<void>;
  clearAuth: () => Promise<void>;
  /** @deprecated use setAuth instead */
  login: (employee: Employee, token: string) => void;
  /** @deprecated use clearAuth instead */
  logout: () => void;
  _hydrate: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

const STORAGE_KEY = 'nexus_auth';

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  employee: null,
  org: null,
  accessToken: null,
  isAuthenticated: false,

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

  _hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { token, employee, org } = JSON.parse(raw) as {
        token: string;
        employee: Employee;
        org: string | null;
      };
      if (token && employee) {
        set({ token, accessToken: token, employee, org: org ?? null, isAuthenticated: true });
      }
    } catch {
      // corrupted storage — leave unauthenticated
    }
  },
}));
