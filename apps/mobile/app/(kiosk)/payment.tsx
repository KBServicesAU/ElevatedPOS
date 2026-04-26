import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
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
import { useTillStore } from '../../store/till';
import { getDeviceJwt } from '../../lib/device-jwt';
import { AnzPaymentModal, type AnzPaymentResult } from '../../components/AnzPaymentModal';

type PaymentMethod = 'card' | 'cash' | 'qr';

export default function PaymentScreen() {
  const router = useRouter();
  const { cartItems, clearCart, setOrderNumber, setEarnedPoints, orderType, tableNumber, loyaltyAccount, language } = useKioskStore();
  const tillOpen = useTillStore((s) => s.isOpen);

  const METHODS: { id: PaymentMethod; label: string; icon: string; subtitle: string }[] = [
    { id: 'card', label: t(language, 'cardLabel'), icon: '💳', subtitle: t(language, 'cardSub') },
    { id: 'cash', label: t(language, 'cashLabel'), icon: '💵', subtitle: t(language, 'cashSub') },
    { id: 'qr', label: t(language, 'qrLabel'), icon: '📱', subtitle: t(language, 'qrSub') },
  ];
  const [selected, setSelected] = useState<PaymentMethod>('card');
  const [processing, setProcessing] = useState(false);
  // v2.7.40 — ANZ Worldline TIM card payment modal state. The kiosk
  // reuses the same <AnzPaymentModal> the POS uses; the bridge lives
  // at the kiosk layout level (AnzBridgeProvider) so the terminal
  // stays activated across attract → cart → payment transitions.
  const [showAnzModal, setShowAnzModal] = useState(false);
  const [anzAmount, setAnzAmount] = useState(0);
  const [anzRefId, setAnzRefId] = useState('');
  // Stash card-payment extras (receipts, card brand/last4, auth code)
  // captured from the ANZ result so they can ride along with the order
  // POST + /complete call. The kiosk has no printer today, so we just
  // attach them to the order metadata for later reconciliation.
  const cardExtrasRef = useRef<{
    cardType?: string;
    cardLast4?: string;
    authCode?: string;
    rrn?: string;
    anzCustomerReceipt?: string;
    anzMerchantReceipt?: string;
  } | null>(null);

  const total = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const gstIncluded = total / 11;

  async function postOrderAndComplete(method: PaymentMethod) {
    setProcessing(true);
    const identity = useDeviceStore.getState().identity;

    // v2.7.40 — when a card payment has run on the ANZ terminal we
    // attach the merchant + customer receipts to the order `notes`
    // so staff can reprint from the orders screen. Keeps the field
    // optional for cash / QR paths.
    const extras = cardExtrasRef.current;
    const tableNote = orderType === 'dine_in' && tableNumber ? `Table ${tableNumber}` : null;
    const noteParts: string[] = [];
    if (tableNote) noteParts.push(tableNote);
    if (extras?.cardType || extras?.cardLast4) {
      const cardDesc = [
        extras.cardType,
        extras.cardLast4 ? `••••${extras.cardLast4}` : null,
      ].filter(Boolean).join(' ');
      if (cardDesc) noteParts.push(`Card: ${cardDesc}`);
    }
    if (extras?.authCode) noteParts.push(`Auth: ${extras.authCode}`);
    if (extras?.rrn) noteParts.push(`RRN: ${extras.rrn}`);
    if (extras?.anzMerchantReceipt) {
      noteParts.push(`--- Merchant Receipt ---\n${extras.anzMerchantReceipt}`);
    }
    if (extras?.anzCustomerReceipt) {
      noteParts.push(`--- Customer Receipt ---\n${extras.anzCustomerReceipt}`);
    }

    const orderPayload = {
      locationId: identity?.locationId,
      registerId: identity?.registerId || undefined,
      channel: 'kiosk' as const,
      paymentMethod: method,
      orderType: orderType === 'dine_in' ? 'dine_in' : 'takeaway',
      lines: cartItems.map((i) => ({
        productId: i.id,
        name: i.name,
        quantity: i.qty,
        unitPrice: i.price, // dollars — server converts to cents internally
        costPrice: 0,
        taxRate: 10,
      })),
      ...(noteParts.length > 0 ? { notes: noteParts.join('\n') } : {}),
    };

    try {
      const apiBase =
        process.env['EXPO_PUBLIC_API_URL'] ??
        process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
        '';
      // v2.7.37 — kiosks have no employee PIN login, so the only
      // identity is the device token. The orders service uses
      // `request.jwtVerify()` which doesn't accept the opaque device
      // token — we exchange it for a short-lived JWT via
      // /api/v1/devices/access-token. Before this change, every
      // kiosk checkout failed with "Unauthorized — please log in again".
      const token = await getDeviceJwt();
      if (!token) {
        throw new Error('Could not authenticate with server. Check network and pairing.');
      }
      // v2.7.44 — instrumented order-creation path so the next regression
      // surfaces in device logs (kiosks run unattended for hours; silent
      // failures lead to angry merchants and lost revenue).
      console.log('[POS/complete]', 'kiosk.postOrderAndComplete → POST /orders', {
        method,
        orderType: orderPayload.orderType,
        lines: orderPayload.lines.length,
      });
      const res = await fetch(`${apiBase}/api/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(orderPayload),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        let msg = `Order creation failed (${res.status})`;
        try {
          const errBody = await res.json() as { message?: string };
          if (errBody?.message) msg = errBody.message;
        } catch { /* ignore parse error */ }
        console.error('[POS/complete]', 'kiosk.postOrderAndComplete POST /orders FAILED', res.status, msg);
        throw new Error(msg);
      }
      const data = await res.json() as { id?: string; orderNumber?: string; pointsEarned?: number };
      if (!data?.orderNumber || !data.id) {
        console.error('[POS/complete]', 'kiosk.postOrderAndComplete missing id/orderNumber in response', data);
        throw new Error('No order number returned from server');
      }
      console.log('[POS/complete]', 'kiosk.postOrderAndComplete order created', { orderId: data.id, orderNumber: data.orderNumber });

      // v2.7.39 — mark the order as completed so it flips from 'open'
      // to 'completed' in Postgres, fires the Kafka order.completed
      // event for dashboard revenue + ClickHouse ingestion, and shows
      // up in Close Till / EOD. Before v2.7.39 the kiosk just created
      // the order and moved on; every kiosk order stayed 'open' until
      // someone manually clicked "Mark as Paid" on the detail screen.
      const paidTotal = orderPayload.lines.reduce(
        (sum, l) => sum + l.quantity * l.unitPrice,
        0,
      );
      console.log('[POS/complete]', 'kiosk.postOrderAndComplete → POST /complete', { orderId: data.id, paidTotal, paymentMethod: method });
      const completeRes = await fetch(`${apiBase}/api/v1/orders/${data.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          paidTotal,
          changeGiven: 0,
          paymentMethod: method === 'card' ? 'Card' : method === 'cash' ? 'Cash' : 'QR',
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!completeRes.ok && completeRes.status !== 409) {
        // Log but don't fail the UX — the kiosk customer is about to see
        // the confirmation screen and walk away. Staff can reconcile from
        // the orders page if this keeps happening.
        console.error('[POS/complete]', 'kiosk.postOrderAndComplete /complete FAILED:', completeRes.status, await completeRes.text().catch(() => ''));
      } else {
        console.log('[POS/complete]', 'kiosk.postOrderAndComplete /complete OK', { orderId: data.id, status: completeRes.status });
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
    cardExtrasRef.current = null;
    setProcessing(false);
    router.replace('/(kiosk)/confirmation');
  }

  async function handlePay() {
    // v2.7.40 — Card payments now drive the ANZ Worldline TIM API via
    // the shared AnzPaymentModal. Kiosks typically share a till with
    // staff on-site; card-present transactions require the till to be
    // open (the bridge rejects otherwise) so we bail with a friendly
    // staff-facing message if it isn't.
    if (selected === 'card') {
      if (!tillOpen) {
        Alert.alert(
          'Till Not Open',
          'Staff: please open the till before taking card payments.',
          [{ text: 'OK' }],
        );
        return;
      }
      setAnzAmount(total);
      setAnzRefId(`KIOSK-${Date.now()}`);
      setShowAnzModal(true);
      return;
    }

    // Cash / QR — legacy stub flow (no terminal involved).
    cardExtrasRef.current = null;
    await postOrderAndComplete(selected);
  }

  // ── ANZ payment modal result handlers ───────────────────────────
  function handleAnzApproved(result: AnzPaymentResult) {
    setShowAnzModal(false);
    cardExtrasRef.current = {
      cardType:           result.cardType,
      cardLast4:          result.cardLast4,
      authCode:           result.authCode,
      rrn:                result.rrn,
      anzCustomerReceipt: result.customerReceipt,
      anzMerchantReceipt: result.merchantReceipt,
    };
    // Fire-and-forget — postOrderAndComplete already manages its own
    // processing state + error UI.
    void postOrderAndComplete('card');
  }

  function handleAnzDeclined(result: AnzPaymentResult) {
    setShowAnzModal(false);
    cardExtrasRef.current = null;
    Alert.alert(
      'Card Declined',
      result.declineReason || 'The card was declined by the bank. Please try another payment method.',
      [{ text: 'OK' }],
    );
  }

  function handleAnzCancelled() {
    setShowAnzModal(false);
    cardExtrasRef.current = null;
    // Quiet return to picker — cancellation is expected user behavior.
  }

  function handleAnzError(message: string) {
    setShowAnzModal(false);
    cardExtrasRef.current = null;
    Alert.alert(
      'EFTPOS Error',
      message || 'Unable to process the card payment. Please try again or choose another method.',
      [{ text: 'OK' }],
    );
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

      {/* ═══ ANZ Worldline TIM Payment Modal ═══ */}
      <AnzPaymentModal
        visible={showAnzModal}
        amount={anzAmount}
        referenceId={anzRefId}
        title="Card Payment"
        onApproved={handleAnzApproved}
        onDeclined={handleAnzDeclined}
        onCancelled={handleAnzCancelled}
        onError={handleAnzError}
      />
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
