import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore } from '../store/kiosk';

type PaymentMethod = 'card' | 'cash' | 'qr';

const TAX_RATE = 0.10;

const METHODS: { id: PaymentMethod; label: string; icon: string; subtitle: string }[] = [
  { id: 'card', label: 'Card', icon: '💳', subtitle: 'Tap, insert or swipe' },
  { id: 'cash', label: 'Cash', icon: '💵', subtitle: 'Pay at counter' },
  { id: 'qr', label: 'QR Pay', icon: '📱', subtitle: 'WeChat Pay · Alipay' },
];

export default function PaymentScreen() {
  const router = useRouter();
  const { cartItems, clearCart, setOrderNumber } = useKioskStore();
  const [selected, setSelected] = useState<PaymentMethod>('card');
  const [processing, setProcessing] = useState(false);

  const subtotal = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  async function handlePay() {
    setProcessing(true);
    // Simulate payment processing
    await new Promise((res) => setTimeout(res, 2200));
    const orderNum = `K${Math.floor(100 + Math.random() * 900)}`;
    setOrderNumber(orderNum);
    clearCart();
    setProcessing(false);
    router.replace('/confirmation');
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Text style={styles.title}>Choose Payment Method</Text>

      {/* Method cards */}
      <View style={styles.methods}>
        {METHODS.map((method) => (
          <TouchableOpacity
            key={method.id}
            style={[styles.methodCard, selected === method.id && styles.methodCardActive]}
            onPress={() => setSelected(method.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.methodIcon}>{method.icon}</Text>
            <Text style={[styles.methodLabel, selected === method.id && styles.methodLabelActive]}>{method.label}</Text>
            <Text style={styles.methodSub}>{method.subtitle}</Text>
            {selected === method.id && (
              <View style={styles.checkMark}>
                <Text style={styles.checkMarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Order summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        {cartItems.map((item) => (
          <View key={item.id} style={styles.summaryRow}>
            <Text style={styles.summaryItemName}>{item.qty}× {item.name}</Text>
            <Text style={styles.summaryItemPrice}>${(item.price * item.qty).toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>GST (10%)</Text>
          <Text style={styles.summaryValue}>${tax.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>
      </View>

      {/* Pay button */}
      <TouchableOpacity
        style={[styles.payButton, processing && styles.payButtonDisabled]}
        onPress={handlePay}
        disabled={processing}
        activeOpacity={0.85}
      >
        {processing ? (
          <View style={styles.processingRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.payButtonText}>Processing…</Text>
          </View>
        ) : (
          <Text style={styles.payButtonText}>Pay ${total.toFixed(2)}</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 20 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 20, textAlign: 'center' },
  methods: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  methodCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2a2a2a',
    position: 'relative',
  },
  methodCardActive: { borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.08)' },
  methodIcon: { fontSize: 36, marginBottom: 8 },
  methodLabel: { fontSize: 17, fontWeight: '700', color: '#ccc', marginBottom: 4 },
  methodLabelActive: { color: '#f97316' },
  methodSub: { fontSize: 11, color: '#555', textAlign: 'center' },
  checkMark: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#f97316',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMarkText: { fontSize: 12, color: '#fff', fontWeight: '800' },
  summaryCard: { backgroundColor: '#141414', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#2a2a2a' },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#888', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryItemName: { fontSize: 14, color: '#ccc' },
  summaryItemPrice: { fontSize: 14, color: '#ccc' },
  divider: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 10 },
  summaryLabel: { fontSize: 14, color: '#777' },
  summaryValue: { fontSize: 14, color: '#aaa' },
  totalLabel: { fontSize: 18, fontWeight: '800', color: '#fff' },
  totalValue: { fontSize: 22, fontWeight: '900', color: '#f97316' },
  payButton: {
    backgroundColor: '#f97316',
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  payButtonDisabled: { opacity: 0.7 },
  payButtonText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  processingRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
