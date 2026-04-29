import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { usePosStore } from '../../store/pos';
import { confirm, toast } from '../../components/ui';

/**
 * Orders list (v2.7.44).
 *
 * Merchant-requested overhaul:
 *   - Tap a row to open the full-order detail page (`/orders/[id]`) where
 *     refund / reversal / reprint / notes / resume live.
 *   - Search bar across the top with 300ms debounce.
 *   - Date filter chips: Today / Yesterday / 7 days / All.
 *   - Status filter (v2.7.44): All / Open / Held / Completed / Refunded.
 *     Sent to the server via `?status=` so the API does the filtering.
 *   - View mode toggle (v2.7.44): List or Blocks (4-up grid). Persisted via
 *     SecureStore so the operator's preference survives restarts.
 *   - Both views surface paid / remaining / total, computed from the
 *     order.paidTotal field. For an open or held order we treat the entire
 *     `total` as remaining.
 */

// In local dev, orders service runs on EXPO_PUBLIC_ORDERS_API_URL (default port 4004).
// In production, EXPO_PUBLIC_API_URL points at the nginx gateway which routes
// /api/v1/orders → orders service, so it also works as a fallback.
const API_BASE =
  process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4004';

const VIEW_MODE_KEY = 'elevatedpos_orders_view_mode';

interface OrderListLine {
  name: string;
  quantity: number | string;
  unitPrice: number | string;
  /** v2.7.51-C2 — needed when resuming a held order from the list view. */
  productId?: string;
  notes?: string | null;
  seatNumber?: number | null;
}

interface Order {
  id: string;
  orderNumber: string;
  total: number | string;
  /** v2.7.44 — surfaced in the list so we can show paid / remaining columns. */
  paidTotal?: number | string | null;
  status: string;
  channel: string;
  createdAt: string;
  /** v2.7.51-C2 — denormalised by the orders service GET / handler. */
  customerId?: string | null;
  customerName?: string | null;
  lines?: OrderListLine[];
}

type DateRangeKey = 'today' | 'yesterday' | 'last7' | 'all';
type StatusKey = 'all' | 'open' | 'held' | 'completed' | 'refunded';
type ViewMode = 'list' | 'blocks';

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function computeRange(key: DateRangeKey): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (key === 'all') return { from: null, to: null };
  if (key === 'today') {
    return { from: startOfDay(now), to: null };
  }
  if (key === 'yesterday') {
    const y = startOfDay(now);
    y.setDate(y.getDate() - 1);
    const end = new Date(y);
    end.setDate(end.getDate() + 1);
    return { from: y, to: end };
  }
  // last7 — from 7 days ago (start of that day) to now
  const d = startOfDay(now);
  d.setDate(d.getDate() - 6);
  return { from: d, to: null };
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

function toNum(n: number | string | null | undefined): number {
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export default function OrdersScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeKey>('today');
  const [status, setStatus] = useState<StatusKey>('all');

  // View mode (List vs 4-up Blocks). Defaults to list, hydrates from
  // SecureStore on mount, persists on every change.
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  useEffect(() => {
    SecureStore.getItemAsync(VIEW_MODE_KEY)
      .then((raw) => {
        if (raw === 'blocks' || raw === 'list') setViewMode(raw);
      })
      .catch(() => { /* ignore */ });
  }, []);
  const setViewModeAndPersist = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    SecureStore.setItemAsync(VIEW_MODE_KEY, mode).catch(() => { /* ignore */ });
  }, []);

  // Raw vs. debounced search so we don't re-render the list on every
  // keystroke — the debounce is small (300ms) but enough to keep the
  // scroll smooth on low-end Android tablets.
  const [searchRaw, setSearchRaw] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    try {
      const locationId = identity?.locationId ?? '';
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (locationId) params.set('locationId', locationId);
      // Server-side status filter (v2.7.44). 'all' omits the param.
      if (status !== 'all') params.set('status', status);
      const { from, to } = computeRange(dateRange);
      if (from) params.set('from', from.toISOString());
      if (to) params.set('to', to.toISOString());

      const res = await fetch(`${API_BASE}/api/v1/orders?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data ?? data ?? []);
      } else {
        const body = await res.text().catch(() => '');
        let errMsg = `Error ${res.status}`;
        try { const j = JSON.parse(body); errMsg = j.message ?? j.detail ?? j.title ?? errMsg; } catch { /* ignore */ }
        setError(errMsg);
      }
    } catch {
      setError('Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [employeeToken, identity, dateRange, status]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Client-side filter — applied regardless of whether the backend
  // honoured the date params, so the UI is stable even against an older
  // server. Also gives us the fuzzy contains-match for the search box,
  // and a status fallback when 'refunded' should also surface partial
  // refunds.
  const filtered = useMemo(() => {
    const range = computeRange(dateRange);
    const exactDollarMatch = (() => {
      const n = Number(search);
      return !Number.isNaN(n) && search.length > 0 ? n : null;
    })();

    return orders.filter((o) => {
      // Status (client-side fallback). 'refunded' also matches partial.
      if (status !== 'all') {
        if (status === 'refunded') {
          if (o.status !== 'refunded' && o.status !== 'partially_refunded') return false;
        } else if (o.status !== status) {
          return false;
        }
      }

      // Date range (client-side fallback)
      if (range.from || range.to) {
        const when = new Date(o.createdAt);
        if (range.from && when < range.from) return false;
        if (range.to   && when >= range.to)  return false;
      }

      if (!search) return true;

      const num = String(o.orderNumber ?? '').toLowerCase();
      const cust = String(o.customerName ?? '').toLowerCase();
      const total = typeof o.total === 'number' ? o.total : Number(o.total) || 0;

      if (num.includes(search)) return true;
      if (cust && cust.includes(search)) return true;
      if (exactDollarMatch !== null && Math.abs(total - exactDollarMatch) < 0.01) return true;
      return false;
    });
  }, [orders, search, dateRange, status]);

  function statusColor(st: string) {
    if (st === 'completed' || st === 'paid') return '#22c55e';
    if (st === 'partially_refunded') return '#f59e0b';
    if (st === 'pending' || st === 'open') return '#f59e0b';
    if (st === 'held') return '#3b82f6';
    if (st === 'cancelled' || st === 'refunded' || st === 'reversed') return '#ef4444';
    return '#888';
  }

  // Compute paid / remaining / total numbers for an order. For open or
  // held orders, paidTotal is typically 0 — show the full total as
  // "remaining" so staff can see at a glance what's owed.
  function computeMoney(o: Order) {
    const total = toNum(o.total);
    const paid = toNum(o.paidTotal);
    const isOpenLike = o.status === 'open' || o.status === 'held';
    const remaining = isOpenLike && paid <= 0
      ? total
      : Math.max(0, total - paid);
    return { total, paid, remaining };
  }

  /**
   * v2.7.51-C2 — Resume a held order directly from the list view.
   *
   * Mirrors the Resume flow already implemented in
   * `apps/mobile/app/(pos)/orders/[id].tsx` (handleResume) so the operator
   * doesn't have to drill into detail just to rehydrate a held cart. The
   * detail screen handler also rehydrates → cancels the held row → routes
   * to /(pos)/sell. We re-use exactly the same shape:
   *   1. Map order.lines → POS cart items (productId, name, qty, price)
   *   2. setCustomer if there was one attached at hold time
   *   3. POST /:id/cancel with reason 'Resumed to cart' (status flips to
   *      'cancelled' so the held row stops cluttering the list)
   *   4. Navigate to /(pos)/sell where Pay creates a fresh order id
   *
   * Cancellation failures are non-fatal — the cart is hydrated before the
   * network call so the operator always gets their items back even if
   * the server is unreachable.
   */
  const [resumingId, setResumingId] = useState<string | null>(null);
  const handleResume = useCallback(async (o: Order) => {
    if (o.status !== 'held') return;
    if (!o.lines || o.lines.length === 0) {
      toast.warning('Cannot resume', 'This held order has no line items.');
      return;
    }
    const ok = await confirm({
      title: 'Resume held order?',
      description:
        'The items will be loaded into the cart and this held order will be cancelled. ' +
        'A fresh order is created when you press Pay again.',
      confirmLabel: 'Resume',
    });
    if (!ok) return;

    setResumingId(o.id);
    try {
      const lines = o.lines.map((l) => ({
        productId: l.productId ?? '', // older list payloads omitted productId
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        // v2.7.75 — preserve hold-time discounts on resume.
        discountAmount: (l as { discountAmount?: number | string | null }).discountAmount ?? null,
        notes: l.notes ?? null,
        seatNumber: l.seatNumber ?? null,
      }));
      // Filter out any line that has no productId — the POS cart cannot
      // round-trip without one (it's the merge key for addItem).
      const safeLines = lines.filter((l) => !!l.productId);
      if (safeLines.length === 0) {
        toast.warning(
          'Cannot resume',
          'Held order is missing line product ids — open the order detail to resume.',
        );
        return;
      }
      usePosStore.getState().rehydrateFromOrder(safeLines);
      if (o.customerId && o.customerName) {
        usePosStore.getState().setCustomer(o.customerId, o.customerName);
      }

      const token = employeeToken ?? identity?.deviceToken ?? '';
      try {
        const res = await fetch(`${API_BASE}/api/v1/orders/${o.id}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: 'Resumed to cart' }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok && res.status !== 422) {
          const body = await res.json().catch(() => ({})) as { detail?: string; message?: string };
          toast.warning(
            'Held order not cleared',
            body.detail ?? body.message ?? `Server returned ${res.status} — cart loaded anyway.`,
          );
        }
      } catch {
        toast.warning('Offline', 'Cart loaded but the held order could not be cancelled. Reconcile from Orders.');
      }

      toast.success('Resumed', `Order #${o.orderNumber} loaded into cart.`);
      router.push('/(pos)/sell' as never);
    } finally {
      setResumingId(null);
    }
  }, [employeeToken, identity, router]);

  function renderListOrder({ item }: { item: Order }) {
    const time = new Date(item.createdAt).toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const date = new Date(item.createdAt).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
    });
    const money = computeMoney(item);
    const isHeld = item.status === 'held';
    const isResumingThis = resumingId === item.id;

    return (
      <TouchableOpacity
        style={s.orderCard}
        activeOpacity={0.85}
        onPress={() => router.push(`/(pos)/orders/${item.id}` as never)}
      >
        <View style={s.orderRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.orderNumber}>#{item.orderNumber}</Text>
            <Text style={s.orderTime}>
              {date} {time}
              {item.customerName ? `  ·  ${item.customerName}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.orderTotal}>${money.total.toFixed(2)}</Text>
            <View
              style={[
                s.statusBadge,
                {
                  backgroundColor: `${statusColor(item.status)}20`,
                  borderColor: `${statusColor(item.status)}40`,
                },
              ]}
            >
              <Text style={[s.statusText, { color: statusColor(item.status) }]}>
                {item.status}
              </Text>
            </View>
          </View>
        </View>
        {/* v2.7.51-C2 — Resume from list view (held orders only) */}
        {isHeld && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              void handleResume(item);
            }}
            disabled={isResumingThis}
            activeOpacity={0.85}
            style={[s.resumeBtn, isResumingThis && { opacity: 0.6 }]}
          >
            {isResumingThis ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="play" size={14} color="#fff" />
            )}
            <Text style={s.resumeBtnText}>
              {isResumingThis ? 'Resuming…' : 'Resume'}
            </Text>
          </TouchableOpacity>
        )}
        {/* Paid / Remaining columns — added in v2.7.44 */}
        <View style={s.moneyRow}>
          <View style={s.moneyCell}>
            <Text style={s.moneyLabel}>Paid</Text>
            <Text style={[s.moneyValue, { color: money.paid > 0 ? '#22c55e' : '#666' }]}>
              ${money.paid.toFixed(2)}
            </Text>
          </View>
          <View style={s.moneyCell}>
            <Text style={s.moneyLabel}>Remaining</Text>
            <Text style={[s.moneyValue, { color: money.remaining > 0 ? '#f59e0b' : '#666' }]}>
              ${money.remaining.toFixed(2)}
            </Text>
          </View>
          <View style={s.moneyCell}>
            <Text style={s.moneyLabel}>Total</Text>
            <Text style={[s.moneyValue, { color: '#fff' }]}>${money.total.toFixed(2)}</Text>
          </View>
        </View>
        {item.lines && item.lines.length > 0 && (
          <View style={s.linesWrap}>
            {item.lines.slice(0, 3).map((line, i) => (
              <Text key={i} style={s.lineText}>
                {typeof line.quantity === 'number' ? line.quantity : Number(line.quantity)}x {line.name}
              </Text>
            ))}
            {item.lines.length > 3 && (
              <Text style={s.lineText}>+{item.lines.length - 3} more</Text>
            )}
          </View>
        )}
        <View style={s.chevronRow}>
          <Text style={s.chevronHint}>View details</Text>
          <Ionicons name="chevron-forward" size={16} color="#666" />
        </View>
      </TouchableOpacity>
    );
  }

  function renderBlockOrder({ item }: { item: Order }) {
    const money = computeMoney(item);
    const isHeld = item.status === 'held';
    const isResumingThis = resumingId === item.id;
    return (
      <TouchableOpacity
        style={s.blockCard}
        activeOpacity={0.85}
        onPress={() => router.push(`/(pos)/orders/${item.id}` as never)}
      >
        <View style={s.blockHeader}>
          <Text style={s.blockOrderNum} numberOfLines={1}>#{item.orderNumber}</Text>
          <View
            style={[
              s.statusBadgeSm,
              {
                backgroundColor: `${statusColor(item.status)}20`,
                borderColor: `${statusColor(item.status)}40`,
              },
            ]}
          >
            <Text style={[s.statusTextSm, { color: statusColor(item.status) }]}>
              {item.status}
            </Text>
          </View>
        </View>
        <Text style={s.blockCustomer} numberOfLines={1}>
          {item.customerName || 'Walk-in'}
        </Text>
        {/* v2.7.51-C2 — block-view Resume button for held orders */}
        {isHeld && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              void handleResume(item);
            }}
            disabled={isResumingThis}
            activeOpacity={0.85}
            style={[s.resumeBtnSm, isResumingThis && { opacity: 0.6 }]}
          >
            {isResumingThis ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="play" size={11} color="#fff" />
            )}
            <Text style={s.resumeBtnSmText}>
              {isResumingThis ? '…' : 'Resume'}
            </Text>
          </TouchableOpacity>
        )}
        <View style={s.blockMoneyWrap}>
          <View style={s.blockMoneyRow}>
            <Text style={s.blockMoneyLabel}>Paid</Text>
            <Text style={[s.blockMoneyValue, { color: money.paid > 0 ? '#22c55e' : '#666' }]}>
              ${money.paid.toFixed(2)}
            </Text>
          </View>
          <View style={s.blockMoneyRow}>
            <Text style={s.blockMoneyLabel}>Remaining</Text>
            <Text style={[s.blockMoneyValue, { color: money.remaining > 0 ? '#f59e0b' : '#666' }]}>
              ${money.remaining.toFixed(2)}
            </Text>
          </View>
          <View style={[s.blockMoneyRow, s.blockTotalRow]}>
            <Text style={s.blockTotalLabel}>Total</Text>
            <Text style={s.blockTotalValue}>${money.total.toFixed(2)}</Text>
          </View>
        </View>
        <Text style={s.blockTime}>{timeAgo(item.createdAt)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Orders</Text>
        <View style={s.headerRight}>
          {/* View mode toggle — list vs 4-up blocks (v2.7.44) */}
          <View style={s.viewToggle}>
            <TouchableOpacity
              onPress={() => setViewModeAndPersist('list')}
              style={[s.viewToggleBtn, viewMode === 'list' && s.viewToggleBtnActive]}
              activeOpacity={0.85}
            >
              <Ionicons
                name="list"
                size={18}
                color={viewMode === 'list' ? '#fff' : '#94a3b8'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewModeAndPersist('blocks')}
              style={[s.viewToggleBtn, viewMode === 'blocks' && s.viewToggleBtnActive]}
              activeOpacity={0.85}
            >
              <Ionicons
                name="grid"
                size={18}
                color={viewMode === 'blocks' ? '#fff' : '#94a3b8'}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={fetchOrders} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Ionicons name="refresh" size={20} color="#888" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search + status filter row (v2.7.44) */}
      <View style={s.searchRow}>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color="#555" style={{ marginRight: 6 }} />
          <TextInput
            style={s.searchInput}
            value={searchRaw}
            onChangeText={setSearchRaw}
            placeholder="Search by order #, customer or amount"
            placeholderTextColor="#444"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchRaw.length > 0 && (
            <TouchableOpacity onPress={() => setSearchRaw('')}>
              <Ionicons name="close-circle" size={16} color="#555" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status filter chips (v2.7.44) — All / Open / Held / Completed / Refunded */}
      <View style={s.statusChipsRow}>
        {([
          { k: 'all',       label: 'All' },
          { k: 'open',      label: 'Open' },
          { k: 'held',      label: 'Held' },
          { k: 'completed', label: 'Completed' },
          { k: 'refunded',  label: 'Refunded' },
        ] as { k: StatusKey; label: string }[]).map(({ k, label }) => {
          const active = status === k;
          const colour = k === 'all' ? '#6366f1' : statusColor(k);
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setStatus(k)}
              style={[
                s.statusChip,
                active && { backgroundColor: colour, borderColor: colour },
              ]}
              activeOpacity={0.85}
            >
              <Text style={[s.statusChipText, active && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Date range chips */}
      <View style={s.chipsRow}>
        {(['today', 'yesterday', 'last7', 'all'] as DateRangeKey[]).map((k) => {
          const label = k === 'today' ? 'Today'
            : k === 'yesterday' ? 'Yesterday'
            : k === 'last7' ? 'Last 7 days'
            : 'All';
          const active = dateRange === k;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setDateRange(k)}
              style={[s.chip, active && s.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle" size={36} color="#ef4444" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={fetchOrders}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 && !loading ? (
        <View style={s.center}>
          <Ionicons name="receipt-outline" size={36} color="#444" />
          <Text style={s.emptyText}>
            {search ? 'No orders match your search' : 'No orders in this range'}
          </Text>
        </View>
      ) : viewMode === 'blocks' ? (
        <FlatList
          key="blocks"
          data={filtered}
          numColumns={4}
          keyExtractor={(o) => o.id}
          renderItem={renderBlockOrder}
          contentContainerStyle={{ padding: 8, paddingBottom: 20 }}
          columnWrapperStyle={{ gap: 8 }}
          refreshing={loading}
          onRefresh={fetchOrders}
        />
      ) : (
        <FlatList
          key="list"
          data={filtered}
          keyExtractor={(o) => o.id}
          renderItem={renderListOrder}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          refreshing={loading}
          onRefresh={fetchOrders}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '900', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  errorText: { color: '#ef4444', fontSize: 14 },
  emptyText: { color: '#555', fontSize: 14 },
  retryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  retryText: { color: '#fff', fontWeight: '700' },

  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#141425',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  viewToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewToggleBtnActive: {
    backgroundColor: '#6366f1',
  },

  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },

  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    backgroundColor: '#141425',
  },
  statusChipText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    backgroundColor: '#141425',
  },
  chipActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  chipText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#fff' },

  orderCard: {
    backgroundColor: '#141425',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  orderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  orderNumber: { fontSize: 16, fontWeight: '800', color: '#fff' },
  orderTime: { fontSize: 12, color: '#666', marginTop: 2 },
  orderTotal: { fontSize: 18, fontWeight: '900', color: '#6366f1' },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  moneyRow: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    gap: 4,
  },
  moneyCell: { flex: 1 },
  moneyLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  moneyValue: { fontSize: 13, fontWeight: '800', marginTop: 2 },

  linesWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  lineText: { fontSize: 12, color: '#888', lineHeight: 18 },
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    gap: 4,
  },
  chevronHint: { color: '#555', fontSize: 11, fontWeight: '700' },

  // ── Blocks (4-up grid) ──────────────────────────────────────────
  blockCard: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    justifyContent: 'space-between',
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  blockOrderNum: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    flex: 1,
  },
  statusBadgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusTextSm: { fontSize: 8, fontWeight: '800', textTransform: 'uppercase' },
  blockCustomer: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    marginTop: 4,
  },
  blockMoneyWrap: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    gap: 2,
  },
  blockMoneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blockMoneyLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  blockMoneyValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  blockTotalRow: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  blockTotalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    textTransform: 'uppercase',
  },
  blockTotalValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6366f1',
  },
  blockTime: {
    fontSize: 10,
    color: '#666',
    fontWeight: '600',
    textAlign: 'right',
  },

  // ── v2.7.51-C2: Resume button for held orders in the list ────────
  resumeBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resumeBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  resumeBtnSm: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 4,
    backgroundColor: '#3b82f6',
    paddingVertical: 5,
    borderRadius: 6,
  },
  resumeBtnSmText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
