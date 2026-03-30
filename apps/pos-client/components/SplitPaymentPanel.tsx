import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert,
} from 'react-native';

export type SplitMethod = 'cash' | 'card' | 'eftpos' | 'gift_card' | 'account';

export interface SplitEntry {
  id: string;
  method: SplitMethod;
  amount: number;
  cashTendered?: number;
  change?: number;
  giftCardCode?: string;
}

interface Props {
  total: number;
  onComplete: (splits: SplitEntry[]) => void;
  onCancel: () => void;
}

const METHOD_OPTIONS: { id: SplitMethod; label: string; emoji: string; color: string }[] = [
  { id: 'cash',      label: 'Cash',       emoji: '💵', color: '#22c55e' },
  { id: 'card',      label: 'Card',       emoji: '💳', color: '#3b82f6' },
  { id: 'eftpos',    label: 'EFTPOS',     emoji: '🏧', color: '#6366f1' },
  { id: 'gift_card', label: 'Gift Card',  emoji: '🎁', color: '#f59e0b' },
  { id: 'account',   label: 'Account',    emoji: '🏢', color: '#ec4899' },
];

const METHOD_COLOR: Record<SplitMethod, string> = {
  cash:      '#22c55e',
  card:      '#3b82f6',
  eftpos:    '#6366f1',
  gift_card: '#f59e0b',
  account:   '#ec4899',
};

export default function SplitPaymentPanel({ total, onComplete, onCancel }: Props) {
  const [splits, setSplits] = useState<SplitEntry[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<SplitMethod>('cash');
  const [amountInput, setAmountInput] = useState('');
  const [cashTenderedInput, setCashTenderedInput] = useState('');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [giftCardValidating, setGiftCardValidating] = useState(false);

  const applied = splits.reduce((sum, s) => sum + s.amount, 0);
  const remaining = Math.max(0, total - applied);

  const displayAmount = amountInput === '' ? remaining : Number(amountInput);
  const cashTendered = cashTenderedInput === '' ? 0 : Number(cashTenderedInput);
  const change = selectedMethod === 'cash' ? Math.max(0, cashTendered - displayAmount) : 0;

  const canApply = (() => {
    if (displayAmount <= 0 || displayAmount > remaining + 0.001) return false;
    if (selectedMethod === 'cash' && cashTendered < displayAmount) return false;
    if (selectedMethod === 'gift_card' && giftCardCode.trim().length < 4) return false;
    return true;
  })();

  const handleApply = async () => {
    const amount = displayAmount;

    if (selectedMethod === 'gift_card') {
      setGiftCardValidating(true);
      try {
        // Validate gift card balance via API
        const res = await fetch(`/api/proxy/gift-cards/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: giftCardCode.trim(), requiredAmount: amount }),
        });
        if (!res.ok) {
          Alert.alert('Invalid Gift Card', 'The gift card code is invalid or has insufficient balance.');
          setGiftCardValidating(false);
          return;
        }
      } catch {
        // In offline or dev mode, skip validation
      }
      setGiftCardValidating(false);
    }

    const entry: SplitEntry = {
      id: `split-${Date.now()}-${Math.random()}`,
      method: selectedMethod,
      amount,
      ...(selectedMethod === 'cash' ? { cashTendered, change } : {}),
      ...(selectedMethod === 'gift_card' ? { giftCardCode: giftCardCode.trim() } : {}),
    };

    setSplits(prev => [...prev, entry]);
    setAmountInput('');
    setCashTenderedInput('');
    setGiftCardCode('');
  };

  const removeSplit = (id: string) => {
    setSplits(prev => prev.filter(s => s.id !== id));
  };

  const sumComplete = Math.abs(applied - total) < 0.01;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Split Payment</Text>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Balance summary */}
      <View style={styles.balanceRow}>
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Total</Text>
          <Text style={styles.balanceValue}>${total.toFixed(2)}</Text>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Paid</Text>
          <Text style={[styles.balanceValue, { color: '#22c55e' }]}>${applied.toFixed(2)}</Text>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Remaining</Text>
          <Text style={[styles.balanceValue, { color: remaining > 0 ? '#f59e0b' : '#22c55e' }]}>
            ${remaining.toFixed(2)}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Applied splits */}
        {splits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Splits Applied</Text>
            {splits.map(s => (
              <View key={s.id} style={styles.splitRow}>
                <View style={[styles.splitBadge, { backgroundColor: `${METHOD_COLOR[s.method]}22` }]}>
                  <Text style={[styles.splitBadgeText, { color: METHOD_COLOR[s.method] }]}>
                    {METHOD_OPTIONS.find(m => m.id === s.method)?.label}
                  </Text>
                </View>
                <Text style={styles.splitAmount}>${s.amount.toFixed(2)}</Text>
                {s.method === 'cash' && s.change !== undefined && s.change > 0 && (
                  <Text style={styles.splitChange}>Change: ${s.change.toFixed(2)}</Text>
                )}
                {s.giftCardCode && (
                  <Text style={styles.splitMeta}>···{s.giftCardCode.slice(-4)}</Text>
                )}
                <TouchableOpacity onPress={() => removeSplit(s.id)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* New split input — only show if still remaining */}
        {remaining > 0.005 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add Payment</Text>

            {/* Method selector */}
            <View style={styles.methodGrid}>
              {METHOD_OPTIONS.map(m => {
                const sel = selectedMethod === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.methodBtn, sel && { borderColor: m.color, backgroundColor: `${m.color}22` }]}
                    onPress={() => setSelectedMethod(m.id)}
                  >
                    <Text style={styles.methodEmoji}>{m.emoji}</Text>
                    <Text style={[styles.methodLabel, sel && { color: m.color }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Amount input */}
            <Text style={styles.inputLabel}>Amount</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder={`$${remaining.toFixed(2)} (remaining)`}
              placeholderTextColor="#475569"
              value={amountInput}
              onChangeText={setAmountInput}
            />

            {/* Cash-specific: tendered + change */}
            {selectedMethod === 'cash' && (
              <>
                <Text style={styles.inputLabel}>Cash Tendered</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder={`$${displayAmount.toFixed(2)}`}
                  placeholderTextColor="#475569"
                  value={cashTenderedInput}
                  onChangeText={setCashTenderedInput}
                />
                {cashTendered >= displayAmount && displayAmount > 0 && (
                  <View style={styles.changeRow}>
                    <Text style={styles.changeLabel}>Change Due</Text>
                    <Text style={styles.changeValue}>${change.toFixed(2)}</Text>
                  </View>
                )}
              </>
            )}

            {/* Gift card: code input */}
            {selectedMethod === 'gift_card' && (
              <>
                <Text style={styles.inputLabel}>Gift Card Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter gift card code"
                  placeholderTextColor="#475569"
                  value={giftCardCode}
                  onChangeText={setGiftCardCode}
                  autoCapitalize="characters"
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
              onPress={handleApply}
              disabled={!canApply || giftCardValidating}
            >
              <Text style={styles.applyBtnText}>
                {giftCardValidating ? 'Validating…' : `Apply $${displayAmount.toFixed(2)} — ${METHOD_OPTIONS.find(m => m.id === selectedMethod)?.label}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Complete button */}
      <TouchableOpacity
        style={[styles.completeBtn, !sumComplete && styles.completeBtnDisabled]}
        onPress={() => onComplete(splits)}
        disabled={!sumComplete}
      >
        <Text style={styles.completeBtnText}>
          {sumComplete ? 'Complete Payment' : `Complete (${remaining > 0 ? `$${remaining.toFixed(2)} remaining` : 'overpaid'})`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },
  cancelText: { fontSize: 15, color: '#94a3b8' },
  balanceRow: { flexDirection: 'row', margin: 16, backgroundColor: '#1e293b', borderRadius: 14, padding: 16 },
  balanceItem: { flex: 1, alignItems: 'center' },
  balanceDivider: { width: 1, backgroundColor: '#334155', marginVertical: 4 },
  balanceLabel: { fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceValue: { fontSize: 20, fontWeight: '700', color: '#f1f5f9' },
  scroll: { flex: 1 },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  splitRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 8, gap: 8 },
  splitBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  splitBadgeText: { fontSize: 12, fontWeight: '600' },
  splitAmount: { fontSize: 15, fontWeight: '700', color: '#f1f5f9', marginLeft: 'auto' },
  splitChange: { fontSize: 12, color: '#94a3b8' },
  splitMeta: { fontSize: 12, color: '#64748b' },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 14, color: '#ef4444' },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  methodBtn: { width: '31%', alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: '#1e293b', backgroundColor: '#1e293b' },
  methodEmoji: { fontSize: 22 },
  methodLabel: { marginTop: 4, fontSize: 11, fontWeight: '600', color: '#64748b' },
  inputLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 6 },
  input: { backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#f1f5f9', borderWidth: 1, borderColor: '#334155', marginBottom: 12 },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#14532d22', borderRadius: 10, padding: 12, marginBottom: 12 },
  changeLabel: { fontSize: 14, color: '#86efac' },
  changeValue: { fontSize: 16, fontWeight: '700', color: '#22c55e' },
  applyBtn: { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  applyBtnDisabled: { backgroundColor: '#1e40af55' },
  applyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  completeBtn: { margin: 16, backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  completeBtnDisabled: { backgroundColor: '#15803d55' },
  completeBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
