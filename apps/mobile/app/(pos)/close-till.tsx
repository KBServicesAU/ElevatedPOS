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
 * Close Till screen (v2.7.24).
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
 *   1. Refresh sales from /api/v1/orders/eod-summary
 *   2. Trigger ANZ terminal reconciliation (bank settlement) — best-effort
 *   3. Close the terminal (Deactivate → Logout)
 *   4. Persist the till close in the local store
 *   5. Print a POS EOD summary receipt with the ANZ settlement appended
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
  // reconciliation still works from the local till numbers. ─────────
  const loadSales = useCallback(async (): Promise<SalesBreakdown | null> => {
    const token = employeeToken ?? identity?.deviceToken ?? '';
    const locationId = identity?.locationId ?? '';
    if (!token || !locationId) {
      setSales(null);
      return null;
    }
    setSalesLoading(true);
    setSalesError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/orders/eod-summary?locationId=${locationId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) {
        setSalesError('Sales data unavailable.');
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
      setSales(next);
      return next;
    } catch {
      setSalesError('Could not reach the server.');
      setSales(null);
      return null;
    } finally {
      setSalesLoading(false);
    }
  }, [employeeToken, identity]);

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
   * its own try/catch so a single failure (e.g. printer offline) doesn't
   * abort the whole close — losing the till reconciliation in the store
   * is a much worse outcome than a missing paper receipt.
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

    setSubmitting(true);
    setStatusText('Refreshing sales…');
    try {
      // 1. Refresh the server numbers so the printed EOD matches whatever
      //    the dashboard will show next sync. Non-fatal on failure — we
      //    fall back to whatever is already in `sales`.
      const fresh = await loadSales();
      const sb = fresh ?? sales;

      // 2. Best-effort ANZ reconciliation. If the terminal is offline or
      //    the SDK doesn't support it we still want the shift to close,
      //    so any error here degrades to a null receipt.
      let reconciliationReceipt: string | null = null;
      try {
        setStatusText('Reconciling terminal…');
        const { reconciliationReceipt: rx } = await bridge.reconcile();
        reconciliationReceipt = rx ?? null;
      } catch (err) {
        console.warn('[CloseTill] Reconciliation failed:', err);
        reconciliationReceipt = null;
      }

      // 3. Close the terminal. "Till is not open" is non-fatal — the
      //    local store close must still run so the till can be re-opened.
      setStatusText('Closing terminal…');
      try {
        await bridge.closeTill();
      } catch (err) {
        const em = err instanceof Error ? err.message : String(err);
        if (!/not open/i.test(em)) {
          throw err;
        }
      }

      // 4. Persist the close in the local till store. This is the point
      //    of no return — after this the drawer is "closed" regardless
      //    of what happens with printing below.
      await till.closeTill(countedCents, notes);

      // 5. Print the POS EOD summary + ANZ reconciliation verbatim.
      //    Wrapped in try/catch so a printer failure (not connected,
      //    missing module, offline) doesn't block the close or the
      //    subsequent navigation.
      try {
        setStatusText('Printing EOD report…');
        const closedAt = new Date();
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
            expectedCashDollars: expectedCents / 100,
            countedCashDollars: countedCents / 100,
            varianceDollars: (countedCents - expectedCents) / 100,
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
      } catch (err) {
        console.warn('[CloseTill] EOD print failed:', err);
      }

      const vDollars = ((countedCents - expectedCents) / 100).toFixed(2);
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
