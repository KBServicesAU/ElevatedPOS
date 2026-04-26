import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
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
import { usePosStore } from '../../store/pos';
import { toast } from '../../components/ui';

// In local dev, customers service runs on EXPO_PUBLIC_CUSTOMERS_API_URL (default port 4006).
// In production, EXPO_PUBLIC_API_URL points at the nginx gateway which routes
// /api/v1/customers → customers service, so it also works as a fallback.
const API_BASE =
  process.env['EXPO_PUBLIC_CUSTOMERS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4006';

// Orders service base — used for the order-history fetch on the detail panel.
// In production both services share the gateway under EXPO_PUBLIC_API_URL.
const ORDERS_API_BASE =
  process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4004';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  loyaltyTier?: string;
  totalSpent?: number;
  visitCount?: number;
}

// Detail shape — populated from GET /customers/:id which returns more fields
// than the list endpoint (address, lifetime value, store-credit account, etc).
interface CustomerDetail extends Customer {
  addressLine1?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  lifetimeValue?: number | string | null;
  lastPurchaseAt?: string | null;
  rfmScore?: string | null;
  storeCreditAccount?: { balance?: number | string | null } | null;
}

// Slim subset of OrderDetail returned by GET /orders?customerId=…
interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  total: number | string;
  createdAt: string;
}

function money(n: number | string | null | undefined): string {
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  return `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
}

function toNum(n: number | string | null | undefined): number {
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function statusColour(status: string): string {
  if (status === 'completed' || status === 'paid') return '#22c55e';
  if (status === 'partially_refunded' || status === 'pending' || status === 'open') return '#f59e0b';
  if (status === 'cancelled' || status === 'refunded' || status === 'reversed') return '#ef4444';
  return '#888';
}

export default function CustomersScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);
  const setCustomer = usePosStore((s) => s.setCustomer);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Customer detail modal state ──────────────────────────────
  // Kept as a modal (rather than a dedicated /customers/[id] route) so the
  // operator stays in the Customers screen flow — they can View → close →
  // continue browsing without losing their search/scroll position. Tapping
  // an order row in the table navigates away to /orders/[id] which already
  // owns the heavyweight order-detail UI (refund, reprint, reversal).
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    try {
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
      const res = await fetch(`${API_BASE}/api/v1/customers?limit=50${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.data ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [employeeToken, identity, search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  function handleSelect(c: Customer) {
    setCustomer(c.id, `${c.firstName} ${c.lastName}`);
    toast.success('Customer Selected', `${c.firstName} ${c.lastName} attached to the current order.`);
  }

  // Open the detail modal and fetch the full customer record + order history
  // in parallel. Both calls are best-effort — if either fails we still show
  // what we have so the operator isn't blocked.
  const openDetail = useCallback(async (c: Customer) => {
    setViewing(c);
    setDetail(null);
    setOrders([]);
    setDetailLoading(true);
    setOrdersLoading(true);
    const token = employeeToken ?? identity?.deviceToken ?? '';

    // Customer detail (extra fields like address + storeCreditAccount)
    fetch(`${API_BASE}/api/v1/customers/${c.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setDetail((data.data ?? null) as CustomerDetail | null);
        } else {
          setDetail(c as CustomerDetail);
        }
      })
      .catch(() => setDetail(c as CustomerDetail))
      .finally(() => setDetailLoading(false));

    // Order history — uses the existing list endpoint with customerId filter.
    // We pull a generous window (200 most-recent) so lifetime metrics are
    // representative without needing a server-side aggregation endpoint.
    fetch(`${ORDERS_API_BASE}/api/v1/orders?customerId=${c.id}&limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setOrders((data.data ?? []) as OrderRow[]);
        }
      })
      .catch(() => { /* keep empty */ })
      .finally(() => setOrdersLoading(false));
  }, [employeeToken, identity]);

  function closeDetail() {
    setViewing(null);
    setDetail(null);
    setOrders([]);
  }

  // Derived lifetime metrics. We prefer the server-side `lifetimeValue` /
  // `visitCount` if they're present (the customers service maintains these
  // off Kafka), but fall back to summing the order-history rows so the panel
  // is useful even on a fresh customer record where the rollup hasn't run.
  const metrics = useMemo(() => {
    const completed = orders.filter(
      (o) => o.status === 'completed' || o.status === 'paid' || o.status === 'partially_refunded',
    );
    const totalFromOrders = completed.reduce((s, o) => s + toNum(o.total), 0);
    const orderCount = completed.length;
    const avg = orderCount > 0 ? totalFromOrders / orderCount : 0;

    // Most-recent createdAt of any order (regardless of status).
    let lastOrderAt: string | null = null;
    for (const o of orders) {
      if (!lastOrderAt || new Date(o.createdAt).getTime() > new Date(lastOrderAt).getTime()) {
        lastOrderAt = o.createdAt;
      }
    }

    const ltv = detail?.lifetimeValue != null ? toNum(detail.lifetimeValue) : totalFromOrders;
    const visits = detail?.visitCount ?? orderCount;
    return {
      lifetimeValue: ltv,
      orderCount: visits || orderCount,
      avgOrderValue: avg,
      lastOrderAt: lastOrderAt ?? detail?.lastPurchaseAt ?? null,
    };
  }, [orders, detail]);

  function renderCustomer({ item }: { item: Customer }) {
    return (
      <TouchableOpacity style={s.card} onPress={() => handleSelect(item)} activeOpacity={0.7}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {item.firstName.charAt(0)}{item.lastName.charAt(0)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{item.firstName} {item.lastName}</Text>
          <Text style={s.sub}>
            {item.email ?? item.phone ?? 'No contact info'}
            {item.loyaltyTier ? ` · ${item.loyaltyTier}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {item.visitCount != null && (
            <Text style={s.visits}>{item.visitCount} visits</Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* View button — eye icon. stopPropagation by not bubbling: the
                outer card's onPress fires for taps on the avatar / name, the
                inner button captures taps on itself. */}
            <TouchableOpacity
              hitSlop={8}
              accessibilityLabel={`View ${item.firstName} ${item.lastName}`}
              onPress={(e) => { e.stopPropagation?.(); openDetail(item); }}
            >
              <Ionicons name="eye-outline" size={22} color="#94a3b8" />
            </TouchableOpacity>
            <Ionicons name="add-circle-outline" size={22} color="#6366f1" />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  async function handleAddCustomer() {
    if (!newFirst.trim()) { toast.warning('Required', 'First name is required.'); return; }
    setSaving(true);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    try {
      const res = await fetch(`${API_BASE}/api/v1/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ firstName: newFirst.trim(), lastName: newLast.trim() || '-', email: newEmail.trim() || undefined, phone: newPhone.trim() || undefined }),
      });
      if (res.ok) {
        setShowAdd(false);
        setNewFirst(''); setNewLast(''); setNewEmail(''); setNewPhone('');
        fetchCustomers();
        toast.success('Customer Added', `${newFirst} ${newLast} has been added.`);
      } else {
        const errBody = await res.json().catch(() => ({})) as { message?: string; detail?: string; title?: string };
        const errMsg = errBody.message ?? errBody.detail ?? errBody.title ?? `Error ${res.status}`;
        toast.error('Could Not Add Customer', errMsg);
      }
    } catch { toast.error('Error', 'Network error'); }
    finally { setSaving(false); }
  }

  // Combined address line — only shown if at least one segment is populated.
  function fullAddress(d: CustomerDetail | null): string | null {
    if (!d) return null;
    const parts = [
      d.addressLine1,
      [d.suburb, d.state, d.postcode].filter(Boolean).join(' '),
      d.country && d.country !== 'AU' ? d.country : null,
    ].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join(', ') : null;
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Customers</Text>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
          onPress={() => setShowAdd(true)}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color="#555" style={{ marginLeft: 12 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search customers..."
          placeholderTextColor="#444"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      {loading && customers.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : customers.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="people-outline" size={36} color="#444" />
          <Text style={s.emptyText}>{search ? 'No matching customers' : 'No customers yet'}</Text>
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          renderItem={renderCustomer}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          refreshing={loading}
          onRefresh={fetchCustomers}
        />
      )}
      {/* Add Customer Modal */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowAdd(false)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 360, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 16 }}>Add Customer</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TextInput style={[s.addInput, { flex: 1 }]} value={newFirst} onChangeText={setNewFirst} placeholder="First Name *" placeholderTextColor="#555" />
              <TextInput style={[s.addInput, { flex: 1 }]} value={newLast} onChangeText={setNewLast} placeholder="Last Name (optional)" placeholderTextColor="#555" />
            </View>
            <TextInput style={[s.addInput, { marginBottom: 10 }]} value={newEmail} onChangeText={setNewEmail} placeholder="Email" placeholderTextColor="#555" keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={[s.addInput, { marginBottom: 16 }]} value={newPhone} onChangeText={setNewPhone} placeholder="Phone" placeholderTextColor="#555" keyboardType="phone-pad" />
            <TouchableOpacity
              style={{ backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              onPress={handleAddCustomer}
              disabled={saving}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{saving ? 'Saving...' : 'Add Customer'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Customer Detail Modal (v2.7.44) ─────────────────────────
          View-only — surfaces contact info, lifetime metrics, loyalty,
          and order history so a barista can answer "have they been in
          before?" without diving into the dashboard. */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={closeDetail}>
        <Pressable style={s.detailBackdrop} onPress={closeDetail}>
          <Pressable style={s.detailCard} onPress={() => {}}>
            {/* Header */}
            <View style={s.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.detailName} numberOfLines={1}>
                  {viewing ? `${viewing.firstName} ${viewing.lastName}` : ''}
                </Text>
                {detail?.rfmScore && (
                  <Text style={s.detailSubtle}>RFM · {detail.rfmScore}</Text>
                )}
              </View>
              <TouchableOpacity onPress={closeDetail} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
              {/* Contact card */}
              <View style={s.detailSection}>
                <Text style={s.sectionTitle}>Contact</Text>
                <Row label="Email" value={detail?.email ?? viewing?.email ?? '—'} />
                <Row label="Phone" value={detail?.phone ?? viewing?.phone ?? '—'} />
                <Row label="Address" value={fullAddress(detail) ?? '—'} />
              </View>

              {/* Lifetime metrics */}
              <View style={s.detailSection}>
                <Text style={s.sectionTitle}>Lifetime</Text>
                <View style={s.metricsGrid}>
                  <Metric label="Total spent" value={money(metrics.lifetimeValue)} />
                  <Metric label="Orders" value={String(metrics.orderCount)} />
                  <Metric label="Avg. order" value={money(metrics.avgOrderValue)} />
                  <Metric
                    label="Last order"
                    value={
                      metrics.lastOrderAt
                        ? new Date(metrics.lastOrderAt).toLocaleDateString('en-AU', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })
                        : '—'
                    }
                  />
                </View>
              </View>

              {/* Loyalty / store credit — only render when present so the
                  panel doesn't show an empty section on plain customers. */}
              {(viewing?.loyaltyTier || (detail?.storeCreditAccount?.balance != null && toNum(detail.storeCreditAccount.balance) > 0)) && (
                <View style={s.detailSection}>
                  <Text style={s.sectionTitle}>Loyalty</Text>
                  {viewing?.loyaltyTier && (
                    <Row label="Tier" value={viewing.loyaltyTier} />
                  )}
                  {detail?.storeCreditAccount?.balance != null && (
                    <Row
                      label="Store credit"
                      value={money(detail.storeCreditAccount.balance)}
                    />
                  )}
                </View>
              )}

              {/* Order history table */}
              <View style={s.detailSection}>
                <View style={s.notesHeader}>
                  <Text style={s.sectionTitle}>Order history</Text>
                  {ordersLoading && <ActivityIndicator size="small" color="#94a3b8" />}
                </View>

                {!ordersLoading && orders.length === 0 ? (
                  <Text style={s.detailSubtle}>No orders yet.</Text>
                ) : (
                  <View>
                    {/* Column header */}
                    <View style={s.orderHeaderRow}>
                      <Text style={[s.orderHeaderCell, { flex: 1.4 }]}>Order #</Text>
                      <Text style={[s.orderHeaderCell, { flex: 1.4 }]}>Date</Text>
                      <Text style={[s.orderHeaderCell, { flex: 1.2 }]}>Status</Text>
                      <Text style={[s.orderHeaderCell, { flex: 1, textAlign: 'right' }]}>Total</Text>
                    </View>
                    {orders.map((o) => (
                      <TouchableOpacity
                        key={o.id}
                        style={s.orderRow}
                        activeOpacity={0.85}
                        onPress={() => {
                          // Close the modal and open the dedicated order
                          // detail page (refund, reprint, reversal etc).
                          closeDetail();
                          router.push(`/(pos)/orders/${o.id}` as never);
                        }}
                      >
                        <Text style={[s.orderCell, { flex: 1.4 }]}>#{o.orderNumber}</Text>
                        <Text style={[s.orderCell, { flex: 1.4 }]}>
                          {new Date(o.createdAt).toLocaleDateString('en-AU', {
                            day: '2-digit', month: 'short',
                          })}
                        </Text>
                        <View style={{ flex: 1.2 }}>
                          <View
                            style={[
                              s.statusBadge,
                              {
                                backgroundColor: `${statusColour(o.status)}20`,
                                borderColor: `${statusColour(o.status)}40`,
                              },
                            ]}
                          >
                            <Text style={[s.statusText, { color: statusColour(o.status) }]}>
                              {o.status}
                            </Text>
                          </View>
                        </View>
                        <Text style={[s.orderCell, { flex: 1, textAlign: 'right', fontWeight: '700', color: '#fff' }]}>
                          {money(o.total)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {detailLoading && !detail && (
                <View style={{ padding: 12, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#6366f1" />
                </View>
              )}
            </ScrollView>

            {/* Footer actions */}
            <View style={s.detailFooter}>
              <TouchableOpacity
                style={[s.footerBtn, { backgroundColor: '#141425', borderColor: '#2a2a3a' }]}
                onPress={closeDetail}
              >
                <Text style={[s.footerBtnText, { color: '#94a3b8' }]}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.footerBtn, { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                onPress={() => {
                  if (viewing) {
                    handleSelect(viewing);
                    closeDetail();
                  }
                }}
              >
                <Ionicons name="cart-outline" size={14} color="#fff" />
                <Text style={[s.footerBtnText, { color: '#fff' }]}>Attach to sale</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kvKey}>{label}</Text>
      <Text style={s.kvVal} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metricCell}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  title: { fontSize: 20, fontWeight: '900', color: '#fff' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141425', marginHorizontal: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: '#2a2a3a', height: 40 },
  searchInput: { flex: 1, color: '#ccc', fontSize: 14, paddingHorizontal: 10, height: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: '#555', fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141425', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a3a', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366f120', borderWidth: 1, borderColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#6366f1', fontWeight: '800', fontSize: 14 },
  name: { fontSize: 15, fontWeight: '700', color: '#fff' },
  sub: { fontSize: 12, color: '#888', marginTop: 2 },
  visits: { fontSize: 11, color: '#666', marginBottom: 4 },
  addInput: { backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a' },

  // ── Detail modal ──────────────────────────────────
  detailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
    gap: 10,
  },
  detailName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  detailSubtle: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

  detailSection: {
    backgroundColor: '#141425',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },

  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  kvKey: { color: '#94a3b8', fontSize: 12, flex: 1 },
  kvVal: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 2, textAlign: 'right' },

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metricCell: {
    width: '50%',
    paddingVertical: 6,
  },
  metricValue: { color: '#fff', fontSize: 16, fontWeight: '800' },
  metricLabel: { color: '#94a3b8', fontSize: 11, marginTop: 2 },

  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  // Order history table
  orderHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
    marginBottom: 4,
  },
  orderHeaderCell: {
    color: '#666',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  orderCell: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

  detailFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    backgroundColor: '#1a1a2e',
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  footerBtnText: { fontSize: 13, fontWeight: '700' },
});
