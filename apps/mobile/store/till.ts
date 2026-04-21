import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * Persistent till session.
 *
 * Tracks whether the till drawer is open, the starting float, cash
 * taken during the shift, and the close-out reconciliation numbers.
 * Purely local for this first cut — no backend sync.
 */

const STORAGE_KEY = 'elevatedpos_till_session';

export interface TillSession {
  isOpen: boolean;
  openedAt: string | null;
  openedByEmployeeId: string | null;
  /** Starting cash in drawer (cents). */
  floatCents: number;
  /** Running total of cash taken during this shift (cents). */
  cashCents: number;
  closedAt: string | null;
  /** Counted cash at close time (cents). Null while open. */
  countedCashCents: number | null;
  /** counted − expected (cents). Null while open. */
  varianceCents: number | null;
  /** Free-form notes attached at close time. */
  closeNotes: string;
}

interface TillStore extends TillSession {
  ready: boolean;
  hydrate: () => Promise<void>;
  openTill: (floatCents: number, employeeId?: string) => Promise<void>;
  addCashSale: (cents: number) => Promise<void>;
  closeTill: (countedCashCents: number, notes: string) => Promise<void>;
  reset: () => Promise<void>;
}

const DEFAULTS: TillSession = {
  isOpen: false,
  openedAt: null,
  openedByEmployeeId: null,
  floatCents: 0,
  cashCents: 0,
  closedAt: null,
  countedCashCents: null,
  varianceCents: null,
  closeNotes: '',
};

async function persist(state: TillSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal: state is still in memory.
  }
}

export const useTillStore = create<TillStore>((set, get) => ({
  ...DEFAULTS,
  ready: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TillSession>;
        set({ ...DEFAULTS, ...parsed, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  openTill: async (floatCents, employeeId) => {
    const next: TillSession = {
      isOpen: true,
      openedAt: new Date().toISOString(),
      openedByEmployeeId: employeeId ?? null,
      floatCents: Math.max(0, Math.round(floatCents)),
      cashCents: 0,
      closedAt: null,
      countedCashCents: null,
      varianceCents: null,
      closeNotes: '',
    };
    set(next);
    await persist(next);
  },

  addCashSale: async (cents) => {
    const current = get();
    if (!current.isOpen) return;
    const next: TillSession = {
      isOpen:             current.isOpen,
      openedAt:           current.openedAt,
      openedByEmployeeId: current.openedByEmployeeId,
      floatCents:         current.floatCents,
      cashCents:          current.cashCents + Math.round(cents),
      closedAt:           current.closedAt,
      countedCashCents:   current.countedCashCents,
      varianceCents:      current.varianceCents,
      closeNotes:         current.closeNotes,
    };
    set(next);
    await persist(next);
  },

  closeTill: async (countedCashCents, notes) => {
    const current = get();
    const expected = current.floatCents + current.cashCents;
    const variance = Math.round(countedCashCents) - expected;
    const next: TillSession = {
      isOpen: false,
      openedAt: current.openedAt,
      openedByEmployeeId: current.openedByEmployeeId,
      floatCents: current.floatCents,
      cashCents: current.cashCents,
      closedAt: new Date().toISOString(),
      countedCashCents: Math.round(countedCashCents),
      varianceCents: variance,
      closeNotes: notes,
    };
    set(next);
    await persist(next);
  },

  reset: async () => {
    set({ ...DEFAULTS });
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
}));

/** Returns expected cash in the drawer right now (cents). */
export function expectedCashCents(): number {
  const s = useTillStore.getState();
  return s.floatCents + s.cashCents;
}
