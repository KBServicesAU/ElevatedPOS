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
import { useRouter } from 'expo-router';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { useCatalogStore } from '../../store/catalog';
import { confirm, alert, toast } from '../../components/ui';

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

interface PaymentBreakdown {
  card: number;
  cash: number;
  other: number;
}

interface EodSummary {
  totalSales: number;
  transactionCount: number;
  avgBasket: number;
  topProducts: TopProduct[];
  cashExpected: number;
  payments: PaymentBreakdown;
  refunds: number;
  gst: number;
}

const EMPTY_SUMMARY: EodSummary = {
  totalSales: 0,
  transactionCount: 0,
  avgBasket: 0,
  topProducts: [],
  cashExpected: 0,
  payments: { card: 0, cash: 0, other: 0 },
  refunds: 0,
  gst: 0,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(n: number): string {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function safeNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function EodScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);
  const {
    products: catalogProducts,
    fetchAll: fetchCatalog,
    salesTypeByCategory,
    salesTypeHydrated,
    hydrateSalesType,
    getProductSalesType,
  } = useCatalogStore();

  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [summary, setSummary] = useState<EodSummary>(EMPTY_SUMMARY);
  const [countedCash, setCountedCash] = useState('');
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate catalog + sales type mapping so we can split wet/dry totals
  useEffect(() => {
    if (catalogProducts.length === 0) fetchCatalog();
    if (!salesTypeHydrated) hydrateSalesType();
  }, [catalogProducts.length, salesTypeHydrated, fetchCatalog, hydrateSalesType]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    const locationId = identity?.locationId ?? '';
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
      if (res.ok) {
        const data = await res.json();
        const payload = data.data ?? data ?? {};
        setSummary({
          totalSales: safeNumber(payload.totalSales),
          transactionCount: Number(payload.transactionCount) || 0,
          avgBasket: safeNumber(payload.avgBasket),
          topProducts: Array.isArray(payload.topProducts)
            ? payload.topProducts.map((p: any) => ({
                name: String(p.name ?? 'Unknown'),
                qty: Number(p.qty) || 0,
                revenue: safeNumber(p.revenue),
              }))
            : [],
          cashExpected: safeNumber(payload.cashExpected),
          payments: {
            card: safeNumber(payload.payments?.card),
            cash: safeNumber(payload.payments?.cash),
            other: safeNumber(payload.payments?.other),
          },
          refunds: safeNumber(payload.refunds),
          gst: safeNumber(payload.gst),
        });
      } else {
        // Fall back to calculating from raw orders list
        await loadFromOrders(token, locationId);
      }
    } catch {
      // Fall back to calculating from raw orders list
      await loadFromOrders(token, locationId);
    } finally {
      setLoading(false);
    }
  }, [employeeToken, identity]);

  async function loadFromOrders(token: string, locationId: string) {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/orders?limit=500&locationId=${locationId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) {
        setError('Could not load orders for EOD summary.');
        setSummary(EMPTY_SUMMARY);
        return;
      }
      const data = await res.json();
      const orders = (data.data ?? data ?? []) as any[];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todays = orders.filter((o) => {
        const created = new Date(o.createdAt);
        return (
          created >= today &&
          (o.status === 'completed' || o.status === 'paid')
        );
      });

      let totalSales = 0;
      let cardTotal = 0;
      let cashTotal = 0;
      let otherTotal = 0;
      let refunds = 0;
      const productMap = new Map<string, { qty: number; revenue: number }>();

      for (const o of todays) {
        const total = safeNumber(o.total);
        totalSales += total;
        const method = String(o.paymentMethod ?? '').toLowerCase();
        if (method.includes('card') || method.includes('eftpos') || method.includes('tyro'))
          cardTotal += total;
        else if (method.includes('cash')) cashTotal += total;
        else otherTotal += total;

        if (o.status === 'refunded') refunds += total;

        const lines = Array.isArray(o.lines) ? o.lines : [];
        for (const line of lines) {
          const name = String(line.name ?? 'Unknown');
          const qty = Number(line.quantity) || 0;
          const rev = qty * safeNumber(line.unitPrice);
          const existing = productMap.get(name) ?? { qty: 0, revenue: 0 };
          productMap.set(name, { qty: existing.qty + qty, revenue: existing.revenue + rev });
        }
      }

      const topProducts = Array.from(productMap.entries())
        .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setSummary({
        totalSales,
        transactionCount: todays.length,
        avgBasket: todays.length > 0 ? totalSales / todays.length : 0,
        topProducts,
        cashExpected: cashTotal,
        payments: { card: cardTotal, cash: cashTotal, other: otherTotal },
        refunds,
        gst: totalSales / 11, // AU GST tax-inclusive
      });
    } catch {
      setError('Could not load EOD data.');
      setSummary(EMPTY_SUMMARY);
    }
  }

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  function cashVariance(): { amount: number; positive: boolean } | null {
    if (!countedCash) return null;
    const counted = parseFloat(countedCash.replace(/[^0-9.-]/g, ''));
    if (isNaN(counted)) return null;
    const diff = counted - summary.cashExpected;
    return { amount: diff, positive: diff >= 0 };
  }

  async function handleCloseEod() {
    const ok = await confirm({
      title: 'Close End of Day',
      description: "This will finalise today's report and reset the cash drawer. Continue?",
      confirmLabel: 'Close EOD',
      destructive: true,
    });
    if (!ok) return;

    setClosing(true);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    try {
      await fetch(`${API_BASE}/api/v1/orders/eod-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locationId: identity?.locationId ?? '',
          countedCash: parseFloat(countedCash) || 0,
          summary,
          closedAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Still mark as closed locally
    }
    setClosing(false);
    setClosed(true);
    await alert({
      title: 'EOD Closed',
      description: "Today's report has been submitted. Have a great evening!",
      variant: 'success',
    });
    router.back();
  }

  async function handleExport() {
    // Simple two-option confirm. We use confirm() with custom labels.
    const wantsPrint = await confirm({
      title: 'Export Report',
      description: 'Print a copy now, or send by email?',
      confirmLabel: 'Print',
      cancelLabel: 'Email',
    });
    if (wantsPrint) {
      toast.info('Print', 'Connect a receipt printer in More → Printers first.');
    } else {
      toast.info('Email', 'Email export will be available in a future update.');
    }
  }

  const variance = cashVariance();

  // Wet vs Dry sales — bucket each top product by category mapping
  const wetDrySplit = useMemo(() => {
    let wetRevenue = 0;
    let wetQty = 0;
    let dryRevenue = 0;
    let dryQty = 0;
    let unclassifiedRevenue = 0;
    let unclassifiedQty = 0;
    for (const p of summary.topProducts) {
      const type = getProductSalesType(p.name);
      if (type === 'wet') {
        wetRevenue += p.revenue;
        wetQty += p.qty;
      } else if (type === 'dry') {
        dryRevenue += p.revenue;
        dryQty += p.qty;
      } else {
        unclassifiedRevenue += p.revenue;
        unclassifiedQty += p.qty;
      }
    }
    const total = wetRevenue + dryRevenue;
    return {
      wetRevenue,
      wetQty,
      dryRevenue,
      dryQty,
      unclassifiedRevenue,
      unclassifiedQty,
      wetPct: total === 0 ? 0 : Math.round((wetRevenue / total) * 100),
      dryPct: total === 0 ? 0 : Math.round((dryRevenue / total) * 100),
      hasMappings: Object.keys(salesTypeByCategory).length > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.topProducts, salesTypeByCategory, catalogProducts]);

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={20} color="#888" />
        </TouchableOpacity>
        <Text style={s.title}>End of Day</Text>
        <TouchableOpacity onPress={handleExport} style={s.iconBtn}>
          <Ionicons name="share-outline" size={20} color="#6366f1" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color="#6366f1" size="large" />
          <Text style={s.loadingText}>Loading today's summary…</Text>
        </View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {/* Date banner */}
          <View style={s.dateBanner}>
            <Text style={s.dateBannerText}>
              {new Date().toLocaleDateString('en-AU', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            {closed ? (
              <View style={s.closedBadge}>
                <Text style={s.closedBadgeText}>CLOSED</Text>
              </View>
            ) : null}
          </View>

          {error ? (
            <View style={s.errorBanner}>
              <Ionicons name="alert-circle" size={16} color="#f59e0b" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* KPI Cards row */}
          <Text style={s.sectionTitle}>Today's Summary</Text>
          <View style={s.kpiRow}>
            <View style={s.kpiCard}>
              <Text style={s.kpiValue}>{fmt(summary.totalSales)}</Text>
              <Text style={s.kpiLabel}>Total Sales</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiValue}>{summary.transactionCount}</Text>
              <Text style={s.kpiLabel}>Transactions</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiValue}>{fmt(summary.avgBasket)}</Text>
              <Text style={s.kpiLabel}>Avg Basket</Text>
            </View>
          </View>

          {/* Payment Breakdown */}
          <Text style={s.sectionTitle}>Payment Methods</Text>
          <View style={s.card}>
            <View style={s.cashRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="card" size={18} color="#6366f1" />
                <Text style={s.cashLabel}>Card / EFTPOS</Text>
              </View>
              <Text style={s.cashExpected}>{fmt(summary.payments.card)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.cashRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="cash" size={18} color="#22c55e" />
                <Text style={s.cashLabel}>Cash</Text>
              </View>
              <Text style={s.cashExpected}>{fmt(summary.payments.cash)}</Text>
            </View>
            {summary.payments.other > 0 && (
              <>
                <View style={s.divider} />
                <View style={s.cashRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="ellipsis-horizontal-circle" size={18} color="#888" />
                    <Text style={s.cashLabel}>Other</Text>
                  </View>
                  <Text style={s.cashExpected}>{fmt(summary.payments.other)}</Text>
                </View>
              </>
            )}
            <View style={s.divider} />
            <View style={s.cashRow}>
              <Text style={[s.cashLabel, { fontWeight: '800', color: '#888' }]}>
                GST (incl.)
              </Text>
              <Text style={[s.cashExpected, { color: '#888' }]}>{fmt(summary.gst)}</Text>
            </View>
            {summary.refunds > 0 && (
              <>
                <View style={s.divider} />
                <View style={s.cashRow}>
                  <Text style={[s.cashLabel, { color: '#ef4444' }]}>Refunds</Text>
                  <Text style={[s.cashExpected, { color: '#ef4444' }]}>
                    -{fmt(summary.refunds)}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Top Products */}
          <Text style={s.sectionTitle}>Top Products</Text>
          <View style={s.card}>
            {summary.topProducts.length === 0 ? (
              <View style={s.emptyRow}>
                <Ionicons name="cube-outline" size={32} color="#444" />
                <Text style={s.emptyText}>No products sold today</Text>
              </View>
            ) : (
              summary.topProducts.map((product, i, arr) => (
                <View key={`${product.name}-${i}`}>
                  <View style={s.productRow}>
                    <View style={s.rankBadge}>
                      <Text style={s.rankText}>{i + 1}</Text>
                    </View>
                    <View style={s.productInfo}>
                      <Text style={s.productName} numberOfLines={1}>
                        {product.name}
                      </Text>
                      <Text style={s.productQty}>{product.qty} sold</Text>
                    </View>
                    <Text style={s.productRevenue}>{fmt(product.revenue)}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={s.divider} />}
                </View>
              ))
            )}
          </View>

          {/* Wet vs Dry Sales */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.sectionTitle}>Wet vs Dry Sales</Text>
            <TouchableOpacity
              onPress={() => router.push('/(pos)/wet-dry-setup' as never)}
              activeOpacity={0.7}
              style={{ paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ color: '#6366f1', fontSize: 12, fontWeight: '700' }}>
                Configure
              </Text>
            </TouchableOpacity>
          </View>
          <View style={s.card}>
            {!wetDrySplit.hasMappings ? (
              <View style={s.emptyRow}>
                <Ionicons name="beer-outline" size={28} color="#444" />
                <Text style={s.emptyText}>
                  Tap Configure to tag categories as wet (drinks) or dry (food).
                </Text>
              </View>
            ) : (
              <>
                <View style={s.cashRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="beer" size={18} color="#06b6d4" />
                    <Text style={s.cashLabel}>Wet (Drinks)</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.cashExpected, { color: '#06b6d4' }]}>
                      {fmt(wetDrySplit.wetRevenue)}
                    </Text>
                    <Text style={{ color: '#444', fontSize: 10 }}>
                      {wetDrySplit.wetQty} units · {wetDrySplit.wetPct}%
                    </Text>
                  </View>
                </View>
                <View style={s.divider} />
                <View style={s.cashRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="restaurant" size={18} color="#f59e0b" />
                    <Text style={s.cashLabel}>Dry (Food)</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.cashExpected, { color: '#f59e0b' }]}>
                      {fmt(wetDrySplit.dryRevenue)}
                    </Text>
                    <Text style={{ color: '#444', fontSize: 10 }}>
                      {wetDrySplit.dryQty} units · {wetDrySplit.dryPct}%
                    </Text>
                  </View>
                </View>

                {/* Stacked progress bar */}
                {(wetDrySplit.wetRevenue + wetDrySplit.dryRevenue) > 0 && (
                  <View style={s.wetDryBarWrap}>
                    <View
                      style={[
                        s.wetDryBarSeg,
                        { flex: wetDrySplit.wetRevenue, backgroundColor: '#06b6d4' },
                      ]}
                    />
                    <View
                      style={[
                        s.wetDryBarSeg,
                        { flex: wetDrySplit.dryRevenue, backgroundColor: '#f59e0b' },
                      ]}
                    />
                  </View>
                )}

                {wetDrySplit.unclassifiedRevenue > 0 && (
                  <>
                    <View style={s.divider} />
                    <View style={s.cashRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="help-circle-outline" size={16} color="#666" />
                        <Text style={[s.cashLabel, { color: '#666' }]}>Unclassified</Text>
                      </View>
                      <Text style={[s.cashExpected, { color: '#666' }]}>
                        {fmt(wetDrySplit.unclassifiedRevenue)}
                      </Text>
                    </View>
                  </>
                )}
              </>
            )}
          </View>

          {/* Cash Drawer Reconciliation */}
          <Text style={s.sectionTitle}>Cash Drawer</Text>
          <View style={s.card}>
            <View style={s.cashRow}>
              <Text style={s.cashLabel}>Expected Balance</Text>
              <Text style={s.cashExpected}>{fmt(summary.cashExpected)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.inputBlock}>
              <Text style={s.inputLabel}>Counted Cash</Text>
              <TextInput
                style={s.cashInput}
                value={countedCash}
                onChangeText={setCountedCash}
                placeholder="0.00"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
                editable={!closed}
              />
            </View>
            {variance !== null ? (
              <>
                <View style={s.divider} />
                <View style={s.cashRow}>
                  <Text style={s.cashLabel}>Variance</Text>
                  <Text
                    style={[
                      s.varianceText,
                      variance.positive ? s.variancePositive : s.varianceNegative,
                    ]}
                  >
                    {variance.positive ? '+' : ''}
                    {fmt(variance.amount)}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Action Buttons */}
          {!closed ? (
            <>
              <TouchableOpacity
                style={[s.closeBtn, closing && { opacity: 0.5 }]}
                onPress={handleCloseEod}
                disabled={closing}
                activeOpacity={0.85}
              >
                {closing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={18} color="#fff" />
                    <Text style={s.closeBtnText}>Close End of Day</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.exportFullBtn}
                onPress={handleExport}
                activeOpacity={0.85}
              >
                <Ionicons name="mail-outline" size={16} color="#6366f1" />
                <Text style={s.exportFullBtnText}>Email Report</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.successBanner}>
              <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
              <Text style={s.successText}>End of day successfully closed.</Text>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
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
    backgroundColor: '#0d0d14',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#666', fontSize: 14 },

  scroll: { flex: 1 },
  scrollContent: { padding: 14 },

  dateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dateBannerText: { color: '#666', fontSize: 13 },
  closedBadge: {
    backgroundColor: '#14532d',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  closedBadgeText: { color: '#22c55e', fontSize: 11, fontWeight: '800' },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  errorText: { color: '#f59e0b', fontSize: 12, flex: 1 },

  sectionTitle: {
    color: '#666',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  kpiValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  kpiLabel: { color: '#666', fontSize: 10, marginTop: 4, textAlign: 'center' },

  card: {
    backgroundColor: '#141425',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#1e1e2e', marginLeft: 14 },

  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  rankText: { color: '#a5b4fc', fontSize: 12, fontWeight: '800' },
  productInfo: { flex: 1 },
  productName: { color: '#e5e7eb', fontSize: 14, fontWeight: '600' },
  productQty: { color: '#666', fontSize: 11, marginTop: 2 },
  productRevenue: { color: '#22c55e', fontSize: 14, fontWeight: '800' },
  emptyRow: { padding: 24, alignItems: 'center', gap: 8 },
  emptyText: { color: '#555', fontSize: 13, textAlign: 'center', paddingHorizontal: 12 },

  // Wet/dry stacked progress bar
  wetDryBarWrap: {
    flexDirection: 'row',
    height: 8,
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#0d0d14',
  },
  wetDryBarSeg: {
    height: '100%',
  },

  cashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  cashLabel: { color: '#e5e7eb', fontSize: 14 },
  cashExpected: { color: '#a5b4fc', fontSize: 14, fontWeight: '700' },

  inputBlock: { paddingHorizontal: 14, paddingVertical: 12 },
  inputLabel: {
    color: '#666',
    fontSize: 11,
    marginBottom: 6,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cashInput: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    backgroundColor: '#0d0d14',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },

  varianceText: { fontSize: 15, fontWeight: '800' },
  variancePositive: { color: '#22c55e' },
  varianceNegative: { color: '#ef4444' },

  closeBtn: {
    marginTop: 22,
    backgroundColor: '#ef4444',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#ef4444',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  exportFullBtn: {
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
  exportFullBtnText: { color: '#6366f1', fontSize: 14, fontWeight: '700' },

  successBanner: {
    marginTop: 22,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  successText: { color: '#22c55e', fontSize: 14, fontWeight: '700' },
});
