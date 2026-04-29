import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { useAuthStore } from './auth';
import { useDeviceStore } from './device';

/**
 * v2.7.70 — C12 / C13 reconcile queue.
 *
 * The POS + Kiosk flow is:
 *   1. Charge the card on the EFTPOS terminal (Tyro / Stripe / ANZ) — money
 *      moves on the bank rail at this point. There is no going back.
 *   2. POST /api/v1/orders → server records the order with status='open'.
 *   3. POST /api/v1/orders/:id/complete → server flips status='completed',
 *      fires order.completed Kafka event → loyalty earn, ClickHouse
 *      revenue row, EOD reconciliation, dashboard graphs all run off this.
 *
 * The race: step (3) can fail due to network blip / cold start / pod
 * restart / device sleep. The customer was charged, the order exists, but
 * it never gets marked complete. Symptoms:
 *   • Dashboard reports $0 revenue while the till has cash that doesn't
 *     reconcile against zero recorded sales.
 *   • Loyalty members don't earn points for the visit.
 *   • Close-Till variance is wrong because the system thinks no card sales
 *     happened.
 *   • The order sits in the Orders list forever as "Open" and the operator
 *     has no clue why — no toast, no badge, nothing.
 *
 * `handleCharge` already retries /complete twice in-process; this store
 * adds a *persistent* third tier: if both attempts fail we enqueue the
 * payload to SecureStore. On every app launch (and every tick of the
 * background scheduler) we drain the queue. Surfacing the count to the
 * Sell + Orders screens lets staff see when things are awaiting reconcile.
 *
 * The terminal_transactions row is already written with
 * outcome='approved' even when /complete fails — that's the audit trail
 * for the actual money movement. This queue is the bookkeeping fix.
 */

const STORAGE_KEY = 'elevatedpos_pending_reconcile_v1';

export interface PendingReconcile {
  /** Stable client-side id so duplicate enqueues don't double up. */
  key: string;
  orderId: string;
  orderNumber: string;
  /** Server base URL captured at enqueue time. */
  apiBase: string;
  /** Auth token captured at enqueue time. Refreshed on each retry from the
   *  current employee/device session — old tokens still get rejected by
   *  the server but at least we always send the freshest. */
  authTokenSnapshot: string;
  paymentMethod: string;
  paidTotal: number;
  changeGiven: number;
  tipAmount?: number;
  surchargeAmount?: number;
  /** Number of failed retry attempts since enqueue (excluding the
   *  in-process retries that ran in handleCharge). */
  attempts: number;
  /** ISO timestamp of last attempt. */
  lastAttemptAt: string | null;
  /** Last server / network error message. */
  lastError: string | null;
  /** ISO timestamp the queue entry was created. */
  enqueuedAt: string;
}

interface ReconcileStore {
  ready: boolean;
  pending: PendingReconcile[];
  hydrate: () => Promise<void>;
  enqueue: (entry: Omit<PendingReconcile, 'key' | 'attempts' | 'lastAttemptAt' | 'lastError' | 'enqueuedAt'>) => Promise<void>;
  /** Best-effort retry against /api/v1/orders/:id/complete. Removes
   *  successful entries from the queue. Safe to call on a timer; it
   *  serialises retries so we don't fan out 50 fetches at once on a
   *  cold-started device. */
  drain: () => Promise<{ completed: number; failed: number }>;
  /** Drop a queue entry — operator marked it reconciled by hand. */
  remove: (key: string) => Promise<void>;
  /** Wipe the entire queue. Reserved for support / factory reset. */
  reset: () => Promise<void>;
}

async function persist(pending: PendingReconcile[]): Promise<void> {
  try {
    if (pending.length === 0) {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(pending));
    }
  } catch {
    // Non-fatal: queue stays in memory until next persist attempt.
  }
}

let drainInFlight = false;

export const useReconcileStore = create<ReconcileStore>((set, get) => ({
  ready: false,
  pending: [],

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingReconcile[];
        if (Array.isArray(parsed)) {
          set({ pending: parsed, ready: true });
          return;
        }
      }
    } catch {
      // fall through to empty queue
    }
    set({ ready: true });
  },

  enqueue: async (entry) => {
    const key = `${entry.orderId}-${Date.now()}`;
    const next: PendingReconcile = {
      key,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      enqueuedAt: new Date().toISOString(),
      ...entry,
    };
    const current = get().pending;
    // De-duplicate by orderId — if the same order is already queued
    // (e.g. handleCharge ran twice for the same Tyro session) replace
    // the older entry rather than stacking duplicates.
    const filtered = current.filter((p) => p.orderId !== entry.orderId);
    const merged = [...filtered, next];
    set({ pending: merged });
    await persist(merged);
  },

  drain: async () => {
    if (drainInFlight) return { completed: 0, failed: 0 };
    drainInFlight = true;
    try {
      const queue = [...get().pending];
      if (queue.length === 0) return { completed: 0, failed: 0 };

      let completed = 0;
      let failed = 0;
      const remaining: PendingReconcile[] = [];

      for (const entry of queue) {
        // Always send the freshest token — staff might have logged out
        // and back in since the entry was enqueued.
        const live = useAuthStore.getState().employeeToken
          ?? useDeviceStore.getState().identity?.deviceToken
          ?? entry.authTokenSnapshot;

        try {
          const res = await fetch(`${entry.apiBase}/api/v1/orders/${entry.orderId}/complete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${live}`,
            },
            body: JSON.stringify({
              paidTotal: entry.paidTotal,
              changeGiven: entry.changeGiven,
              paymentMethod: entry.paymentMethod,
              ...(entry.tipAmount ? { tipAmount: entry.tipAmount } : {}),
              ...(entry.surchargeAmount ? { surchargeAmount: entry.surchargeAmount } : {}),
            }),
            signal: AbortSignal.timeout(15000),
          });
          // 200 = newly completed, 409 = already completed (duplicate
          // drain race or operator manually completed it from web). Both
          // are terminal-success cases — drop from queue.
          if (res.ok || res.status === 409) {
            completed += 1;
            continue;
          }
          const errBody = await res.json().catch(() => ({})) as { message?: string; detail?: string; title?: string };
          const errMsg = errBody.detail ?? errBody.message ?? errBody.title ?? `HTTP ${res.status}`;
          remaining.push({
            ...entry,
            attempts: entry.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: errMsg,
          });
          failed += 1;
        } catch (err) {
          remaining.push({
            ...entry,
            attempts: entry.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: err instanceof Error ? err.message : String(err),
          });
          failed += 1;
        }
      }

      set({ pending: remaining });
      await persist(remaining);
      return { completed, failed };
    } finally {
      drainInFlight = false;
    }
  },

  remove: async (key) => {
    const next = get().pending.filter((p) => p.key !== key);
    set({ pending: next });
    await persist(next);
  },

  reset: async () => {
    set({ pending: [] });
    await persist([]);
  },
}));
