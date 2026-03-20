import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCartStore } from '../store/cart';

type PaymentMethod = 'card' | 'cash' | 'mobile';
type PaymentStep = 'select' | 'processing' | 'success';

const METHODS: { id: PaymentMethod; label: string; emoji: string; color: string }[] = [
  { id: 'card',   label: 'Card',      emoji: '💳', color: '#3b82f6' },
  { id: 'cash',   label: 'Cash',      emoji: '💵', color: '#22c55e' },
  { id: 'mobile', label: 'Tap & Pay', emoji: '📱', color: '#a855f7' },
];

const HINTS: Record<PaymentMethod, string> = {
  card:   'Insert, tap, or swipe card on the Tyro terminal',
  cash:   'Collect cash and confirm the amount received',
  mobile: 'Ask customer to tap phone or watch to terminal',
};

export default function PaymentScreen() {
  const router = useRouter();
  const { total: totalParam } = useLocalSearchParams<{ total: string }>();
  const total = Number(totalParam ?? '0');
  const { clear } = useCartStore();

  const [method, setMethod] = useState<PaymentMethod>('card');
  const [step, setStep] = useState<PaymentStep>('select');
  const [orderNumber, setOrderNumber] = useState('');

  const gst = total / 11;
  const subtotal = total - gst;

  const handleCharge = () => {
    setStep('processing');
    const delay = method === 'card' ? 2500 : method === 'mobile' ? 2000 : 800;
    setTimeout(() => {
      const num = `POS-${Math.floor(1000 + Math.random() * 9000)}`;
      setOrderNumber(num);
      setStep('success');
      clear();
    }, delay);
  };

  if (step === 'success') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>Payment Accepted</Text>
          <Text style={styles.successOrder}>Order {orderNumber}</Text>
          <Text style={styles.successAmount}>${total.toFixed(2)}</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.doneBtnText}>New Order</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{'← Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Charge Customer</Text>
      </View>

      {/* Amount */}
      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>Total Due</Text>
        <Text style={styles.amountValue}>${total.toFixed(2)}</Text>
        <View style={styles.amountBreakdown}>
          <Text style={styles.breakdownText}>Subtotal ${subtotal.toFixed(2)}</Text>
          <Text style={styles.breakdownText}>  GST ${gst.toFixed(2)}</Text>
        </View>
      </View>

      {/* Payment method selector */}
      <Text style={styles.sectionTitle}>Payment Method</Text>
      <View style={styles.methodRow}>
        {METHODS.map((m) => {
          const selected = method === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              style={[styles.methodBtn, selected && { borderColor: m.color, backgroundColor: `${m.color}22` }]}
              onPress={() => setMethod(m.id)}
            >
              <Text style={styles.methodEmoji}>{m.emoji}</Text>
              <Text style={[styles.methodLabel, selected && { color: m.color }]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Hint */}
      <View style={styles.hintBox}>
        <Text style={styles.hintText}>{HINTS[method]}</Text>
      </View>

      {/* Charge button */}
      <TouchableOpacity style={styles.chargeBtn} onPress={handleCharge}>
        <Text style={styles.chargeBtnText}>
          {method === 'cash' ? 'Confirm Cash Payment' : `Charge $${total.toFixed(2)}`}
        </Text>
      </TouchableOpacity>

      {/* Processing overlay */}
      <Modal transparent visible={step === 'processing'} animationType="fade">
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.processingText}>
              {method === 'card' ? 'Processing card…' : method === 'mobile' ? 'Waiting for tap…' : 'Confirming…'}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  backBtn: { marginRight: 12 },
  backBtnText: { color: '#3b82f6', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },
  amountCard: { margin: 16, backgroundColor: '#1e293b', borderRadius: 16, padding: 24, alignItems: 'center' },
  amountLabel: { fontSize: 14, color: '#94a3b8', marginBottom: 4 },
  amountValue: { fontSize: 52, fontWeight: '800', color: '#f1f5f9' },
  amountBreakdown: { flexDirection: 'row', gap: 16, marginTop: 8 },
  breakdownText: { fontSize: 13, color: '#64748b' },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: 16, marginBottom: 10 },
  methodRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  methodBtn: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 12, borderWidth: 2, borderColor: '#1e293b', backgroundColor: '#1e293b' },
  methodEmoji: { fontSize: 28 },
  methodLabel: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#64748b' },
  hintBox: { margin: 16, backgroundColor: '#1e293b', borderRadius: 10, padding: 14 },
  hintText: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
  chargeBtn: { marginHorizontal: 16, marginTop: 'auto', marginBottom: 24, backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  chargeBtnText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  processingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  processingCard: { backgroundColor: '#1e293b', borderRadius: 20, padding: 40, alignItems: 'center', gap: 16 },
  processingText: { color: '#94a3b8', fontSize: 16 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  successIcon: { fontSize: 72 },
  successTitle: { fontSize: 28, fontWeight: '800', color: '#f1f5f9' },
  successOrder: { fontSize: 16, color: '#94a3b8' },
  successAmount: { fontSize: 42, fontWeight: '800', color: '#22c55e' },
  doneBtn: { marginTop: 24, backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48 },
  doneBtnText: { fontSize: 18, fontWeight: '700', color: '#fff' },
});
