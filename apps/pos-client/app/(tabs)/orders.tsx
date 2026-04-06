import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { posApiFetch } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'open' | 'complete' | 'refunded' | 'voided';

interface OrderItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

interface Order {
  id: string;
  orderNumber: string;
  customerName?: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status: OrderStatus;
  createdAt: string;
}

// ─── Status Config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<OrderStatus, { label: string; bg: string; text: string; dot: string }> = {
  open:     { label: 'Open',     bg: '#1e3a5f', text: '#93c5fd', dot: '#60a5fa' },
  complete: { label: 'Complete', bg: '#14532d', text: '#86efac', dot: '#4ade80' },
  refunded: { label: 'Refunded', bg: '#451a03', text: '#fcd34d', dot: '#fbbf24' },
  voided:   { label: 'Voided',   bg: '#2d1111', text: '#fca5a5', dot: '#f87171' },
};

const FILTER_TABS: Array<'all' | OrderStatus> = ['all', 'open', 'complete', 'refunded', 'voided'];

// TODO: Remove mock seed data once GET /api/v1/orders is reliably deployed
// ─── Mock seed data (replaces API when offline / for demo) ────────────────────

function makeMockOrders(): Order[] {
  const now = new Date();
  const t = (minutesAgo: number) => {
    const d = new Date(now.getTime() - minutesAgo * 60_000);
    return d.toISOString();
  };
  return [
    {
      id: 'o1', orderNumber: '1042', customerName: 'Emily R.',
      items: [
        { id: 'i1', name: 'Cold Brew', qty: 2, unitPrice: 650 },
        { id: 'i2', name: 'Banana Bread', qty: 2, unitPrice: 550 },
        { id: 'i3', name: 'Oat Milk Latte', qty: 1, unitPrice: 650 },
      ],
      subtotal: 3050, tax: 305, total: 3355, paymentMethod: 'card', status: 'open', createdAt: t(8),
    },
    {
      id: 'o2', orderNumber: '1041',
      items: [{ id: 'i4', name: 'Iced Latte', qty: 1, unitPrice: 600 }],
      subtotal: 600, tax: 60, total: 660, paymentMethod: 'card', status: 'complete', createdAt: t(21),
    },
    {
      id: 'o3', orderNumber: '1040', customerName: 'David W.',
      items: [
        { id: 'i5', name: 'Flat White', qty: 2, unitPrice: 500 },
        { id: 'i6', name: 'Croissant', qty: 1, unitPrice: 550 },
        { id: 'i7', name: 'Avocado Toast', qty: 1, unitPrice: 1600 },
      ],
      subtotal: 3150, tax: 315, total: 3465, paymentMethod: 'card', status: 'complete', createdAt: t(40),
    },
    {
      id: 'o4', orderNumber: '1039',
      items: [{ id: 'i8', name: 'Pour Over', qty: 1, unitPrice: 800 }],
      subtotal: 800, tax: 80, total: 880, paymentMethod: 'cash', status: 'complete', createdAt: t(56),
    },
    {
      id: 'o5', orderNumber: '1038', customerName: 'Mia T.',
      items: [
        { id: 'i9', name: 'Flat White', qty: 1, unitPrice: 500 },
        { id: 'i10', name: 'Croissant', qty: 2, unitPrice: 550 },
      ],
      subtotal: 1600, tax: 160, total: 1760, paymentMethod: 'card', status: 'refunded', createdAt: t(78),
    },
    {
      id: 'o6', orderNumber: '1037',
      items: [
        { id: 'i11', name: 'Cold Brew', qty: 1, unitPrice: 650 },
        { id: 'i12', name: 'Banana Bread', qty: 1, unitPrice: 550 },
      ],
      subtotal: 1200, tax: 120, total: 1320, paymentMethod: 'card', status: 'complete', createdAt: t(94),
    },
    {
      id: 'o7', orderNumber: '1036', customerName: 'Alex P.',
      items: [
        { id: 'i13', name: 'Eggs Benedict', qty: 1, unitPrice: 2200 },
        { id: 'i14', name: 'Iced Latte', qty: 1, unitPrice: 600 },
      ],
      subtotal: 2800, tax: 280, total: 3080, paymentMethod: 'card', status: 'complete', createdAt: t(105),
    },
    {
      id: 'o8', orderNumber: '1035',
      items: [{ id: 'i15', name: 'Pour Over', qty: 2, unitPrice: 800 }],
      subtotal: 1600, tax: 160, total: 1760, paymentMethod: 'cash', status: 'voided', createdAt: t(126),
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// ─── Refund Modal ─────────────────────────────────────────────────────────────

interface RefundModalProps {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
  onRefunded: (orderId: string) => void;
}

function RefundModal({ visible, order, onClose, onRefunded }: RefundModalProps) {
  const [amountStr, setAmountStr] = useState('');
  const [refunding, setRefunding] = useState(false);

  const maxRefund = order ? order.total / 100 : 0;
  const amount = Number(amountStr) || 0;

  const reset = () => { setAmountStr(''); setRefunding(false); };
  const handleClose = () => { reset(); onClose(); };

  const handleRefund = async () => {
    if (!order || amount <= 0 || amount > maxRefund) return;
    setRefunding(true);
    try {
      await posApiFetch('/api/v1/payments/refunds', {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          amount: Math.round(amount * 100),
        }),
      });
      onRefunded(order.id);
      reset();
    } catch (err) {
      Alert.alert('Refund Failed', err instanceof Error ? err.message : 'Could not process refund.');
      setRefunding(false);
    }
  };

  if (!order) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={rm.overlay}>
        <View style={rm.sheet}>
          <View style={rm.header}>
            <Text style={rm.title}>Refund Order #{order.orderNumber}</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={rm.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={rm.totalBox}>
            <Text style={rm.totalLabel}>Order Total</Text>
            <Text style={rm.totalValue}>{fmt(order.total)}</Text>
          </View>

          <Text style={rm.label}>Refund Amount ($)</Text>
          <TextInput
            style={rm.input}
            placeholder={`Max ${fmt(order.total)}`}
            placeholderTextColor="#4b5563"
            keyboardType="decimal-pad"
            value={amountStr}
            onChangeText={setAmountStr}
          />
          <TouchableOpacity
            style={rm.fullRefundBtn}
            onPress={() => setAmountStr((order.total / 100).toFixed(2))}
          >
            <Text style={rm.fullRefundText}>Full refund ({fmt(order.total)})</Text>
          </TouchableOpacity>

          {amount > maxRefund && (
            <Text style={rm.errorText}>Amount exceeds order total.</Text>
          )}

          <TouchableOpacity
            style={[rm.refundBtn, (refunding || amount <= 0 || amount > maxRefund) && rm.refundBtnDisabled]}
            onPress={handleRefund}
            disabled={refunding || amount <= 0 || amount > maxRefund}
          >
            {refunding ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={rm.refundBtnText}>
                {amount > 0 ? `Refund $${amount.toFixed(2)}` : 'Refund'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    gap: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#f1f5f9' },
  close: { fontSize: 18, color: '#94a3b8', paddingHorizontal: 4 },
  totalBox: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  totalLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  totalValue: { fontSize: 28, fontWeight: '800', color: '#f1f5f9' },
  label: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  fullRefundBtn: { alignSelf: 'flex-start', paddingVertical: 2 },
  fullRefundText: { color: '#60a5fa', fontSize: 13 },
  errorText: { color: '#f87171', fontSize: 13 },
  refundBtn: {
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  refundBtnDisabled: { backgroundColor: '#451a03', opacity: 0.5 },
  refundBtnText: { color: '#1a1a00', fontSize: 16, fontWeight: '800' },
});

// ─── Order Detail expanded view ────────────────────────────────────────────────

interface OrderDetailProps {
  order: Order;
  onReprint: (order: Order) => void;
  onRefund: (order: Order) => void;
}

function OrderDetail({ order, onReprint, onRefund }: OrderDetailProps) {
  return (
    <View style={det.box}>
      {/* Items */}
      <Text style={det.sectionTitle}>Items</Text>
      {order.items.map((item) => (
        <View key={item.id} style={det.itemRow}>
          <Text style={det.itemQty}>{item.qty}×</Text>
          <Text style={det.itemName}>{item.name}</Text>
          <Text style={det.itemPrice}>{fmt(item.unitPrice * item.qty)}</Text>
        </View>
      ))}

      {/* Totals */}
      <View style={det.totalsBox}>
        <View style={det.totalRow}>
          <Text style={det.totalLabel}>Subtotal</Text>
          <Text style={det.totalValue}>{fmt(order.subtotal)}</Text>
        </View>
        <View style={det.totalRow}>
          <Text style={det.totalLabel}>GST</Text>
          <Text style={det.totalValue}>{fmt(order.tax)}</Text>
        </View>
        <View style={[det.totalRow, det.totalRowBold]}>
          <Text style={[det.totalLabel, { color: '#f1f5f9' }]}>Total</Text>
          <Text style={[det.totalValue, { color: '#f1f5f9', fontWeight: '800' }]}>{fmt(order.total)}</Text>
        </View>
      </View>

      {/* Payment method + timestamp */}
      <View style={det.metaRow}>
        <Ionicons
          name={order.paymentMethod === 'cash' ? 'cash-outline' : 'card-outline'}
          size={14}
          color="#64748b"
        />
        <Text style={det.metaText}>
          {order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
        </Text>
        <Text style={det.metaDot}>·</Text>
        <Ionicons name="time-outline" size={14} color="#64748b" />
        <Text style={det.metaText}>{fmtTime(order.createdAt)}</Text>
      </View>

      {/* Actions */}
      <View style={det.actionsRow}>
        <TouchableOpacity style={det.reprintBtn} onPress={() => onReprint(order)}>
          <Ionicons name="print-outline" size={15} color="#93c5fd" />
          <Text style={det.reprintText}>Reprint Receipt</Text>
        </TouchableOpacity>

        {order.status === 'complete' && (
          <TouchableOpacity style={det.refundBtn} onPress={() => onRefund(order)}>
            <Ionicons name="return-down-back-outline" size={15} color="#fcd34d" />
            <Text style={det.refundBtnText}>Refund</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const det = StyleSheet.create({
  box: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    paddingTop: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  itemQty: { fontSize: 13, color: '#64748b', width: 28 },
  itemName: { flex: 1, fontSize: 13, color: '#e2e8f0' },
  itemPrice: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  totalsBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 4,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRowBold: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  totalLabel: { fontSize: 13, color: '#64748b' },
  totalValue: { fontSize: 13, color: '#94a3b8' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metaText: { fontSize: 12, color: '#64748b' },
  metaDot: { color: '#374151', fontSize: 14 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  reprintBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#1e40af',
  },
  reprintText: { color: '#93c5fd', fontSize: 13, fontWeight: '600' },
  refundBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#451a03',
    borderRadius: 10,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#92400e',
  },
  refundBtnText: { color: '#fcd34d', fontSize: 13, fontWeight: '600' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApiFetch<{ data: Order[] }>('/api/v1/orders?date=today&limit=50');
      setOrders(res.data ?? []);
    } catch {
      // TODO: Replace mock fallback with real API data when orders service is deployed
      // Fallback to mock data so the screen is functional offline/in dev
      setOrders(makeMockOrders());
      Alert.alert('Offline Mode', 'Could not load orders from server. Showing demo data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const visible = useMemo(() => {
    let list = orders;
    if (filter !== 'all') list = list.filter((o) => o.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          (o.customerName?.toLowerCase() ?? '').includes(q),
      );
    }
    return list;
  }, [orders, filter, search]);

  const shiftSales = useMemo(
    () => orders.filter((o) => o.status === 'complete').reduce((s, o) => s + o.total, 0),
    [orders],
  );
  const completedCount = orders.filter((o) => o.status === 'complete').length;
  const openCount = orders.filter((o) => o.status === 'open').length;

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleReprint = async (order: Order) => {
    setReprintingId(order.id);
    try {
      await posApiFetch('/api/v1/hardware-bridge/print', {
        method: 'POST',
        body: JSON.stringify({ type: 'receipt', orderId: order.id }),
      });
      Alert.alert('Reprinted', `Receipt for #${order.orderNumber} sent to printer.`);
    } catch (err) {
      Alert.alert('Print Failed', err instanceof Error ? err.message : 'Could not reach printer.');
    } finally {
      setReprintingId(null);
    }
  };

  const handleRefundComplete = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'refunded' } : o)),
    );
    setShowRefund(false);
    setRefundOrder(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Shift summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{completedCount}</Text>
          <Text style={styles.summaryLabel}>Completed</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{fmt(shiftSales)}</Text>
          <Text style={styles.summaryLabel}>Shift Sales</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{openCount}</Text>
          <Text style={styles.summaryLabel}>Open</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#4b5563" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search order # or customer"
            placeholderTextColor="#4b5563"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#4b5563" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadOrders}>
          <Ionicons name="refresh-outline" size={18} color="#60a5fa" />
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContent}
      >
        {FILTER_TABS.map((tab) => {
          const label =
            tab === 'all' ? 'All' : STATUS_CFG[tab as OrderStatus].label;
          const count =
            tab === 'all'
              ? orders.length
              : orders.filter((o) => o.status === tab).length;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              style={[styles.tab, filter === tab && styles.tabActive]}
            >
              {filter === tab && tab !== 'all' && (
                <View
                  style={[
                    styles.tabDot,
                    { backgroundColor: STATUS_CFG[tab as OrderStatus].dot },
                  ]}
                />
              )}
              <Text style={[styles.tabText, filter === tab && styles.tabTextActive]}>
                {label}
              </Text>
              <View style={styles.tabCount}>
                <Text style={styles.tabCountText}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Order list */}
      {loading ? (
        <ActivityIndicator color="#60a5fa" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {visible.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={44} color="#1f2937" />
              <Text style={styles.emptyTitle}>No orders found</Text>
              <Text style={styles.emptySubtitle}>
                {search ? 'Try a different search term' : 'No orders match this filter'}
              </Text>
            </View>
          ) : (
            visible.map((order) => {
              const sc = STATUS_CFG[order.status];
              const expanded = expandedId === order.id;
              const reprinting = reprintingId === order.id;

              return (
                <TouchableOpacity
                  key={order.id}
                  style={[
                    styles.orderCard,
                    order.status === 'voided' && styles.orderCardVoided,
                  ]}
                  onPress={() => setExpandedId(expanded ? null : order.id)}
                  activeOpacity={0.8}
                >
                  {/* Top row */}
                  <View style={styles.orderTop}>
                    <View style={styles.orderLeft}>
                      <View style={styles.orderNumberRow}>
                        <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                        {order.customerName ? (
                          <Text style={styles.customerName}>· {order.customerName}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.itemsText} numberOfLines={1}>
                        {order.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                      </Text>
                    </View>
                    <View style={styles.orderRight}>
                      <Text style={styles.orderTotal}>{fmt(order.total)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
                        <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
                      </View>
                    </View>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color="#4b5563"
                      style={{ marginLeft: 8 }}
                    />
                  </View>

                  {/* Bottom meta row */}
                  <View style={styles.orderMeta}>
                    <Ionicons
                      name={order.paymentMethod === 'cash' ? 'cash-outline' : 'card-outline'}
                      size={12}
                      color="#6b7280"
                    />
                    <Text style={styles.metaText}>
                      {order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
                    </Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.metaText}>{fmtTime(order.createdAt)}</Text>
                    {reprinting && (
                      <>
                        <Text style={styles.metaDot}>·</Text>
                        <ActivityIndicator size="small" color="#60a5fa" />
                        <Text style={[styles.metaText, { color: '#60a5fa' }]}>Printing…</Text>
                      </>
                    )}
                  </View>

                  {/* Expanded detail */}
                  {expanded && (
                    <OrderDetail
                      order={order}
                      onReprint={handleReprint}
                      onRefund={(o) => {
                        setRefundOrder(o);
                        setShowRefund(true);
                      }}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      <RefundModal
        visible={showRefund}
        order={refundOrder}
        onClose={() => { setShowRefund(false); setRefundOrder(null); }}
        onRefunded={handleRefundComplete}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },
  summaryLabel: { color: '#64748b', fontSize: 11, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: '#0f3460', marginHorizontal: 8 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#f1f5f9' },
  refreshBtn: { padding: 6 },

  tabScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  tabContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#16213e',
    gap: 5,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  tabActive: { backgroundColor: '#0f3460', borderColor: '#1e40af' },
  tabDot: { width: 6, height: 6, borderRadius: 3 },
  tabText: { color: '#6b7280', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#f1f5f9' },
  tabCount: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabCountText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },

  list: { flex: 1 },
  listContent: { padding: 12, gap: 10 },

  orderCard: {
    backgroundColor: '#16213e',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  orderCardVoided: { opacity: 0.65 },

  orderTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  orderLeft: { flex: 1, gap: 4 },
  orderNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderNumber: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  customerName: { color: '#94a3b8', fontSize: 13 },
  itemsText: { color: '#6b7280', fontSize: 12 },
  orderRight: { alignItems: 'flex-end', gap: 5 },
  orderTotal: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  orderMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { color: '#6b7280', fontSize: 12 },
  metaDot: { color: '#374151', fontSize: 13 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  emptySubtitle: { color: '#4b5563', fontSize: 13 },
});
