import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore, t } from '../../store/kiosk';
import { useDeviceStore } from '../../store/device';

type PaymentMethod = 'card' | 'cash' | 'qr';

export default function PaymentScreen() {
  const router = useRouter();
  const { cartItems, clearCart, setOrderNumber, setEarnedPoints, orderType, tableNumber, loyaltyAccount, language } = useKioskStore();

  const METHODS: { id: PaymentMethod; label: string; icon: string; subtitle: string }[] = [
    { id: 'card', label: t(language, 'cardLabel'), icon: '💳', subtitle: t(language, 'cardSub') },
    { id: 'cash', label: t(language, 'cashLabel'), icon: '💵', subtitle: t(language, 'cashSub') },
    { id: 'qr', label: t(language, 'qrLabel'), icon: '📱', subtitle: t(language, 'qrSub') },
  ];
  const [selected, setSelected] = useState<PaymentMethod>('card');
  const [processing, setProcessing] = useState(false);

  const total = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const gstIncluded = total / 11;

  async function handlePay() {
    setProcessing(true);
    const identity = useDeviceStore.getState().identity;

    const orderPayload = {
      locationId: identity?.locationId,
      registerId: identity?.registerId || undefined,
      channel: 'kiosk' as const,
      paymentMethod: selected,
      orderType: orderType === 'dine_in' ? 'dine_in' : 'takeaway',
      lines: cartItems.map((i) => ({
        productId: i.id,
        name: i.name,
        quantity: i.qty,
        unitPrice: i.price, // dollars — server converts to cents internally
        costPrice: 0,
        taxRate: 10,
      })),
      ...(orderType === 'dine_in' && tableNumber ? { notes: `Table ${tableNumber}` } : {}),
    };

    try {
      const apiBase =
        process.env['EXPO_PUBLIC_API_URL'] ??
        process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
        '';
      const token = identity?.deviceToken ?? '';
      const res = await fetch(`${apiBase}/api/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(orderPayload),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        let msg = `Order creation failed (${res.status})`;
        try {
          const errBody = await res.json() as { message?: string };
          if (errBody?.message) msg = errBody.message;
        } catch { /* ignore parse error */ }
        throw new Error(msg);
      }
      const data = await res.json() as { orderNumber?: string; pointsEarned?: number };
      if (!data?.orderNumber) {
        throw new Error('No order number returned from server');
      }
      setOrderNumber(data.orderNumber);
      if (loyaltyAccount && data.pointsEarned != null) {
        setEarnedPoints(data.pointsEarned);
      }
    } catch (err) {
      setProcessing(false);
      Alert.alert(
        'Order Failed',
        err instanceof Error ? err.message : 'Could not create order. Please try again.',
        [{ text: 'OK' }],
      );
      return;
    }

    clearCart();
    setProcessing(false);
    router.replace('/(kiosk)/confirmation');
  }

  const orderTypeBadge =
    orderType === 'dine_in'
      ? `🍽️ Dine In${tableNumber ? ` — Table ${tableNumber}` : ''}`
      : '🥡 Take Away';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.orderTypeBadge}>
        <Text style={styles.orderTypeBadgeText}>{orderTypeBadge}</Text>
      </View>
      <Text style={styles.title}>{t(language, 'choosePayment')}</Text>

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

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>{t(language, 'orderSummary')}</Text>
        {cartItems.map((item) => (
          <View key={item.cartKey} style={styles.summaryRow}>
            <Text style={styles.summaryItemName}>{item.qty}x {item.name}</Text>
            <Text style={styles.summaryItemPrice}>${(item.price * item.qty).toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Incl. GST</Text>
          <Text style={styles.summaryValue}>${gstIncluded.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.payButton, processing && styles.payButtonDisabled]}
        onPress={handlePay}
        disabled={processing}
        activeOpacity={0.85}
      >
        {processing ? (
          <View style={styles.processingRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.payButtonText}>{t(language, 'processing')}</Text>
          </View>
        ) : (
          <Text style={styles.payButtonText}>{t(language, 'payFmt', { amount: total.toFixed(2) })}</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 20 },
  orderTypeBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  orderTypeBadgeText: { fontSize: 14, color: '#f59e0b', fontWeight: '700' },
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
