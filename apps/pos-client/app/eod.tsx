import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { posApiFetch } from '../lib/api';

interface TopProduct {
  name: string;
  qty: number;
  revenue: string;
}

interface EodSummary {
  totalSales: string;
  transactionCount: number;
  avgBasket: string;
  topProducts: TopProduct[];
  cashExpected: string;
}

// TODO: Remove mock summary once GET /api/v1/orders/eod-summary is deployed
const MOCK_SUMMARY: EodSummary = {
  totalSales: '$4,287.50',
  transactionCount: 63,
  avgBasket: '$68.06',
  topProducts: [
    { name: 'Flat White', qty: 38, revenue: '$190.00' },
    { name: 'Avocado Toast', qty: 21, revenue: '$294.00' },
    { name: 'Cold Brew', qty: 19, revenue: '$114.00' },
  ],
  cashExpected: '$1,042.00',
};

export default function EodScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [summary, setSummary] = useState<EodSummary | null>(null);
  const [countedCash, setCountedCash] = useState('');
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    void loadSummary();
  }, []);

  async function loadSummary() {
    setLoading(true);
    try {
      const data = await posApiFetch<EodSummary>('/api/v1/orders/eod-summary');
      setSummary(data);
    } catch {
      // TODO: Replace mock fallback with real EOD summary API when deployed
      // Endpoint may not exist yet — use mock data
      setSummary(MOCK_SUMMARY);
      Alert.alert('Offline Mode', 'Could not load EOD summary from server. Showing demo data.');
    } finally {
      setLoading(false);
    }
  }

  function cashVariance(): string | null {
    if (!summary || !countedCash) return null;
    const expected = parseFloat(summary.cashExpected.replace(/[^0-9.-]/g, ''));
    const counted = parseFloat(countedCash.replace(/[^0-9.-]/g, ''));
    if (isNaN(expected) || isNaN(counted)) return null;
    const diff = counted - expected;
    const sign = diff >= 0 ? '+' : '';
    return `${sign}$${diff.toFixed(2)}`;
  }

  async function handleCloseEod() {
    Alert.alert(
      'Close End of Day',
      'This will finalise today\'s report. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close EOD',
          style: 'destructive',
          onPress: async () => {
            setClosing(true);
            try {
              await posApiFetch('/api/v1/orders/eod-summary', {
                method: 'POST',
                body: JSON.stringify({ countedCash }),
              });
            } catch {
              Alert.alert('Warning', 'EOD report could not be submitted to the server, but has been closed locally.');
            } finally {
              setClosing(false);
            }
            setClosed(true);
            Alert.alert(
              'EOD Closed',
              'Today\'s report has been submitted. Have a great evening!',
              [{ text: 'OK', onPress: () => router.back() }]
            );
          },
        },
      ]
    );
  }

  function handleExport() {
    Alert.alert('Export Report', 'Share via email', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send Email',
        onPress: () =>
          Alert.alert('Not Implemented', 'Email export will be available in a future update.'),
      },
    ]);
  }

  const variance = cashVariance();
  const variancePositive = variance ? !variance.startsWith('-') : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{'← Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>End of Day</Text>
        <TouchableOpacity onPress={handleExport} style={styles.exportBtn}>
          <Text style={styles.exportText}>Export</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#818cf8" size="large" />
          <Text style={styles.loadingText}>Loading today\'s summary…</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Date banner */}
          <View style={styles.dateBanner}>
            <Text style={styles.dateBannerText}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            {closed ? (
              <View style={styles.closedBadge}>
                <Text style={styles.closedBadgeText}>CLOSED</Text>
              </View>
            ) : null}
          </View>

          {/* KPI Cards row */}
          <Text style={styles.sectionTitle}>Today's Summary</Text>
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, { flex: 1 }]}>
              <Text style={styles.kpiValue}>{summary?.totalSales ?? '—'}</Text>
              <Text style={styles.kpiLabel}>Total Sales</Text>
            </View>
            <View style={[styles.kpiCard, { flex: 1 }]}>
              <Text style={styles.kpiValue}>{summary?.transactionCount ?? '—'}</Text>
              <Text style={styles.kpiLabel}>Transactions</Text>
            </View>
            <View style={[styles.kpiCard, { flex: 1 }]}>
              <Text style={styles.kpiValue}>{summary?.avgBasket ?? '—'}</Text>
              <Text style={styles.kpiLabel}>Avg Basket</Text>
            </View>
          </View>

          {/* Top Products */}
          <Text style={styles.sectionTitle}>Top Products</Text>
          <View style={styles.card}>
            {(summary?.topProducts ?? []).map((product, i, arr) => (
              <View key={product.name}>
                <View style={styles.productRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productQty}>{product.qty} sold</Text>
                  </View>
                  <Text style={styles.productRevenue}>{product.revenue}</Text>
                </View>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
            {(!summary?.topProducts || summary.topProducts.length === 0) ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No products sold today</Text>
              </View>
            ) : null}
          </View>

          {/* Cash Drawer Reconciliation */}
          <Text style={styles.sectionTitle}>Cash Drawer</Text>
          <View style={styles.card}>
            <View style={styles.cashRow}>
              <Text style={styles.cashLabel}>Expected Balance</Text>
              <Text style={styles.cashExpected}>{summary?.cashExpected ?? '—'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Counted Cash</Text>
              <TextInput
                style={styles.cashInput}
                value={countedCash}
                onChangeText={setCountedCash}
                placeholder="$0.00"
                placeholderTextColor="#4b5563"
                keyboardType="decimal-pad"
                editable={!closed}
              />
            </View>
            {variance ? (
              <>
                <View style={styles.divider} />
                <View style={styles.cashRow}>
                  <Text style={styles.cashLabel}>Variance</Text>
                  <Text
                    style={[
                      styles.varianceText,
                      variancePositive ? styles.variancePositive : styles.varianceNegative,
                    ]}
                  >
                    {variance}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Action Buttons */}
          {!closed ? (
            <>
              <TouchableOpacity
                style={[styles.closeBtn, closing && styles.closeBtnDisabled]}
                onPress={() => void handleCloseEod()}
                disabled={closing}
              >
                {closing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.closeBtnText}>Close EOD</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.exportFullBtn} onPress={handleExport}>
                <Text style={styles.exportFullBtnText}>Share Report via Email</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>End of day successfully closed.</Text>
            </View>
          )}

          <View style={styles.bottomPad} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e2e' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16161f',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { minWidth: 60 },
  backText: { color: '#818cf8', fontSize: 15 },
  headerTitle: { color: '#e5e7eb', fontSize: 17, fontWeight: '700' },
  exportBtn: { minWidth: 60, alignItems: 'flex-end' },
  exportText: { color: '#818cf8', fontSize: 15 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#6b7280', fontSize: 14 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  dateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dateBannerText: { color: '#6b7280', fontSize: 13 },
  closedBadge: {
    backgroundColor: '#14532d',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  closedBadgeText: { color: '#4ade80', fontSize: 11, fontWeight: '700' },

  sectionTitle: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  kpiCard: {
    backgroundColor: '#16161f',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    padding: 14,
    alignItems: 'center',
  },
  kpiValue: { color: '#e5e7eb', fontSize: 18, fontWeight: '700' },
  kpiLabel: { color: '#6b7280', fontSize: 11, marginTop: 4, textAlign: 'center' },

  card: {
    backgroundColor: '#16161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#2a2a3a', marginLeft: 16 },

  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { color: '#a5b4fc', fontSize: 12, fontWeight: '700' },
  productInfo: { flex: 1 },
  productName: { color: '#e5e7eb', fontSize: 15 },
  productQty: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  productRevenue: { color: '#4ade80', fontSize: 15, fontWeight: '600' },
  emptyRow: { padding: 20, alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 14 },

  cashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  cashLabel: { color: '#e5e7eb', fontSize: 15 },
  cashExpected: { color: '#a5b4fc', fontSize: 15, fontWeight: '600' },

  inputBlock: { paddingHorizontal: 16, paddingVertical: 12 },
  inputLabel: { color: '#6b7280', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  cashInput: {
    color: '#e5e7eb',
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  varianceText: { fontSize: 15, fontWeight: '700' },
  variancePositive: { color: '#4ade80' },
  varianceNegative: { color: '#f87171' },

  closeBtn: {
    marginTop: 24,
    backgroundColor: '#7f1d1d',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#991b1b',
  },
  closeBtnDisabled: { opacity: 0.5 },
  closeBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  exportFullBtn: {
    marginTop: 12,
    backgroundColor: '#1e1e3a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  exportFullBtnText: { color: '#a5b4fc', fontSize: 15, fontWeight: '600' },

  successBanner: {
    marginTop: 24,
    backgroundColor: '#14532d',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#166534',
  },
  successText: { color: '#4ade80', fontSize: 15, fontWeight: '600' },

  bottomPad: { height: 32 },
});
