/**
 * Sidebar-badge counts (v2.7.97).
 *
 * Polls a few cheap counters every 30 seconds so the POS sidebar can
 * render a red dot on Online Orders / Reservations / Bookings when
 * something needs attention. Each item shows the number that's most
 * actionable for floor staff:
 *
 *   • online-orders: C&C orders not yet collected (pending / picked /
 *     packed / ready). Bumps when the website creates a new order;
 *     drops back to 0 when staff hits Collected.
 *   • reservations:  restaurant reservations scheduled today.
 *   • bookings:      service appointments scheduled today.
 *
 * Polling cadence stays at 30s — frequent enough that a fresh online
 * order surfaces before the customer arrives, infrequent enough not
 * to chew battery on the iMin.
 */
import { create } from 'zustand';
import { useDeviceStore } from './device';
import { useAuthStore } from './auth';

const ORDERS_API =
  process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4004';

const INTEGRATIONS_API =
  process.env['EXPO_PUBLIC_INTEGRATIONS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4010';

interface CountsState {
  /** Online orders (C&C) that aren't yet collected. */
  onlineOrdersActive: number;
  /** Subset of the above that are 'ready' and waiting for the customer. */
  onlineOrdersReady: number;
  /** Restaurant reservations scheduled today. */
  reservationsToday: number;
  /** Services / appointments scheduled today. */
  bookingsToday: number;
  /** Epoch ms of the last successful fetch, or 0 if never fetched. */
  lastFetchedAt: number;
  /** Kick a single fetch right now (does not start the poll). */
  refresh: () => Promise<void>;
  /** Start polling every `intervalMs` (defaults to 30s). Idempotent — */
  /** calling it twice is a no-op. Returns a stop function. */
  start: (intervalMs?: number) => () => void;
}

let pollHandle: ReturnType<typeof setInterval> | null = null;

function authToken(): string {
  const employee = useAuthStore.getState().employeeToken;
  if (employee) return employee;
  return useDeviceStore.getState().identity?.deviceToken ?? '';
}

async function fetchCnCCount(token: string): Promise<{ active: number; ready: number }> {
  if (!token) return { active: 0, ready: 0 };
  try {
    const res = await fetch(`${ORDERS_API}/api/v1/fulfillment/click-and-collect/count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { active: 0, ready: 0 };
    const body = (await res.json()) as { data?: { active?: number; ready?: number } };
    return {
      active: Number(body.data?.active ?? 0),
      ready:  Number(body.data?.ready  ?? 0),
    };
  } catch {
    return { active: 0, ready: 0 };
  }
}

async function fetchReservationsCount(token: string): Promise<{ restaurantToday: number; serviceToday: number }> {
  if (!token) return { restaurantToday: 0, serviceToday: 0 };
  try {
    const res = await fetch(`${INTEGRATIONS_API}/api/v1/reservations/count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { restaurantToday: 0, serviceToday: 0 };
    const body = (await res.json()) as {
      data?: {
        restaurant?: { today?: number };
        service?:    { today?: number };
      };
    };
    return {
      restaurantToday: Number(body.data?.restaurant?.today ?? 0),
      serviceToday:    Number(body.data?.service?.today    ?? 0),
    };
  } catch {
    return { restaurantToday: 0, serviceToday: 0 };
  }
}

export const useNotificationCountsStore = create<CountsState>((set, get) => ({
  onlineOrdersActive: 0,
  onlineOrdersReady: 0,
  reservationsToday: 0,
  bookingsToday: 0,
  lastFetchedAt: 0,

  refresh: async () => {
    const token = authToken();
    // Run both fetches in parallel — neither depends on the other and
    // we don't want one slow service to delay the other badge.
    const [cnc, res] = await Promise.all([
      fetchCnCCount(token),
      fetchReservationsCount(token),
    ]);
    set({
      onlineOrdersActive: cnc.active,
      onlineOrdersReady:  cnc.ready,
      reservationsToday:  res.restaurantToday,
      bookingsToday:      res.serviceToday,
      lastFetchedAt:      Date.now(),
    });
  },

  start: (intervalMs = 30_000) => {
    if (pollHandle) return () => stopPoll();
    void get().refresh();
    pollHandle = setInterval(() => {
      void get().refresh();
    }, intervalMs);
    return () => stopPoll();
  },
}));

function stopPoll() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}
