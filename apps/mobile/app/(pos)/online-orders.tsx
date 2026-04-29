/**
 * Click & Collect screen for the POS app (v2.7.90).
 *
 * Replaces the v2.7.51 "Coming soon" placeholder. Surfaces every C&C
 * fulfillment for the active org so floor staff can:
 *   • see what's queued, what's preparing, what's waiting for customer
 *     pickup, and what's been collected today;
 *   • progress an order in one tap (pending → picked → packed → ready),
 *     which fires the customer-notification email automatically on the
 *     orders service;
 *   • mark a ready order as collected when the customer arrives;
 *   • print a pickup ticket for prep, using whichever printer the iMin
 *     is currently paired to.
 *
 * Polls every 30 seconds so a new online order from the storefront
 * shows up without the operator having to refresh manually.
 *
 * Endpoints used (all authenticated with the operator's employee JWT):
 *   GET  /api/v1/fulfillment/click-and-collect/list   — denormalised list
 *   POST /api/v1/fulfillment/:id/pick                  — pending → picked
 *   POST /api/v1/fulfillment/:id/pack                  — picked  → packed
 *   POST /api/v1/fulfillment/:id/ready                 — packed  → ready (notifies customer)
 *   POST /api/v1/fulfillment/:id/collect               — ready   → collected
 *   POST /api/v1/fulfillment/:id/cancel                — any     → cancelled
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { confirm, toast } from '../../components/ui';
import { printText, isConnected as isReceiptPrinterConnected } from '../../lib/printer';

const API_BASE =
  process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4004';

type CollectStatus = 'pending' | 'picked' | 'packed' | 'ready' | 'dispatched' | 'collected' | 'cancelled';

interface CollectOrder {
  id: string;
  fulfillmentId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  status: CollectStatus;
  itemCount: number;
  itemsSummary: string;
  total: string | number;
  pickupReadyAt: string | null;
  notes: string | null;
  readyAt: string | null;
  createdAt: string;
}

type FilterTab = 'preparing' | 'ready' | 'history';

const STATUS_BG: Record<CollectStatus, string> = {
  pending:    '#3a2e0d',
  picked:     '#0d2e3a',
  packed:     '#1a1e3a',
  ready:      '#0d3a1e',
  dispatched: '#2e0d3a',
  collected:  '#222232',
  cancelled:  '#3a0d0d',
};

const STATUS_FG: Record<CollectStatus, string> = {
  pending:    '#fbbf24',
  picked:     '#60a5fa',
  packed:     '#818cf8',
  ready:      '#22c55e',
  dispatched: '#a78bfa',
  collected:  '#9ca3af',
  cancelled:  '#f87171',
};

const STATUS_LABELS: Record<CollectStatus, string> = {
  pending:    'PREPARING',
  picked:     'PICKED',
  packed:     'PACKED',
  ready:      'READY',
  dispatched: 'DISPATCHED',
  collected:  'COLLECTED',
  cancelled:  'CANCELLED',
};

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function buildPickupTicket(o: CollectOrder): string {
  const lines: string[] = [];
  lines.push('================================');
  lines.push('   CLICK & COLLECT');
  lines.push('================================');
  lines.push('');
  lines.push(`Order:    ${o.orderNumber}`);
  lines.push(`Customer: ${o.customerName}`);
  lines.push(`Items:    ${o.itemCount}`);
  lines.push(`Total:    ${fmtMoney(o.total)}`);
  if (o.pickupReadyAt) lines.push(`Pickup:   ${o.pickupReadyAt}`);
  lines.push('--------------------------------');
  lines.push(o.itemsSummary || '(no items)');
  lines.push('--------------------------------');
  if (o.notes) {
    lines.push('NOTES:');
    lines.push(o.notes);
    lines.push('--------------------------------');
  }
  lines.push(`Printed: ${fmtTime(new Date().toISOString())}`);
  lines.push('');
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

export default function OnlineOrdersScreen() {
  const employeeToken = useAuthStore((s) => s.employeeToken);
  const identity = useDeviceStore((s) => s.identity);

  const [items, setItems] = useState<CollectOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('preparing');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    if (!token) {
      setError('Not signed in.');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/v1/fulfillment/click-and-collect/list?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: CollectOrder[] };
      setItems(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeToken, identity?.deviceToken]);

  // Initial load + 30s poll so new web orders surface without manual refresh.
  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  // ── State transitions ────────────────────────────────────────────────────
  // Mirrors the dashboard one-shot UX: "Mark Ready" runs pick → pack → ready
  // sequentially. Each transition fires a customer email on the server.

  async function transition(id: string, path: 'pick' | 'pack' | 'ready' | 'collect' | 'cancel'): Promise<boolean> {
    const token = employeeToken ?? identity?.deviceToken ?? '';
    const res = await fetch(`${API_BASE}/api/v1/fulfillment/${id}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  }

  async function handleMarkReady(o: CollectOrder) {
    setBusyId(o.fulfillmentId);
    try {
      // Run only the transitions we still need based on the current status.
      if (o.status === 'pending') {
        if (!(await transition(o.fulfillmentId, 'pick'))) throw new Error('pick failed');
      }
      if (o.status === 'pending' || o.status === 'picked') {
        if (!(await transition(o.fulfillmentId, 'pack'))) throw new Error('pack failed');
      }
      if (o.status !== 'ready') {
        if (!(await transition(o.fulfillmentId, 'ready'))) throw new Error('ready failed');
      }
      toast.success('Marked ready', `${o.orderNumber} — customer notified.`);
      await load();
    } catch {
      toast.error('Could not mark ready', `Try again or refresh ${o.orderNumber}.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkCollected(o: CollectOrder) {
    setBusyId(o.fulfillmentId);
    try {
      if (!(await transition(o.fulfillmentId, 'collect'))) throw new Error('collect failed');
      toast.success('Collected', `${o.orderNumber} closed out.`);
      await load();
    } catch {
      toast.error('Could not mark collected', o.orderNumber);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(o: CollectOrder) {
    const ok = await confirm({
      title: 'Cancel order?',
      description: `Cancel ${o.orderNumber} for ${o.customerName}? The customer will be emailed.`,
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(o.fulfillmentId);
    try {
      if (!(await transition(o.fulfillmentId, 'cancel'))) throw new Error('cancel failed');
      toast.success('Cancelled', o.orderNumber);
      await load();
    } catch {
      toast.error('Could not cancel', o.orderNumber);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePrint(o: CollectOrder) {
    if (!isReceiptPrinterConnected()) {
      toast.error('No printer paired', 'Connect one from More → Receipt Printer.');
      return;
    }
    setPrintingId(o.fulfillmentId);
    try {
      await printText(buildPickupTicket(o));
      toast.success('Ticket sent', o.orderNumber);
    } catch {
      toast.error('Print failed', o.orderNumber);
    } finally {
      setPrintingId(null);
    }
  }

  // ── Filtering ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (activeTab === 'preparing') {
      return items.filter((i) => ['pending', 'picked', 'packed'].includes(i.status));
    }
    if (activeTab === 'ready') return items.filter((i) => i.status === 'ready');
    return items.filter((i) => ['collected', 'cancelled', 'dispatched'].includes(i.status));
  }, [items, activeTab]);

  const counts = useMemo(() => ({
    preparing: items.filter((i) => ['pending', 'picked', 'packed'].includes(i.status)).length,
    ready:     items.filter((i) => i.status === 'ready').length,
    history:   items.filter((i) => ['collected', 'cancelled', 'dispatched'].includes(i.status)).length,
  }), [items]);

  // ── Render ───────────────────────────────────────────────────────────────

  function renderItem({ item: o }: { item: CollectOrder }) {
    const isBusy = busyId === o.fulfillmentId;
    const isPrinting = printingId === o.fulfillmentId;
    const isDone = o.status === 'collected' || o.status === 'cancelled';
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderNum}>{o.orderNumber}</Text>
            <Text style={styles.customer}>{o.customerName}</Text>
          </View>
          <View
            style={[
              styles.badge,
              { backgroundColor: STATUS_BG[o.status] },
            ]}
          >
            <Text style={[styles.badgeText, { color: STATUS_FG[o.status] }]}>
              {STATUS_LABELS[o.status]}
            </Text>
          </View>
        </View>

        <Text style={styles.itemsSummary} numberOfLines={3}>
          {o.itemsSummary || '—'}
        </Text>

        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>
            {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {fmtMoney(o.total)}
          </Text>
          <Text style={styles.metaText}>{fmtTime(o.createdAt)}</Text>
        </View>

        {o.pickupReadyAt && (
          <View style={styles.pickupChip}>
            <Ionicons name="time-outline" size={12} color="#fbbf24" />
            <Text style={styles.pickupChipText}>Pickup: {o.pickupReadyAt}</Text>
          </View>
        )}

        {o.notes && (
          <Text style={styles.notes} numberOfLines={2}>{o.notes}</Text>
        )}

        {!isDone && (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => handlePrint(o)}
              disabled={isPrinting || isBusy}
              style={[styles.actionBtn, styles.actionGhost]}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color="#ccc" />
              ) : (
                <>
                  <Ionicons name="print-outline" size={16} color="#ccc" />
                  <Text style={styles.actionGhostText}>Print</Text>
                </>
              )}
            </TouchableOpacity>

            {o.status !== 'ready' && (
              <TouchableOpacity
                onPress={() => handleMarkReady(o)}
                disabled={isBusy}
                style={[styles.actionBtn, styles.actionPrimary]}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.actionPrimaryText}>Mark Ready</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {o.status === 'ready' && (
              <TouchableOpacity
                onPress={() => handleMarkCollected(o)}
                disabled={isBusy}
                style={[styles.actionBtn, styles.actionSuccess]}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="bag-check-outline" size={16} color="#fff" />
                    <Text style={styles.actionPrimaryText}>Collected</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => handleCancel(o)}
              disabled={isBusy}
              style={[styles.actionBtn, styles.actionDanger]}
            >
              <Ionicons name="close-outline" size={16} color="#f87171" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Click & Collect</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#ccc" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContainer}
      >
        {(['preparing', 'ready', 'history'] as FilterTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setActiveTab(t)}
            style={[styles.tab, activeTab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'preparing' ? 'Preparing' : t === 'ready' ? 'Ready' : 'History'}
              {' '}({counts[t]})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && items.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color="#6366f1" />
          <Text style={styles.emptyText}>Loading orders…</Text>
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={36} color="#f87171" />
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="basket-outline" size={48} color="#444" />
          <Text style={styles.emptyText}>
            {activeTab === 'preparing'
              ? 'No orders to prepare.'
              : activeTab === 'ready'
                ? 'No orders waiting for pickup.'
                : 'No completed orders yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(o) => o.fulfillmentId}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ccc" />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  refreshBtn: { padding: 6 },
  tabsContainer: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  tabActive: { backgroundColor: '#1e1e2e', borderColor: '#6366f1' },
  tabText: { color: '#888', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  list: { padding: 12, paddingBottom: 32 },

  card: {
    backgroundColor: '#141425',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    marginBottom: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  orderNum: { color: '#fff', fontSize: 17, fontWeight: '800' },
  customer: { color: '#aaa', fontSize: 14, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  itemsSummary: { color: '#ddd', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metaText: { color: '#888', fontSize: 12 },

  pickupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3a2e0d',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  pickupChipText: { color: '#fbbf24', fontSize: 11, fontWeight: '600' },

  notes: { color: '#999', fontSize: 12, fontStyle: 'italic', marginTop: 6 },

  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
  },
  actionGhost: { backgroundColor: '#1e1e2e', borderWidth: 1, borderColor: '#2a2a3a' },
  actionGhostText: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  actionPrimary: { backgroundColor: '#6366f1', flex: 1 },
  actionPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionSuccess: { backgroundColor: '#16a34a', flex: 1 },
  actionDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3a0d0d',
    paddingHorizontal: 10,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyText: { color: '#888', fontSize: 14, textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#1e1e2e',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  retryBtnText: { color: '#ccc', fontSize: 13, fontWeight: '600' },
});
