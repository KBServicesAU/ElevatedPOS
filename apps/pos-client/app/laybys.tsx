import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { posApiFetch } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LaybyPayment {
  id: string;
  amount: number;
  method: string;
  date: string;
  note?: string;
}

interface Layby {
  id: string;
  customerName: string;
  description: string;
  totalAmount: number;
  amountPaid: number;
  nextPaymentDue?: string;
  createdAt: string;
  status: 'active' | 'completed' | 'cancelled';
  payments: LaybyPayment[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Gift Card'];

// ─── New Layby Modal ──────────────────────────────────────────────────────────

interface NewLaybyModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (layby: Layby) => void;
}

function NewLaybyModal({ visible, onClose, onCreated }: NewLaybyModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [description, setDescription] = useState('');
  const [totalStr, setTotalStr] = useState('');
  const [depositStr, setDepositStr] = useState('');
  const [installments, setInstallments] = useState('4');
  const [saving, setSaving] = useState(false);
  const [depositError, setDepositError] = useState('');

  const total = Number(totalStr) || 0;
  const deposit = Number(depositStr) || 0;
  const minDeposit = total * 0.1;
  const depositValid = deposit >= minDeposit;

  const reset = () => {
    setCustomerName('');
    setDescription('');
    setTotalStr('');
    setDepositStr('');
    setInstallments('4');
    setSaving(false);
    setDepositError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDepositChange = (v: string) => {
    setDepositStr(v);
    const d = Number(v) || 0;
    if (total > 0 && d < total * 0.1) {
      setDepositError(`Minimum deposit is $${minDeposit.toFixed(2)} (10%)`);
    } else {
      setDepositError('');
    }
  };

  const canSave =
    customerName.trim().length > 0 &&
    description.trim().length > 0 &&
    total > 0 &&
    deposit > 0 &&
    depositValid &&
    Number(installments) >= 1;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await posApiFetch<Layby>('/api/v1/laybys', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim(),
          description: description.trim(),
          totalAmount: Math.round(total * 100),
          depositAmount: Math.round(deposit * 100),
          installmentCount: Number(installments),
        }),
      });
      onCreated(res);
      reset();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create layby.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>New Layby</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={ms.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={ms.label}>Customer Name</Text>
            <TextInput
              style={ms.input}
              placeholder="e.g. Jane Smith"
              placeholderTextColor="#4b5563"
              value={customerName}
              onChangeText={setCustomerName}
              autoCapitalize="words"
            />

            <Text style={ms.label}>Items / Description</Text>
            <TextInput
              style={[ms.input, ms.inputMulti]}
              placeholder="e.g. Blue suede jacket, size 12"
              placeholderTextColor="#4b5563"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            <Text style={ms.label}>Total Amount ($)</Text>
            <TextInput
              style={ms.input}
              placeholder="0.00"
              placeholderTextColor="#4b5563"
              keyboardType="decimal-pad"
              value={totalStr}
              onChangeText={(v) => {
                setTotalStr(v);
                handleDepositChange(depositStr);
              }}
            />

            <Text style={ms.label}>Deposit Amount ($)</Text>
            <TextInput
              style={[ms.input, depositError ? ms.inputError : null]}
              placeholder={total > 0 ? `Min $${minDeposit.toFixed(2)} (10%)` : '0.00'}
              placeholderTextColor="#4b5563"
              keyboardType="decimal-pad"
              value={depositStr}
              onChangeText={handleDepositChange}
            />
            {depositError ? (
              <View style={ms.errorRow}>
                <Ionicons name="alert-circle-outline" size={14} color="#f87171" />
                <Text style={ms.errorText}>{depositError}</Text>
              </View>
            ) : null}

            <Text style={ms.label}>Number of Installments</Text>
            <View style={ms.installRow}>
              {['2', '3', '4', '6', '8'].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[ms.installBtn, installments === n && ms.installBtnActive]}
                  onPress={() => setInstallments(n)}
                >
                  <Text style={[ms.installBtnText, installments === n && ms.installBtnTextActive]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {total > 0 && deposit > 0 && depositValid && Number(installments) > 0 && (
              <View style={ms.summaryBox}>
                <Text style={ms.summaryTitle}>Layby Summary</Text>
                <View style={ms.summaryRow}>
                  <Text style={ms.summaryLabel}>Total</Text>
                  <Text style={ms.summaryValue}>${total.toFixed(2)}</Text>
                </View>
                <View style={ms.summaryRow}>
                  <Text style={ms.summaryLabel}>Deposit today</Text>
                  <Text style={ms.summaryValue}>${deposit.toFixed(2)}</Text>
                </View>
                <View style={ms.summaryRow}>
                  <Text style={ms.summaryLabel}>Remaining balance</Text>
                  <Text style={ms.summaryValue}>${(total - deposit).toFixed(2)}</Text>
                </View>
                <View style={ms.summaryRow}>
                  <Text style={ms.summaryLabel}>Each instalment</Text>
                  <Text style={ms.summaryValue}>
                    ${((total - deposit) / Number(installments)).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[ms.saveBtn, (!canSave || saving) && ms.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? (
              <ActivityIndicator color="#052e16" />
            ) : (
              <Text style={ms.saveBtnText}>Create Layby</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add Payment Modal ────────────────────────────────────────────────────────

interface AddPaymentModalProps {
  visible: boolean;
  layby: Layby | null;
  onClose: () => void;
  onPaymentAdded: (laybyId: string, payment: LaybyPayment) => void;
}

function AddPaymentModal({ visible, layby, onClose, onPaymentAdded }: AddPaymentModalProps) {
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState('Card');
  const [saving, setSaving] = useState(false);

  const owing = layby ? layby.totalAmount - layby.amountPaid : 0;
  const amount = Number(amountStr) || 0;

  const reset = () => {
    setAmountStr('');
    setMethod('Card');
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!layby || amount <= 0) return;
    setSaving(true);
    try {
      const res = await posApiFetch<LaybyPayment>(
        `/api/v1/laybys/${layby.id}/payments`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: Math.round(amount * 100),
            method: method.toLowerCase().replace(' ', '_'),
          }),
        },
      );
      onPaymentAdded(layby.id, res);
      reset();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not record payment.');
      setSaving(false);
    }
  };

  if (!layby) return null;

  const amountOwing = owing / 100;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>Add Payment</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={ms.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={ms.payOwingBox}>
            <Text style={ms.payOwingLabel}>Balance Owing</Text>
            <Text style={ms.payOwingValue}>${amountOwing.toFixed(2)}</Text>
            <Text style={ms.payOwingCustomer}>{layby.customerName}</Text>
          </View>

          <Text style={ms.label}>Payment Amount ($)</Text>
          <TextInput
            style={ms.input}
            placeholder={`$${amountOwing.toFixed(2)} (full amount)`}
            placeholderTextColor="#4b5563"
            keyboardType="decimal-pad"
            value={amountStr}
            onChangeText={setAmountStr}
          />

          <Text style={ms.label}>Payment Method</Text>
          <View style={ms.methodRow}>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[ms.methodBtn, method === m && ms.methodBtnActive]}
                onPress={() => setMethod(m)}
              >
                <Text style={[ms.methodBtnText, method === m && ms.methodBtnTextActive]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[ms.saveBtn, (saving || amount <= 0) && ms.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || amount <= 0}
          >
            {saving ? (
              <ActivityIndicator color="#052e16" />
            ) : (
              <Text style={ms.saveBtnText}>
                Record ${amount > 0 ? amount.toFixed(2) : '—'} Payment
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.min(1, Math.max(0, ratio)) * 100;
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: { height: 6, backgroundColor: '#0f3460', borderRadius: 3, overflow: 'hidden', flex: 1 },
  fill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 3 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LaybysScreen() {
  const router = useRouter();

  const [laybys, setLaybys] = useState<Layby[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [selectedLayby, setSelectedLayby] = useState<Layby | null>(null);

  const loadLaybys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApiFetch<{ data: Layby[] }>('/api/v1/laybys?status=active');
      setLaybys(res.data ?? []);
    } catch {
      setLaybys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLaybys();
  }, [loadLaybys]);

  const handleLaybyCreated = (layby: Layby) => {
    setLaybys((prev) => [layby, ...prev]);
    setShowNew(false);
  };

  const handlePaymentAdded = (laybyId: string, payment: LaybyPayment) => {
    setLaybys((prev) =>
      prev.map((l) => {
        if (l.id !== laybyId) return l;
        const newPaid = l.amountPaid + payment.amount;
        return {
          ...l,
          amountPaid: newPaid,
          payments: [payment, ...(l.payments ?? [])],
          status: newPaid >= l.totalAmount ? 'completed' : l.status,
        };
      }),
    );
    setShowAddPayment(false);
    setSelectedLayby(null);
  };

  const activeLaybys = laybys.filter((l) => l.status === 'active');

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#60a5fa" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Laybys</Text>
        <TouchableOpacity style={s.newBtn} onPress={() => setShowNew(true)}>
          <Ionicons name="add" size={18} color="#052e16" />
          <Text style={s.newBtnText}>New Layby</Text>
        </TouchableOpacity>
      </View>

      {/* Summary bar */}
      <View style={s.summaryBar}>
        <View style={s.summaryItem}>
          <Text style={s.summaryValue}>{activeLaybys.length}</Text>
          <Text style={s.summaryLabel}>Active</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryValue}>
            {fmt(activeLaybys.reduce((a, l) => a + (l.totalAmount - l.amountPaid), 0))}
          </Text>
          <Text style={s.summaryLabel}>Total Owing</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryValue}>
            {fmt(activeLaybys.reduce((a, l) => a + l.amountPaid, 0))}
          </Text>
          <Text style={s.summaryLabel}>Collected</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#60a5fa" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {activeLaybys.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={48} color="#1f2937" />
              <Text style={s.emptyTitle}>No Active Laybys</Text>
              <Text style={s.emptySubtitle}>Tap "New Layby" to create one</Text>
            </View>
          ) : (
            activeLaybys.map((layby) => {
              const expanded = expandedId === layby.id;
              const owing = layby.totalAmount - layby.amountPaid;
              const ratio = layby.amountPaid / layby.totalAmount;
              const pct = Math.round(ratio * 100);

              return (
                <View key={layby.id} style={s.card}>
                  <TouchableOpacity
                    onPress={() => setExpandedId(expanded ? null : layby.id)}
                    activeOpacity={0.8}
                  >
                    {/* Card top row */}
                    <View style={s.cardTop}>
                      <View style={s.cardLeft}>
                        <Text style={s.customerName}>{layby.customerName}</Text>
                        <Text style={s.description} numberOfLines={1}>
                          {layby.description}
                        </Text>
                      </View>
                      <View style={s.cardRight}>
                        <Text style={s.totalAmount}>{fmt(layby.totalAmount)}</Text>
                        <Text style={s.owingText}>
                          {fmt(owing)} owing
                        </Text>
                      </View>
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#4b5563"
                        style={{ marginLeft: 8 }}
                      />
                    </View>

                    {/* Progress bar */}
                    <View style={s.progressRow}>
                      <ProgressBar ratio={ratio} />
                      <Text style={s.progressPct}>{pct}%</Text>
                    </View>

                    {/* Next payment */}
                    {layby.nextPaymentDue && (
                      <View style={s.dueDateRow}>
                        <Ionicons name="calendar-outline" size={12} color="#fbbf24" />
                        <Text style={s.dueDateText}>
                          Next payment: {fmtDate(layby.nextPaymentDue)}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Expanded detail */}
                  {expanded && (
                    <View style={s.expandedBox}>
                      <View style={s.expandedHeader}>
                        <Text style={s.expandedSectionTitle}>Payment History</Text>
                        <TouchableOpacity
                          style={s.addPaymentBtn}
                          onPress={() => {
                            setSelectedLayby(layby);
                            setShowAddPayment(true);
                          }}
                        >
                          <Ionicons name="add" size={14} color="#052e16" />
                          <Text style={s.addPaymentBtnText}>Add Payment</Text>
                        </TouchableOpacity>
                      </View>

                      {layby.payments?.length > 0 ? (
                        layby.payments.map((p) => (
                          <View key={p.id} style={s.paymentRow}>
                            <View style={s.paymentLeft}>
                              <Text style={s.paymentMethod}>{p.method}</Text>
                              <Text style={s.paymentDate}>{fmtDate(p.date)}</Text>
                            </View>
                            <Text style={s.paymentAmount}>{fmt(p.amount)}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={s.noPaymentsText}>No payments recorded yet.</Text>
                      )}

                      <View style={s.expandedSummary}>
                        <View style={s.expandedSummaryRow}>
                          <Text style={s.expandedSummaryLabel}>Total</Text>
                          <Text style={s.expandedSummaryValue}>{fmt(layby.totalAmount)}</Text>
                        </View>
                        <View style={s.expandedSummaryRow}>
                          <Text style={s.expandedSummaryLabel}>Paid</Text>
                          <Text style={[s.expandedSummaryValue, { color: '#4ade80' }]}>
                            {fmt(layby.amountPaid)}
                          </Text>
                        </View>
                        <View style={s.expandedSummaryRow}>
                          <Text style={s.expandedSummaryLabel}>Remaining</Text>
                          <Text style={[s.expandedSummaryValue, { color: '#fbbf24' }]}>
                            {fmt(owing)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <NewLaybyModal
        visible={showNew}
        onClose={() => setShowNew(false)}
        onCreated={handleLaybyCreated}
      />

      <AddPaymentModal
        visible={showAddPayment}
        layby={selectedLayby}
        onClose={() => {
          setShowAddPayment(false);
          setSelectedLayby(null);
        }}
        onPaymentAdded={handlePaymentAdded}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
    gap: 12,
  },
  backBtn: { width: 36 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#f1f5f9' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#4ade80',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newBtnText: { color: '#052e16', fontSize: 13, fontWeight: '800' },

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

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  emptySubtitle: { color: '#4b5563', fontSize: 13 },

  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cardLeft: { flex: 1, gap: 3 },
  customerName: { fontSize: 15, fontWeight: '700', color: '#f1f5f9' },
  description: { fontSize: 12, color: '#94a3b8' },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  totalAmount: { fontSize: 16, fontWeight: '700', color: '#f1f5f9' },
  owingText: { fontSize: 12, color: '#fbbf24' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  progressPct: { fontSize: 12, color: '#4ade80', fontWeight: '600', width: 36, textAlign: 'right' },

  dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dueDateText: { fontSize: 12, color: '#fbbf24' },

  expandedBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    paddingTop: 12,
    gap: 8,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  expandedSectionTitle: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  addPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4ade80',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addPaymentBtnText: { color: '#052e16', fontSize: 12, fontWeight: '800' },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  paymentLeft: { flex: 1, gap: 2 },
  paymentMethod: { fontSize: 13, color: '#e2e8f0', fontWeight: '500', textTransform: 'capitalize' },
  paymentDate: { fontSize: 11, color: '#64748b' },
  paymentAmount: { fontSize: 14, fontWeight: '700', color: '#4ade80' },
  noPaymentsText: { fontSize: 13, color: '#4b5563', textAlign: 'center', paddingVertical: 8 },

  expandedSummary: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 4,
  },
  expandedSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  expandedSummaryLabel: { fontSize: 13, color: '#64748b' },
  expandedSummaryValue: { fontSize: 13, fontWeight: '600', color: '#f1f5f9' },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#f1f5f9' },
  closeBtn: { fontSize: 18, color: '#94a3b8', paddingHorizontal: 4 },
  label: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#0f3460',
    marginBottom: 4,
  },
  inputError: { borderColor: '#f87171' },
  inputMulti: { height: 72, textAlignVertical: 'top' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  errorText: { color: '#f87171', fontSize: 12 },
  installRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  installBtn: {
    width: 52,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#16213e',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0f3460',
  },
  installBtnActive: { borderColor: '#4ade80', backgroundColor: '#14532d33' },
  installBtnText: { color: '#64748b', fontWeight: '700', fontSize: 15 },
  installBtnTextActive: { color: '#4ade80' },
  summaryBox: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#0f3460',
    marginBottom: 8,
  },
  summaryTitle: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 13, color: '#94a3b8' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#f1f5f9' },
  saveBtn: {
    backgroundColor: '#4ade80',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  saveBtnDisabled: { backgroundColor: '#166534', opacity: 0.5 },
  saveBtnText: { color: '#052e16', fontSize: 16, fontWeight: '800' },

  payOwingBox: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  payOwingLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  payOwingValue: { fontSize: 32, fontWeight: '800', color: '#fbbf24' },
  payOwingCustomer: { fontSize: 13, color: '#94a3b8' },

  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  methodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: '#16213e',
    borderWidth: 2,
    borderColor: '#0f3460',
  },
  methodBtnActive: { borderColor: '#60a5fa', backgroundColor: '#1e3a5f' },
  methodBtnText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  methodBtnTextActive: { color: '#93c5fd' },
});
