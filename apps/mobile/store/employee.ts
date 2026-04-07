import { create } from 'zustand';
import { useDeviceStore } from './device';
import { useAuthStore } from './auth';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

const AUTH_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

export interface Shift {
  id: string;
  employeeId: string;
  locationId: string;
  clockInAt: string;
  clockOutAt: string | null;
  breakMinutes: number;
  totalMinutes: number | null;
  status: 'open' | 'closed' | 'approved';
}

interface EmployeeStore {
  currentShift: Shift | null;
  loading: boolean;
  error: string | null;

  /** Check if there's already an open shift */
  checkCurrentShift: () => Promise<void>;
  /** Clock in — creates a new shift */
  clockIn: () => Promise<void>;
  /** Clock out — closes the current shift */
  clockOut: () => Promise<void>;
  /** Start break */
  startBreak: () => Promise<void>;
  /** End break */
  endBreak: () => Promise<void>;
  clearError: () => void;
}

/**
 * Returns the best available auth token.
 * Prefers the employee token (from PIN login) for time-clock
 * operations, since those endpoints require employee identity.
 * Falls back to the device token for general device operations.
 */
function getToken(): string | null {
  return (
    useAuthStore.getState().employeeToken ??
    useDeviceStore.getState().identity?.deviceToken ??
    null
  );
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useEmployeeStore = create<EmployeeStore>((set) => ({
  currentShift: null,
  loading: false,
  error: null,

  checkCurrentShift: async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${AUTH_BASE}/api/v1/time-clock/shifts/current`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { data: Shift };
        set({ currentShift: data.data ?? null });
      } else {
        // 404 = no open shift
        set({ currentShift: null });
      }
    } catch {
      set({ currentShift: null });
    }
  },

  clockIn: async () => {
    const identity = useDeviceStore.getState().identity;
    const token = getToken();
    if (!identity) throw new Error('Device not paired');
    if (!token) throw new Error('Not authenticated');
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${AUTH_BASE}/api/v1/time-clock/clock-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locationId: identity.locationId,
          registerId: identity.registerId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { title?: string };
        throw new Error(err.title ?? 'Clock in failed');
      }
      const data = (await res.json()) as { data: { shift: Shift } };
      set({ currentShift: data.data.shift, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Clock in failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  clockOut: async () => {
    const identity = useDeviceStore.getState().identity;
    const token = getToken();
    if (!identity) throw new Error('Device not paired');
    if (!token) throw new Error('Not authenticated');
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${AUTH_BASE}/api/v1/time-clock/clock-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locationId: identity.locationId,
          registerId: identity.registerId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { title?: string };
        throw new Error(err.title ?? 'Clock out failed');
      }
      set({ currentShift: null, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Clock out failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  startBreak: async () => {
    const identity = useDeviceStore.getState().identity;
    const token = getToken();
    if (!identity || !token) throw new Error('Not authenticated');
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${AUTH_BASE}/api/v1/time-clock/break/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locationId: identity.locationId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { title?: string };
        throw new Error(err.title ?? 'Start break failed');
      }
      set({ loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Start break failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  endBreak: async () => {
    const identity = useDeviceStore.getState().identity;
    const token = getToken();
    if (!identity || !token) throw new Error('Not authenticated');
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${AUTH_BASE}/api/v1/time-clock/break/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locationId: identity.locationId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { title?: string };
        throw new Error(err.title ?? 'End break failed');
      }
      set({ loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'End break failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
