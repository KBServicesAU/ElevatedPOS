import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  ScrollView,
  TextInput,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCartStore } from '../store/cart';
import { posApiFetch } from '../lib/api';
import ReceiptModal from '../components/ReceiptModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'card' | 'gift_card' | 'bnpl';

export interface Tender {
  id: string;
  method: PaymentMethod;
  amount: number;
  /** Cash only */
  cashTendered?: number;
  change?: number;
  /** Gift card only */
  giftCardCode?: string;
  giftCardBalance?: number;
  /** BNPL only */
  bnplProvider?: 'afterpay' | 'zip';
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  modifiers?: Array<{ name: string; price: number }>;
}

export interface CompletedOrder {
  orderNumber: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  tenders: Tender[];
  change: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METHOD_META: Record<
  PaymentMethod,
  { label: string; emoji: string; color: string; hint: string }
> = {
  cash: {
    label: 'Cash',
    emoji: '💵',
    color: '#4ade80',
    hint: 'Enter amount tendered by customer',
  },
  card: {
    label: 'Card / EFTPOS',
    emoji: '💳',
    color: '#60a5fa',
    hint: 'Tap or insert card on terminal',
  },
  gift_card: {
    label: 'Gift Card',
    emoji: '🎁',
    color: '#f59e0b',
    hint: 'Enter the gift card code to check balance',
  },
  bnpl: {
    label: 'Buy Now Pay Later',
    emoji: '📱',
    color: '#a78bfa',
    hint: 'Customer pays via Afterpay or Zip',
  },
};

// ─── Add Tender Modal ─────────────────────────────────────────────────────────

interface AddTenderModalProps {
  visible: boolean;
  remaining: number;
  onClose: () => void;
  onAdd: (tender: Tender) => void;
}

function AddTenderModal({ visible, remaining, onClose, onAdd }: AddTenderModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountStr, setAmountStr] = useState('');
  const [cashTenderedStr, setCashTenderedStr] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [giftBalance, setGiftBalance] = useState<number | null>(null);
  const [giftChecking, setGiftChecking] = useState(false);
  const [bnplProvider, setBnplProvider] = useState<'afterpay' | 'zip'>('afterpay');
  const [cardProcessing, setCardProcessing] = useState(false);

  const amount = amountStr === '' ? remaining : Math.min(Number(amountStr) || 0, remaining);
  const cashTendered = Number(cashTenderedStr) || 0;
  const change = method === 'cash' ? Math.max(0, cashTendered - amount) : 0;

  const resetForm = useCallback(() => {
    setMethod('cash');
    setAmountStr('');
    setCashTenderedStr('');
    setGiftCode('');
    setGiftBalance(null);
    setGiftChecking(false);
    setBnplProvider('afterpay');
    setCardProcessing(false);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const canApply = (() => {
    if (amount <= 0) return false;
    if (method === 'cash') return cashTendered >= amount;
    if (method === 'gift_card') return giftBalance !== null && giftBalance > 0;
    return true;
  })();

  const handleCheckGiftCard = async () => {
    if (!giftCode.trim()) return;
    setGiftChecking(true);
    setGiftBalance(null);
    try {
      const res = await posApiFetch<{ balance: number }>(
        `/api/v1/gift-cards/${encodeURIComponent(giftCode.trim())}`,
      );
      setGiftBalance(res.balance / 100);
    } catch {
      Alert.alert('Invalid Gift Card', 'This gift card code is invalid or has no balance.');
      setGiftBalance(0);
    } finally {
      setGiftChecking(false);
    }
  };

  const handleApply = async () => {
    if (method === 'card') {
      setCardProcessing(true);
      await new Promise((r) => setTimeout(r, 2000));
      setCardProcessing(false);
    }

    const effectiveAmount =
      method === 'gift_card' && giftBalance !== null
        ? Math.min(amount, giftBalance)
        : amount;

    const tender: Tender = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      amount: effectiveAmount,
      ...(method === 'cash' ? { cashTendered, change } : {}),
      ...(method === 'gift_card'
        ? { giftCardCode: giftCode.trim(), giftCardBalance: giftBalance ?? 0 }
        : {}),
      ...(method === 'bnpl' ? { bnplProvider } : {}),
    };

    onAdd(tender);
    resetForm();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>Add Payment</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={ms.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Method selector */}
            <Text style={ms.label}>Payment Method</Text>
            <View style={ms.methodGrid}>
              {(Object.keys(METHOD_META) as PaymentMethod[]).map((m) => {
                const meta = METHOD_META[m];
                const selected = method === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[
                      ms.methodBtn,
                      selected && { borderColor: meta.color, backgroundColor: `${meta.color}22` },
                    ]}
                    onPress={() => {
                      setMethod(m);
                      setGiftBalance(null);
                      setGiftCode('');
                      setCardProcessing(false);
                    }}
                  >
                    <Text style={ms.methodEmoji}>{meta.emoji}</Text>
                    <Text style={[ms.methodLabel, selected && { color: meta.color }]}>
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Hint */}
            <View style={ms.hintBox}>
              <Text style={ms.hintText}>{METHOD_META[method].hint}</Text>
            </View>

            {/* Amount */}
            <Text style={ms.label}>Amount</Text>
            <TextInput
              style={ms.input}
              keyboardType="decimal-pad"
              placeholder={`$${remaining.toFixed(2)} (remaining)`}
              placeholderTextColor="#4b5563"
              value={amountStr}
              onChangeText={setAmountStr}
            />

            {/* Cash-specific */}
            {method === 'cash' && (
              <>
                <Text style={ms.label}>Cash Tendered</Text>
                <TextInput
                  style={ms.input}
                  keyboardType="decimal-pad"
                  placeholder={`$${amount.toFixed(2)}`}
                  placeholderTextColor="#4b5563"
                  value={cashTenderedStr}
                  onChangeText={setCashTenderedStr}
                />
                {cashTendered >= amount && amount > 0 && (
                  <View style={ms.changeRow}>
                    <Text style={ms.changeLabel}>Change Due</Text>
                    <Text style={ms.changeValue}>${change.toFixed(2)}</Text>
                  </View>
                )}
              </>
            )}

            {/* Gift card */}
            {method === 'gift_card' && (
              <>
                <Text style={ms.label}>Gift Card Code</Text>
                <View style={ms.giftRow}>
                  <TextInput
                    style={[ms.input, ms.giftInput]}
                    placeholder="Enter gift card code"
                    placeholderTextColor="#4b5563"
                    value={giftCode}
                    onChangeText={(t) => {
                      setGiftCode(t);
                      setGiftBalance(null);
                    }}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[ms.giftCheckBtn, giftChecking && { opacity: 0.5 }]}
                    onPress={handleCheckGiftCard}
                    disabled={giftChecking || !giftCode.trim()}
                  >
                    {giftChecking ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={ms.giftCheckText}>Check</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {giftBalance !== null && giftBalance > 0 && (
                  <View style={ms.balanceBadge}>
                    <Text style={ms.balanceBadgeText}>
                      Balance: ${giftBalance.toFixed(2)}
                      {amount > giftBalance
                        ? ` — will apply $${giftBalance.toFixed(2)}`
                        : ''}
                    </Text>
                  </View>
                )}
                {giftBalance === 0 && (
                  <Text style={ms.errorText}>No balance available on this card.</Text>
                )}
              </>
            )}

            {/* BNPL */}
            {method === 'bnpl' && (
              <>
                <Text style={ms.label}>Provider</Text>
                <View style={ms.bnplRow}>
                  {(['afterpay', 'zip'] as const).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[ms.bnplBtn, bnplProvider === p && ms.bnplBtnActive]}
                      onPress={() => setBnplProvider(p)}
                    >
                      <Text style={[ms.bnplBtnText, bnplProvider === p && ms.bnplBtnTextActive]}>
                        {p === 'afterpay' ? 'Afterpay' : 'Zip'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Card processing overlay inside modal */}
            {cardProcessing && (
              <View style={ms.cardProcessing}>
                <ActivityIndicator size="large" color="#60a5fa" />
                <Text style={ms.cardProcessingText}>Processing on terminal…</Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[ms.applyBtn, (!canApply || cardProcessing) && ms.applyBtnDisabled]}
            onPress={handleApply}
            disabled={!canApply || cardProcessing}
          >
            <Text style={ms.applyBtnText}>
              {cardProcessing
                ? 'Processing…'
                : `Apply ${METHOD_META[method].emoji} $${
                    method === 'gift_card' && giftBalance !== null
                      ? Math.min(amount, giftBalance).toFixed(2)
                      : amount.toFixed(2)
                  }`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    items: string;
    subtotal: string;
    tax: string;
    total: string;
    customerId?: string;
  }>();

  const { clear, items: storeItems } = useCartStore();

  // Parse params — fall back to store items if not passed
  const items: CartItem[] = (() => {
    try {
      return params.items ? JSON.parse(params.items) : storeItems;
    } catch {
      return storeItems;
    }
  })();

  const subtotal = params.subtotal ? Number(params.subtotal) : items.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = params.tax ? Number(params.tax) : subtotal * 0.1;
  const total = params.total ? Number(params.total) : subtotal + tax;
  const customerId = params.customerId;

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [showAddTender, setShowAddTender] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);

  const paid = tenders.reduce((s, t) => s + t.amount, 0);
  const remaining = Math.max(0, total - paid);
  const isFullyCovered = paid >= total - 0.005;
  const totalChange = tenders.reduce((s, t) => s + (t.change ?? 0), 0);

  const handleAddTender = (tender: Tender) => {
    setTenders((prev) => [...prev, tender]);
    setShowAddTender(false);
  };

  const handleRemoveTender = (id: string) => {
    setTenders((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCompleteSale = async () => {
    if (!isFullyCovered) return;
    setSubmitting(true);
    try {
      const body = {
        items: items.map((i) => ({
          productId: i.id,
          name: i.name,
          qty: i.qty,
          unitPrice: i.price,
          modifiers: i.modifiers ?? [],
        })),
        subtotal: Math.round(subtotal * 100),
        tax: Math.round(tax * 100),
        total: Math.round(total * 100),
        tenders: tenders.map((t) => ({
          method: t.method,
          amount: Math.round(t.amount * 100),
          ...(t.giftCardCode ? { giftCardCode: t.giftCardCode } : {}),
          ...(t.bnplProvider ? { bnplProvider: t.bnplProvider } : {}),
        })),
        ...(customerId ? { customerId } : {}),
      };

      const res = await posApiFetch<{ id: string; orderNumber: string }>(
        '/api/v1/orders',
        { method: 'POST', body: JSON.stringify(body) },
      );

      clear();

      setCompletedOrder({
        orderNumber: res.orderNumber ?? `POS-${Math.floor(1000 + Math.random() * 9000)}`,
        items,
        subtotal,
        tax,
        total,
        tenders,
        change: totalChange,
      });
    } catch (err) {
      Alert.alert(
        'Payment Failed',
        err instanceof Error ? err.message : 'Could not complete sale. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewSale = () => {
    setCompletedOrder(null);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Payment</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Amount card */}
        <View style={s.amountCard}>
          <Text style={s.amountLabel}>Total Due</Text>
          <Text style={s.amountValue}>${total.toFixed(2)}</Text>
          <View style={s.breakdownRow}>
            <Text style={s.breakdownText}>Subtotal ${subtotal.toFixed(2)}</Text>
            <Text style={s.breakdownDot}>·</Text>
            <Text style={s.breakdownText}>GST ${tax.toFixed(2)}</Text>
          </View>
        </View>

        {/* Remaining balance */}
        {tenders.length > 0 && (
          <View style={s.balanceBar}>
            <View style={s.balanceItem}>
              <Text style={s.balanceLabel}>Paid</Text>
              <Text style={[s.balanceValue, { color: '#4ade80' }]}>${paid.toFixed(2)}</Text>
            </View>
            <View style={s.balanceDivider} />
            <View style={s.balanceItem}>
              <Text style={s.balanceLabel}>Remaining</Text>
              <Text style={[s.balanceValue, { color: remaining > 0 ? '#fbbf24' : '#4ade80' }]}>
                ${remaining.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Applied tenders */}
        {tenders.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Tenders Applied</Text>
            {tenders.map((t) => {
              const meta = METHOD_META[t.method];
              return (
                <View key={t.id} style={s.tenderRow}>
                  <View style={[s.tenderBadge, { backgroundColor: `${meta.color}22` }]}>
                    <Text style={[s.tenderBadgeText, { color: meta.color }]}>
                      {meta.emoji} {meta.label}
                    </Text>
                  </View>
                  <View style={s.tenderAmountCol}>
                    <Text style={s.tenderAmount}>${t.amount.toFixed(2)}</Text>
                    {t.method === 'cash' && t.change !== undefined && t.change > 0 && (
                      <Text style={s.tenderChange}>Change: ${t.change.toFixed(2)}</Text>
                    )}
                    {t.giftCardCode && (
                      <Text style={s.tenderMeta}>···{t.giftCardCode.slice(-4)}</Text>
                    )}
                    {t.bnplProvider && (
                      <Text style={s.tenderMeta}>
                        {t.bnplProvider === 'afterpay' ? 'Afterpay' : 'Zip'}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveTender(t.id)}
                    style={s.tenderRemove}
                  >
                    <Text style={s.tenderRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Items summary */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Order Summary</Text>
          {items.map((item, idx) => (
            <View key={`${item.id}-${idx}`} style={s.itemRow}>
              <Text style={s.itemQty}>{item.qty}×</Text>
              <Text style={s.itemName}>{item.name}</Text>
              <Text style={s.itemPrice}>${(item.price * item.qty).toFixed(2)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Footer actions */}
      <View style={s.footer}>
        {!isFullyCovered && (
          <TouchableOpacity
            style={s.addTenderBtn}
            onPress={() => setShowAddTender(true)}
          >
            <Text style={s.addTenderBtnText}>
              ＋ Add Tender {remaining > 0 ? `($${remaining.toFixed(2)} remaining)` : ''}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[s.completeBtn, (!isFullyCovered || submitting) && s.completeBtnDisabled]}
          onPress={handleCompleteSale}
          disabled={!isFullyCovered || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.completeBtnText}>
              {isFullyCovered ? 'Complete Sale' : `Complete Sale ($${remaining.toFixed(2)} remaining)`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Add Tender modal */}
      <AddTenderModal
        visible={showAddTender}
        remaining={remaining}
        onClose={() => setShowAddTender(false)}
        onAdd={handleAddTender}
      />

      {/* Receipt modal */}
      {completedOrder && (
        <ReceiptModal order={completedOrder} onNewSale={handleNewSale} />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  backBtn: { width: 60 },
  backBtnText: { color: '#60a5fa', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  amountCard: {
    margin: 16,
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  amountLabel: { fontSize: 13, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  amountValue: { fontSize: 52, fontWeight: '800', color: '#f1f5f9' },
  breakdownRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  breakdownText: { fontSize: 13, color: '#64748b' },
  breakdownDot: { color: '#334155', fontSize: 16 },
  balanceBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  balanceItem: { flex: 1, alignItems: 'center' },
  balanceDivider: { width: 1, backgroundColor: '#0f3460', marginVertical: 2 },
  balanceLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  balanceValue: { fontSize: 20, fontWeight: '700', color: '#f1f5f9' },
  section: { marginHorizontal: 16, marginTop: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  tenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  tenderBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tenderBadgeText: { fontSize: 12, fontWeight: '600' },
  tenderAmountCol: { flex: 1, alignItems: 'flex-end' },
  tenderAmount: { fontSize: 16, fontWeight: '700', color: '#f1f5f9' },
  tenderChange: { fontSize: 11, color: '#4ade80', marginTop: 2 },
  tenderMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  tenderRemove: { padding: 6 },
  tenderRemoveText: { color: '#f87171', fontSize: 16 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
    gap: 8,
  },
  itemQty: { fontSize: 13, color: '#64748b', width: 30 },
  itemName: { flex: 1, fontSize: 13, color: '#e2e8f0' },
  itemPrice: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    gap: 10,
  },
  addTenderBtn: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e40af',
  },
  addTenderBtnText: { color: '#93c5fd', fontSize: 15, fontWeight: '600' },
  completeBtn: {
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  completeBtnDisabled: { backgroundColor: '#166534', opacity: 0.5 },
  completeBtnText: { fontSize: 17, fontWeight: '800', color: '#052e16' },
});

// ─── Add Tender Modal Styles ──────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#f1f5f9' },
  sheetClose: { fontSize: 18, color: '#94a3b8', paddingHorizontal: 4 },
  label: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  methodBtn: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#16213e',
    backgroundColor: '#16213e',
  },
  methodEmoji: { fontSize: 24 },
  methodLabel: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#64748b', textAlign: 'center' },
  hintBox: { backgroundColor: '#0f3460', borderRadius: 10, padding: 12, marginBottom: 14 },
  hintText: { fontSize: 13, color: '#93c5fd', textAlign: 'center' },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#0f3460',
    marginBottom: 12,
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#052e1644',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#166534',
  },
  changeLabel: { fontSize: 14, color: '#86efac' },
  changeValue: { fontSize: 16, fontWeight: '700', color: '#4ade80' },
  giftRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  giftInput: { flex: 1, marginBottom: 0 },
  giftCheckBtn: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e40af',
  },
  giftCheckText: { color: '#93c5fd', fontWeight: '600', fontSize: 14 },
  balanceBadge: {
    backgroundColor: '#052e1644',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#166534',
  },
  balanceBadgeText: { color: '#4ade80', fontSize: 13, fontWeight: '600' },
  errorText: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  bnplRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  bnplBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#16213e',
    backgroundColor: '#16213e',
    alignItems: 'center',
  },
  bnplBtnActive: { borderColor: '#a78bfa', backgroundColor: '#a78bfa22' },
  bnplBtnText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  bnplBtnTextActive: { color: '#a78bfa' },
  cardProcessing: {
    backgroundColor: '#16213e',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  cardProcessingText: { color: '#93c5fd', fontSize: 14 },
  applyBtn: {
    backgroundColor: '#4ade80',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  applyBtnDisabled: { backgroundColor: '#166534', opacity: 0.5 },
  applyBtnText: { fontSize: 16, fontWeight: '700', color: '#052e16' },
});
