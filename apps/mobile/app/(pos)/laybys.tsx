import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { toast } from '../../components/ui';

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

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
  totalAmount: number; // cents
  amountPaid: number; // cents
  nextPaymentDue?: string;
  createdAt: string;
  status: 'active' | 'completed' | 'cancelled';
  payments: LaybyPayment[];
}

const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Gift Card'];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(cents: number) {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
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

async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Progress Bar                                                        */
/* ------------------------------------------------------------------ */

function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.min(1, Math.max(0, ratio)) * 100;
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: '#1e1e2e',
    borderRadius: 3,
    overflow: 'hidden',
    flex: 1,
  },
  fill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 3 },
});

/* ------------------------------------------------------------------ */
/* New Layby Modal                                                     */
/* ------------------------------------------------------------------ */

interface NewLaybyModalProps {
  visible: boolean;
  token: string;
  locationId: string;
  onClose: () => void;
  onCreated: (layby: Layby) => void;
}

function NewLaybyModal({ visible, token, locationId, onClose, onCreated }: NewLaybyModalProps) {
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

  function reset() {
    setCustomerName('');
    setDescription('');
    setTotalStr('');
    setDepositStr('');
    setInstallments('4');
    setSaving(false);
    setDepositError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleDepositChange(v: string) {
    setDepositStr(v);
    const d = Number(v) || 0;
    if (total > 0 && d < total * 0.1) {
      setDepositError(`Min deposit is $${minDeposit.toFixed(2)} (10%)`);
    } else {
      setDepositError('');
    }
  }

  const canSave =
    customerName.trim().length > 0 &&
    description.trim().length > 0 &&
    total > 0 &&
    deposit > 0 &&
    depositValid &&
    Number(installments) >= 1;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await apiFetch<Layby>('/api/v1/laybys', token, {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim(),
          description: description.trim(),
          totalAmount: Math.round(total * 100),
          depositAmount: Math.round(deposit * 100),
          installmentCount: Number(installments),
          locationId,
        }),
      });
      onCreated(res);
      reset();
      toast.success('Layby Created', 'Customer layby plan started.');
    } catch (err) {
      toast.error('Layby Failed', err instanceof Error ? err.message : 'Could not create layby.');
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>New Layby</Text>
            <TouchableOpacity onPress={handleClose} style={ms.closeBtn}>
              <Ionicons name="close" size={22} color="#888" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={ms.label}>Customer Name</Text>
            <TextInput
              style={ms.input}
              placeholder="e.g. Jane Smith"
              placeholderTextColor="#444"
              value={customerName}
              onChangeText={setCustomerName}
              autoCapitalize="words"
            />

            <Text style={ms.label}>Items / Description</Text>
            <TextInput
              style={[ms.input, ms.inputMulti]}
              placeholder="e.g. Blue suede jacket, size 12"
              placeholderTextColor="#444"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            <Text style={ms.label}>Total Amount ($)</Text>
            <TextInput
              style={ms.input}
              placeholder="0.00"
              placeholderTextColor="#444"
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
              placeholderTextColor="#444"
              keyboardType="decimal-pad"
              value={depositStr}
              onChangeText={handleDepositChange}
            />
            {depositError ? (
              <View style={ms.errorRow}>
                <Ionicons name="alert-circle" size={14} color="#ef4444" />
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
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      ms.installBtnText,
                      installments === n && ms.installBtnTextActive,
                    ]}
                  >
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
                  <Text style={[ms.summaryValue, { color: '#6366f1' }]}>
                    ${((total - deposit) / Number(installments)).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            <View style={{ height: 12 }} />
          </ScrollView>

          <TouchableOpacity
            style={[ms.saveBtn, (!canSave || saving) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={!canSave || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={ms.saveBtnText}>Create Layby</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Add Payment Modal                                                   */
/* ------------------------------------------------------------------ */

interface AddPaymentModalProps {
  visible: boolean;
  layby: Layby | null;
  token: string;
  onClose: () => void;
  onPaymentAdded: (laybyId: string, payment: LaybyPayment) => void;
}

function AddPaymentModal({
  visible,
  layby,
  token,
  onClose,
  onPaymentAdded,
}: AddPaymentModalProps) {
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState('Card');
  const [saving, setSaving] = useState(false);

  const owing = layby ? layby.totalAmount - layby.amountPaid : 0;
  const amount = Number(amountStr) || 0;

  function reset() {
    setAmountStr('');
    setMethod('Card');
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSave() {
    if (!layby || amount <= 0) return;
    setSaving(true);
    try {
      const res = await apiFetch<LaybyPayment>(
        `/api/v1/laybys/${layby.id}/payments`,
        token,
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
      toast.success('Payment Recorded', 'Layby balance updated.');
    } catch (err) {
      toast.error('Payment Failed', err instanceof Error ? err.message : 'Could not record payment.');
      setSaving(false);
    }
  }

  if (!layby) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>Add Payment</Text>
            <TouchableOpacity onPress={handleClose} style={ms.closeBtn}>
              <Ionicons name="close" size={22} color="#888" />
            </TouchableOpacity>
          </View>

          <View style={ms.payOwingBox}>
            <Text style={ms.payOwingLabel}>Balance Owing</Text>
            <Text style={ms.payOwingValue}>{fmt(owing)}</Text>
            <Text style={ms.payOwingCustomer}>{layby.customerName}</Text>
          </View>

          <Text style={ms.label}>Payment Amount ($)</Text>
          <TextInput
            style={ms.input}
            placeholder={`${(owing / 100).toFixed(2)} (full amount)`}
            placeholderTextColor="#444"
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
                activeOpacity={0.85}
              >
                <Text style={[ms.methodBtnText, method === m && ms.methodBtnTextActive]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[ms.saveBtn, (saving || amount <= 0) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving || amount <= 0}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cash" size={18} color="#fff" />
                <Text style={ms.saveBtnText}>
                  Record ${amount > 0 ? amount.toFixed(2) : '0.00'} Payment
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function LaybysScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);
  const token = employeeToken ?? identity?.deviceToken ?? '';
  const locationId = identity?.locationId ?? '';

  const [laybys, setLaybys] = useState<Layby[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [selectedLayby, setSelectedLayby] = useState<Layby | null>(null);

  const loadLaybys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Layby[] }>(
        `/api/v1/laybys?status=active&locationId=${locationId}`,
        token,
      );
      setLaybys(res.data ?? []);
    } catch {
      setLaybys([]);
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    loadLaybys();
  }, [loadLaybys]);

  function handleLaybyCreated(layby: Layby) {
    setLaybys((prev) => [layby, ...prev]);
    setShowNew(false);
  }

  function handlePaymentAdded(laybyId: string, payment: LaybyPayment) {
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
  }

  const activeLaybys = laybys.filter((l) => l.status === 'active');

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={20} color="#888" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Laybys</Text>
        <TouchableOpacity style={s.newBtn} onPress={() => setShowNew(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.newBtnText}>New</Text>
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
          <Text style={[s.summaryValue, { color: '#f59e0b' }]}>
            {fmt(activeLaybys.reduce((a, l) => a + (l.totalAmount - l.amountPaid), 0))}
          </Text>
          <Text style={s.summaryLabel}>Owing</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryValue, { color: '#22c55e' }]}>
            {fmt(activeLaybys.reduce((a, l) => a + l.amountPaid, 0))}
          </Text>
          <Text style={s.summaryLabel}>Collected</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {activeLaybys.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={48} color="#2a2a3a" />
              <Text style={s.emptyTitle}>No Active Laybys</Text>
              <Text style={s.emptySubtitle}>Tap "New" to create one</Text>
            </View>
          ) : (
            activeLaybys.map((layby) => {
              const expanded = expandedId === layby.id;
              const owing = layby.totalAmount - layby.amountPaid;
              const ratio = layby.amountPaid / (layby.totalAmount || 1);
              const pct = Math.round(ratio * 100);

              return (
                <View key={layby.id} style={s.card}>
                  <TouchableOpacity
                    onPress={() => setExpandedId(expanded ? null : layby.id)}
                    activeOpacity={0.8}
                  >
                    {/* Top row */}
                    <View style={s.cardTop}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={s.customerName}>{layby.customerName}</Text>
                        <Text style={s.description} numberOfLines={1}>
                          {layby.description}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text style={s.totalAmount}>{fmt(layby.totalAmount)}</Text>
                        <Text style={s.owingText}>{fmt(owing)} owing</Text>
                      </View>
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#666"
                        style={{ marginLeft: 8 }}
                      />
                    </View>

                    {/* Progress bar */}
                    <View style={s.progressRow}>
                      <ProgressBar ratio={ratio} />
                      <Text style={s.progressPct}>{pct}%</Text>
                    </View>

                    {layby.nextPaymentDue && (
                      <View style={s.dueDateRow}>
                        <Ionicons name="calendar-outline" size={12} color="#f59e0b" />
                        <Text style={s.dueDateText}>
                          Next payment: {fmtDate(layby.nextPaymentDue)}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

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
                          activeOpacity={0.85}
                        >
                          <Ionicons name="add" size={14} color="#fff" />
                          <Text style={s.addPaymentBtnText}>Add Payment</Text>
                        </TouchableOpacity>
                      </View>

                      {layby.payments?.length > 0 ? (
                        layby.payments.map((p) => (
                          <View key={p.id} style={s.paymentRow}>
                            <View style={{ flex: 1, gap: 2 }}>
                              <Text style={s.paymentMethod}>
                                {p.method.replace('_', ' ')}
                              </Text>
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
                          <Text style={[s.expandedSummaryValue, { color: '#22c55e' }]}>
                            {fmt(layby.amountPaid)}
                          </Text>
                        </View>
                        <View style={s.expandedSummaryRow}>
                          <Text style={s.expandedSummaryLabel}>Remaining</Text>
                          <Text style={[s.expandedSummaryValue, { color: '#f59e0b' }]}>
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
        token={token}
        locationId={locationId}
        onClose={() => setShowNew(false)}
        onCreated={handleLaybyCreated}
      />

      <AddPaymentModal
        visible={showAddPayment}
        layby={selectedLayby}
        token={token}
        onClose={() => {
          setShowAddPayment(false);
          setSelectedLayby(null);
        }}
        onPaymentAdded={handlePaymentAdded}
      />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d14' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
    gap: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: '#fff' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  newBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#141425',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  summaryLabel: {
    color: '#666',
    fontSize: 10,
    marginTop: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  summaryDivider: { width: 1, backgroundColor: '#2a2a3a', marginHorizontal: 8 },

  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 10 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { color: '#888', fontSize: 16, fontWeight: '700' },
  emptySubtitle: { color: '#555', fontSize: 13 },

  card: {
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  customerName: { fontSize: 15, fontWeight: '800', color: '#fff' },
  description: { fontSize: 12, color: '#888' },
  totalAmount: { fontSize: 16, fontWeight: '800', color: '#fff' },
  owingText: { fontSize: 11, color: '#f59e0b', fontWeight: '700' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  progressPct: {
    fontSize: 12,
    color: '#22c55e',
    fontWeight: '800',
    width: 36,
    textAlign: 'right',
  },

  dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dueDateText: { fontSize: 12, color: '#f59e0b' },

  expandedBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3a',
    paddingTop: 12,
    gap: 8,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  expandedSectionTitle: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  addPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addPaymentBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  paymentMethod: {
    fontSize: 13,
    color: '#e5e7eb',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  paymentDate: { fontSize: 11, color: '#666' },
  paymentAmount: { fontSize: 14, fontWeight: '800', color: '#22c55e' },
  noPaymentsText: { fontSize: 13, color: '#555', textAlign: 'center', paddingVertical: 8 },

  expandedSummary: {
    backgroundColor: '#0d0d14',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  expandedSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  expandedSummaryLabel: { fontSize: 13, color: '#666' },
  expandedSummaryValue: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

/* ---------- Modal (shared) ---------- */

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: '#fff' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    color: '#888',
    marginBottom: 8,
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#0d0d14',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 4,
  },
  inputError: { borderColor: '#ef4444' },
  inputMulti: { height: 72, textAlignVertical: 'top' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  errorText: { color: '#ef4444', fontSize: 12 },
  installRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  installBtn: {
    width: 52,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#0d0d14',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2a2a3a',
  },
  installBtnActive: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  installBtnText: { color: '#666', fontWeight: '800', fontSize: 15 },
  installBtnTextActive: { color: '#22c55e' },

  summaryBox: {
    backgroundColor: '#0d0d14',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  summaryTitle: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: '700',
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 13, color: '#888' },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#fff' },

  saveBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    shadowColor: '#6366f1',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  payOwingBox: {
    backgroundColor: '#0d0d14',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  payOwingLabel: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  payOwingValue: { fontSize: 32, fontWeight: '900', color: '#f59e0b' },
  payOwingCustomer: { fontSize: 13, color: '#888' },

  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  methodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 9,
    backgroundColor: '#0d0d14',
    borderWidth: 2,
    borderColor: '#2a2a3a',
  },
  methodBtnActive: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  methodBtnText: { color: '#666', fontSize: 13, fontWeight: '700' },
  methodBtnTextActive: { color: '#a5b4fc' },
});
