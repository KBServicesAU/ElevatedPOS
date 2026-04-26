import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { toast } from '../../components/ui';
import { useTillStore } from '../../store/till';
import { useAuthStore } from '../../store/auth';
import { useDeviceStore } from '../../store/device';
import { useAnzBridge } from '../../components/AnzBridgeHost';
import { printEodReport } from '../../lib/printer';

/**
 * Close Till screen (v2.7.44 — re-fix).
 *
 * Single unified page for closing a shift. Combines what used to live
 * across `close-till` and `eod`:
 *   - Shift summary (opened-at, opened-by, float)
 *   - Sales breakdown pulled from the server EOD endpoint
 *   - Cash count + variance against expected drawer balance
 *   - Primary action closes the till and logs the employee out
 *   - Secondary action closes the till but keeps the session signed in
 *
 * Both close actions now:
 *   1. Refresh sales from /api/v1/orders/eod-summary, scoped to
 *      `from = till.openedAt → to = now` so timezone differences and
 *      shifts that span midnight are captured correctly.
 *   2. Trigger ANZ terminal reconciliation (bank settlement) — best-effort
 *   3. Close the terminal (Deactivate → Logout) — best-effort, never
 *      aborts the flow even if the bridge errors unexpectedly.
 *   4. Persist the till close in the local store
 *   5. Print a POS EOD summary receipt with the ANZ settlement appended,
 *      using the FRESHLY-loaded sales numbers (not the stale memoized
 *      ones from before the refresh).
 */

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface SalesBreakdown {
  totalCount: number;
  totalDollars: number;
  cashCount: number;
  cashDollars: number;
  cardCount: number;
  cardDollars: number;
  otherCount: number;
  otherDollars: number;
  refundCount: number;
  refundDollars: number;
  cashRefundDollars: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseDollars(input: string): number | null {
  const v = parseFloat(input);
  if (!isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}

function safeNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return '—';
  }
}

export default function CloseTillScreen() {
  const router = useRouter();
  const bridge = useAnzBridge();
  const till = useTillStore();
  const employee = useAuthStore((s) => s.employee);
  const employees = useAuthStore((s) => s.employees);
  const authLogout = useAuthStore((s) => s.logout);
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);

  const [countedInput, setCountedInput] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [sales, setSales] = useState<SalesBreakdown | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  useEffect(() => {
    return bridge.onStatus((m) => setStatusText(m));
  }, [bridge]);

  // Resolve the name of whoever opened the till. If the till was opened
  // by the currently logged-in employee we use that directly; otherwise
  // look them up in the fetched employees list; finally fall back to
  // the raw id.
  const openedByName = useMemo<string>(() => {
    const id = till.openedByEmployeeId;
    if (!id) return 'Unknown';
    if (employee && employee.id === id) {
      return `${employee.firstName} ${employee.lastName}`.trim() || id;
    }
    const e = employees.find((x) => x.id === id);
    if (e) return `${e.firstName} ${e.lastName}`.trim() || id;
    return id;
  }, [till.openedByEmployeeId, employee, employees]);

  // ── Load the server-side sales breakdown. Non-fatal on failure — the
  // reconciliation still works from the local till numbers.
  //
  // v2.7.44 — pass `from = till.openedAt` (the shift start) so we capture
  // every sale of the current shift, regardless of the server's local
  // timezone. The previous behaviour relied on the server's `midnight`
  // default, which:
  //   • Picks server-local midnight (UTC in our deployment), so an early
  //     AU-time shift (e.g. 7am AEST = 21:00 UTC the day before) saw
  //     yesterday's sales rolled in or today's sales missed entirely.
  //   • Couldn't capture shifts that span midnight (overnight venue).
  // Falls back to midnight if the till has somehow no openedAt.
  const loadSales = useCallback(async (): Promise<SalesBreakdown | null> => {
    const token = employeeToken ?? identity?.deviceToken ?? '';
    const locationId = identity?.locationId ?? '';
    if (!token || !locationId) {
      console.warn('[CloseTill] loadSales skipped — missing token or locationId', {
        hasToken: !!token,
        hasLocationId: !!locationId,
      });
      setSales(null);
      return null;
    }
    setSalesLoading(true);
    setSalesError(null);
    try {
      // Build the URL with explicit `from`/`to` so the shift is fully captured.
      const params = new URLSearchParams({ locationId });
      if (till.openedAt) {
        params.set('from', till.openedAt);
        params.set('to', new Date().toISOString());
      }
      const url = `${API_BASE}/api/v1/orders/eod-summary?${params.toString()}`;
      console.log('[CloseTill] loadSales →', url);
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn('[CloseTill] loadSales non-OK', res.status, body.slice(0, 200));
        setSalesError(`Sales data unavailable (HTTP ${res.status}).`);
        setSales(null);
        return null;
      }
      const data = await res.json();
      const p = (data.data ?? data ?? {}) as Record<string, unknown>;
      const payments = (p['payments'] ?? {}) as Record<string, unknown>;
      const totalDollars = safeNumber(p['totalSales']);
      const cashDollars = safeNumber(payments['cash']);
      const cardDollars = safeNumber(payments['card']);
      const otherDollars = safeNumber(payments['other']) + safeNumber(payments['split']);
      const refundDollars = safeNumber(p['refunds']);
      const totalCount = Number(p['transactionCount']) || 0;
      const cashCount = Number(p['cashTransactionCount']) || 0;
      const cardCount = Number(p['cardTransactionCount']) || 0;
      // The server doesn't return otherTransactionCount yet — derive by
      // subtraction so the count row still balances against the total.
      const otherCount = Math.max(0, totalCount - cashCount - cardCount);
      const next: SalesBreakdown = {
        totalCount,
        totalDollars,
        cashCount,
        cashDollars,
        cardCount,
        cardDollars,
        otherCount,
        otherDollars,
        refundCount: Number(p['refundCount']) || 0,
        refundDollars,
        cashRefundDollars: safeNumber(p['cashRefunds']),
      };
      console.log('[CloseTill] loadSales ✓', {
        totalCount: next.totalCount,
        totalDollars: next.totalDollars,
        cashCount: next.cashCount,
        cardCount: next.cardCount,
        otherCount: next.otherCount,
        refundCount: next.refundCount,
      });
      setSales(next);
      return next;
    } catch (err) {
      console.warn('[CloseTill] loadSales failed', err);
      setSalesError('Could not reach the server.');
      setSales(null);
      return null;
    } finally {
      setSalesLoading(false);
    }
  }, [employeeToken, identity, till.openedAt]);

  useEffect(() => {
    if (till.isOpen) void loadSales();
  }, [till.isOpen, loadSales]);

  // Expected cash = float + cash sales − cash refunds. If the server data
  // is available use those numbers; otherwise fall back to the till store.
  const expectedCents = useMemo<number>(() => {
    if (sales) {
      const cashCents = Math.round(sales.cashDollars * 100);
      const cashRefundCents = Math.round(sales.cashRefundDollars * 100);
      return till.floatCents + cashCents - cashRefundCents;
    }
    return till.floatCents + till.cashCents;
  }, [sales, till.floatCents, till.cashCents]);

  const countedCents = useMemo(() => parseDollars(countedInput), [countedInput]);
  const varianceCents = countedCents != null ? countedCents - expectedCents : null;

  /**
   * The close-out pipeline. Parametrised by `logoutAfter` so the two UI
   * buttons share the same logic. Every step that can fail is wrapped in
   * its own try/catch so a single failure (e.g. printer offline, ANZ
   * terminal offline) doesn't abort the whole close — losing the till
   * reconciliation in the store is a much worse outcome than a missing
   * paper receipt or a stuck terminal session.
   *
   * v2.7.44 — fixes:
   *   • Use the FRESHLY-loaded sales (`sb`) to compute `expectedCents`
   *     for the printed EOD report. The previous code used the memoized
   *     `expectedCents` which was based on the previous render's `sales`
   *     state — stale by one tick after `loadSales()` updates it.
   *   • Bridge close failures NEVER abort the close. Even if the ANZ
   *     terminal is unreachable, we still persist the till close and
   *     print the EOD report. The merchant can re-close the terminal
   *     manually if needed.
   *   • Defensive console.log at every step so support can trace the
   *     close flow on a device without breakpoints.
   */
  async function performClose({ logoutAfter }: { logoutAfter: boolean }): Promise<boolean> {
    if (countedCents == null) {
      toast.warning('Invalid', 'Enter the counted cash amount.');
      return false;
    }
    if (!till.isOpen) {
      toast.warning('No open till', 'There is no open till to close.');
      return false;
    }

    console.log('[CloseTill] performClose start', {
      logoutAfter,
      openedAt: till.openedAt,
      floatCents: till.floatCents,
      countedCents,
    });
    setSubmitting(true);
    setStatusText('Refreshing sales…');
    try {
      // 1. Refresh the server numbers so the printed EOD matches whatever
      //    the dashboard will show next sync. Non-fatal on failure — we
      //    fall back to whatever is already in `sales`.
      const fresh = await loadSales();
      const sb = fresh ?? sales;
      console.log('[CloseTill] sales for EOD', {
        usingFresh: !!fresh,
        totalCount: sb?.totalCount ?? 0,
        totalDollars: sb?.totalDollars ?? 0,
      });

      // Recompute the expected drawer cash from the FRESH sales so the
      // printed numbers match what the dashboard will show. Falls back to
      // the till-store values when the server data isn't available (rare —
      // typically only when the device is offline at close time).
      const freshExpectedCents = sb
        ? till.floatCents
            + Math.round(sb.cashDollars * 100)
            - Math.round(sb.cashRefundDollars * 100)
        : till.floatCents + till.cashCents;
      const freshVarianceCents = countedCents - freshExpectedCents;

      // 2. Best-effort ANZ reconciliation. If the terminal is offline or
      //    the SDK doesn't support it we still want the shift to close,
      //    so any error here degrades to a null receipt.
      let reconciliationReceipt: string | null = null;
      try {
        setStatusText('Reconciling terminal…');
        const { reconciliationReceipt: rx } = await bridge.reconcile();
        reconciliationReceipt = rx ?? null;
        console.log('[CloseTill] reconciled', {
          hasReceipt: !!reconciliationReceipt,
          receiptLen: reconciliationReceipt?.length ?? 0,
        });
      } catch (err) {
        console.warn('[CloseTill] Reconciliation failed:', err);
        reconciliationReceipt = null;
      }

      // 3. Close the terminal. ANY failure here is non-fatal — the local
      //    store close + EOD print MUST still run so the merchant has a
      //    paper trail for the day. Previously, an unexpected bridge
      //    error (e.g. transport disconnect mid-close) would re-throw and
      //    abort the whole flow before printEodReport ran. The print is
      //    the merchant's only physical record of the day's takings.
      setStatusText('Closing terminal…');
      try {
        await bridge.closeTill();
        console.log('[CloseTill] terminal closed');
      } catch (err) {
        const em = err instanceof Error ? err.message : String(err);
        console.warn('[CloseTill] terminal closeTill failed (non-fatal):', em);
      }

      // 4. Persist the close in the local till store. This is the point
      //    of no return — after this the drawer is "closed" regardless
      //    of what happens with printing below.
      try {
        await till.closeTill(countedCents, notes);
        console.log('[CloseTill] local till persisted');
      } catch (err) {
        // Persistence failed — the in-memory state is still updated by
        // the store, so the UI will render as closed. Surface the error
        // but continue so the merchant at least gets the paper EOD.
        console.error('[CloseTill] till.closeTill persist failed:', err);
      }

      // 5. Print the POS EOD summary + ANZ reconciliation verbatim.
      //    Wrapped in try/catch so a printer failure (not connected,
      //    missing module, offline) doesn't block the navigation.
      try {
        setStatusText('Printing EOD report…');
        const closedAt = new Date();
        console.log('[CloseTill] printEodReport →', {
          totalCount: sb?.totalCount ?? 0,
          totalDollars: sb?.totalDollars ?? 0,
          expectedCashDollars: freshExpectedCents / 100,
          countedCashDollars: countedCents / 100,
          varianceDollars: freshVarianceCents / 100,
        });
        await printEodReport({
          store: {
            name: identity?.label || 'ElevatedPOS',
            ...(identity?.label ? { branch: identity.label } : {}),
            ...(identity?.registerId ? { device: identity.registerId } : {}),
          },
          shift: {
            openedAt: till.openedAt ? new Date(till.openedAt) : null,
            closedAt,
            ...(openedByName ? { openedByName } : {}),
            floatDollars: till.floatCents / 100,
            expectedCashDollars: freshExpectedCents / 100,
            countedCashDollars: countedCents / 100,
            varianceDollars: freshVarianceCents / 100,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
          sales: {
            totalCount: sb?.totalCount ?? 0,
            totalDollars: sb?.totalDollars ?? 0,
            cashCount: sb?.cashCount ?? 0,
            cashDollars: sb?.cashDollars ?? 0,
            cardCount: sb?.cardCount ?? 0,
            cardDollars: sb?.cardDollars ?? 0,
            otherCount: sb?.otherCount ?? 0,
            otherDollars: sb?.otherDollars ?? 0,
            refundCount: sb?.refundCount ?? 0,
            refundDollars: sb?.refundDollars ?? 0,
          },
          ...(reconciliationReceipt ? { anzReconciliationText: reconciliationReceipt } : {}),
        });
        console.log('[CloseTill] EOD report printed ✓');
      } catch (err) {
        console.warn('[CloseTill] EOD print failed:', err);
        // Surface print failure to the operator so they know the till
        // closed but the receipt didn't print. The merchant can reprint
        // by re-closing or via the dashboard once that exists.
        const msg = err instanceof Error ? err.message : String(err);
        toast.warning(
          'EOD print failed',
          `Till closed but the EOD receipt did not print: ${msg}`,
        );
      }

      const vDollars = (freshVarianceCents / 100).toFixed(2);
      toast.success('Till closed', `Variance $${vDollars}.`);
      setStatusText(null);
      if (logoutAfter) {
        authLogout();
        router.replace('/employee-login' as never);
      } else {
        router.back();
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[CloseTill] performClose threw:', msg);
      toast.error('Could not close till', msg);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || bridge.state === 'closing';
  const varianceColor =
    varianceCents == null
      ? '#888'
      : varianceCents === 0
      ? '#22c55e'
      : varianceCents > 0
      ? '#22c55e'
      : '#ef4444';

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Close Till',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {!till.isOpen && (
          <View style={s.warnBox}>
            <Ionicons name="warning-outline" size={16} color="#f59e0b" />
            <Text style={s.warnText}>No till is currently open.</Text>
          </View>
        )}

        {/* ── Shift summary ───────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Shift Summary</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Opened at</Text>
            <Text style={s.value}>{fmtTime(till.openedAt)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Opened by</Text>
            <Text style={s.value} numberOfLines={1}>{openedByName}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Float</Text>
            <Text style={s.value}>${formatDollars(till.floatCents)}</Text>
          </View>
        </View>

        {/* ── Sales breakdown ─────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Sales</Text>
        <View style={s.card}>
          {salesLoading ? (
            <View style={s.salesLoading}>
              <ActivityIndicator size="small" color="#6366f1" />
              <Text style={s.salesLoadingText}>Loading sales…</Text>
            </View>
          ) : !sales ? (
            <View style={s.row}>
              <Text style={s.label}>Total sales</Text>
              <Text style={s.value}>{salesError ?? 'No data available'}</Text>
            </View>
          ) : (
            <>
              <View style={s.row}>
                <Text style={s.label}>Total sales ({sales.totalCount})</Text>
                <Text style={s.value}>${sales.totalDollars.toFixed(2)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.label}>Cash sales ({sales.cashCount})</Text>
                <Text style={s.value}>${sales.cashDollars.toFixed(2)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.label}>Card sales ({sales.cardCount})</Text>
                <Text style={s.value}>${sales.cardDollars.toFixed(2)}</Text>
              </View>
              {sales.otherCount > 0 || sales.otherDollars > 0 ? (
                <>
                  <View style={s.divider} />
                  <View style={s.row}>
                    <Text style={s.label}>Other ({sales.otherCount})</Text>
                    <Text style={s.value}>${sales.otherDollars.toFixed(2)}</Text>
                  </View>
                </>
              ) : null}
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={[s.label, { color: '#ef4444' }]}>Refunds ({sales.refundCount})</Text>
                <Text style={[s.value, { color: '#ef4444' }]}>-${sales.refundDollars.toFixed(2)}</Text>
              </View>
            </>
          )}
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={[s.label, { color: '#fff', fontWeight: '800' }]}>Expected cash drawer</Text>
            <Text style={[s.value, { color: '#fff', fontWeight: '800' }]}>
              ${formatDollars(expectedCents)}
            </Text>
          </View>
        </View>

        {/* ── Count card ──────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Counted Cash</Text>
        <View style={s.card}>
          <Text style={s.inputLabel}>Amount ($)</Text>
          <TextInput
            style={s.bigInput}
            value={countedInput}
            onChangeText={setCountedInput}
            placeholder="0.00"
            placeholderTextColor="#444"
            keyboardType="decimal-pad"
            editable={!busy}
          />
          <View style={[s.row, { marginTop: 14 }]}>
            <Text style={s.label}>Variance</Text>
            <Text style={[s.value, { color: varianceColor, fontWeight: '800' }]}>
              {varianceCents == null
                ? '—'
                : `${varianceCents >= 0 ? '+' : '−'}$${formatDollars(Math.abs(varianceCents))}`}
            </Text>
          </View>
        </View>

        {/* ── Notes ───────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Notes (optional)</Text>
        <View style={s.card}>
          <TextInput
            style={s.notes}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. $5 short — missing receipt from Dave"
            placeholderTextColor="#444"
            multiline
            numberOfLines={3}
            editable={!busy}
          />
        </View>

        {/* Status */}
        {statusText && (
          <View style={s.statusBox}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={s.statusText}>{statusText}</Text>
          </View>
        )}

        {/* ── Actions ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.primaryBtn, (busy || !till.isOpen) && { opacity: 0.6 }]}
          onPress={() => { void performClose({ logoutAfter: true }); }}
          disabled={busy || !till.isOpen}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="log-out-outline" size={16} color="#fff" />
          )}
          <Text style={s.primaryBtnText}>
            {busy ? 'Closing…' : 'Close Till & Logout'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.secondaryBtn, (busy || !till.isOpen) && { opacity: 0.6 }]}
          onPress={() => { void performClose({ logoutAfter: false }); }}
          disabled={busy || !till.isOpen}
          activeOpacity={0.85}
        >
          <Ionicons name="lock-closed-outline" size={16} color="#c4b5fd" />
          <Text style={s.secondaryBtnText}>Close Without Logout</Text>
        </TouchableOpacity>

        <Text style={s.footHint}>
          Closing reconciles the ANZ terminal, prints an EOD summary
          (including the bank settlement receipt) and records the final
          cash count in the till session.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  sectionTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: { color: '#888', fontSize: 13, fontWeight: '600' },
  value: { color: '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#1e1e2e', marginVertical: 8 },
  inputLabel: { color: '#888', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  bigInput: {
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  notes: {
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  statusBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  statusText: { color: '#c4b5fd', fontSize: 13, fontWeight: '600', flex: 1 },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  warnText: { color: '#f59e0b', fontSize: 12, fontWeight: '600', flex: 1 },
  footHint: { color: '#555', fontSize: 11, marginTop: 12, textAlign: 'center' },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#ef4444',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    marginTop: 10,
    backgroundColor: '#141425',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  secondaryBtnText: { color: '#c4b5fd', fontWeight: '700', fontSize: 14 },
  salesLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  salesLoadingText: { color: '#888', fontSize: 13 },
});
