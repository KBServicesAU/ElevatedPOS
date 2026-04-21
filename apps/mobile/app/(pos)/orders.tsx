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
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';

/**
 * Orders list (v2.7.27).
 *
 * Merchant-requested overhaul:
 *   - Tap a row to open the full-order detail page (`/orders/[id]`) where
 *     refund / reversal / reprint / notes live.
 *   - Search bar across the top with 300ms debounce. Matches order number
 *     (contains), customer name (contains), or an exact dollar amount.
 *   - Date filter chips: Today / Yesterday / 7 days / All. These send
 *     ISO `from`/`to` query params; the backend falls back to returning
 *     the full window if the params aren't wired and we filter client-side.
 */

// In local dev, orders service runs on EXPO_PUBLIC_ORDERS_API_URL (default port 4004).
// In production, EXPO_PUBLIC_API_URL points at the nginx gateway which routes
// /api/v1/orders → orders service, so it also works as a fallback.
const API_BASE =
  process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4004';

interface Order {
  id: string;
  orderNumber: string;
  total: number | string;
  status: string;
  channel: string;
  createdAt: string;
  /** May be absent on the list endpoint — present on detail only. */
  customerName?: string | null;
  lines?: { name: string; quantity: number | string; unitPrice: number | string }[];
}

type DateRangeKey = 'today' | 'yesterday' | 'last7' | 'all';

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

export default function OrdersScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeKey>('today');

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
  }, [employeeToken, identity, dateRange]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Client-side filter — applied regardless of whether the backend
  // honoured the date params, so the UI is stable even against an older
  // server. Also gives us the fuzzy contains-match for the search box.
  const filtered = useMemo(() => {
    const range = computeRange(dateRange);
    const exactDollarMatch = (() => {
      const n = Number(search);
      return !Number.isNaN(n) && search.length > 0 ? n : null;
    })();

    return orders.filter((o) => {
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
  }, [orders, search, dateRange]);

  function statusColor(status: string) {
    if (status === 'completed' || status === 'paid') return '#22c55e';
    if (status === 'partially_refunded') return '#f59e0b';
    if (status === 'pending' || status === 'open') return '#f59e0b';
    if (status === 'cancelled' || status === 'refunded' || status === 'reversed') return '#ef4444';
    return '#888';
  }

  function renderOrder({ item }: { item: Order }) {
    const time = new Date(item.createdAt).toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const date = new Date(item.createdAt).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
    });
    const totalNum = typeof item.total === 'number' ? item.total : Number(item.total) || 0;
    const total = totalNum.toFixed(2);

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
            <Text style={s.orderTotal}>${total}</Text>
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

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Orders</Text>
        <TouchableOpacity onPress={fetchOrders} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <Ionicons name="refresh" size={20} color="#888" />
          )}
        </TouchableOpacity>
      </View>

      {/* ── Search ────────────────────────────────── */}
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

      {/* ── Date range chips ──────────────────────── */}
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
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          renderItem={renderOrder}
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

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 10,
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

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
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
});
