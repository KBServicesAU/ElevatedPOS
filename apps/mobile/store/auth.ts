import { create } from 'zustand';
import { useDeviceStore } from './device';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

const AUTH_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

export interface AuthEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  locationIds: string[];
}

interface AuthStore {
  /** Currently logged-in employee */
  employee: AuthEmployee | null;
  /** JWT access token issued by PIN login */
  employeeToken: string | null;
  /** Employee list for card-select flow */
  employees: AuthEmployee[];
  loading: boolean;
  error: string | null;

  /** Fetch employee list for card selection (uses device token) */
  fetchEmployees: () => Promise<void>;

  /**
   * PIN login — employee-select flow.
   * Used when the employee taps their card first, then enters PIN.
   */
  pinLogin: (employeeId: string, pin: string) => Promise<void>;

  /**
   * Quick PIN login — org-based flow.
   * Employee just enters their PIN without selecting a card.
   * PIN uniquely identifies the employee within the org.
   */
  quickPinLogin: (pin: string) => Promise<void>;

  /** End the employee session */
  logout: () => void;

  clearError: () => void;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useAuthStore = create<AuthStore>((set) => ({
  employee: null,
  employeeToken: null,
  employees: [],
  loading: false,
  error: null,

  fetchEmployees: async () => {
    const identity = useDeviceStore.getState().identity;
    if (!identity) {
      console.warn('[fetchEmployees] No device identity — skipping');
      return;
    }
    try {
      console.log('[fetchEmployees] Fetching from', `${AUTH_BASE}/api/v1/devices/employees`);
      const res = await fetch(`${AUTH_BASE}/api/v1/devices/employees`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.deviceToken}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: AuthEmployee[] };
        const list = data.data ?? [];
        console.log('[fetchEmployees] Got', list.length, 'employees');
        set({ employees: list.filter((e: any) => e.isActive !== false) });
      } else {
        console.warn('[fetchEmployees] Failed:', res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      console.warn('[fetchEmployees] Network error:', err);
      // Non-critical — quick PIN entry still works without employee list
    }
  },

  pinLogin: async (employeeId, pin) => {
    const identity = useDeviceStore.getState().identity;
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${AUTH_BASE}/api/v1/auth/pin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          pin,
          locationId: identity?.locationId,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          title?: string;
          message?: string;
        };
        throw new Error(err.title ?? err.message ?? 'Invalid PIN');
      }
      const data = (await res.json()) as {
        accessToken: string;
        employee: AuthEmployee;
      };
      set({
        employee: data.employee,
        employeeToken: data.accessToken,
        loading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  quickPinLogin: async (pin) => {
    const identity = useDeviceStore.getState().identity;
    if (!identity) throw new Error('Device not paired');
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${AUTH_BASE}/api/v1/auth/pin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: identity.orgId,
          pin,
          registerId: identity.registerId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          title?: string;
          message?: string;
        };
        throw new Error(err.title ?? err.message ?? 'Invalid PIN');
      }
      const data = (await res.json()) as {
        accessToken: string;
        employee: AuthEmployee;
      };
      set({
        employee: data.employee,
        employeeToken: data.accessToken,
        loading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  logout: () => set({ employee: null, employeeToken: null, error: null }),

  clearError: () => set({ error: null }),
}));
