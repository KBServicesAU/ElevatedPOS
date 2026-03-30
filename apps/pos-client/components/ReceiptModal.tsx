import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { posApiFetch } from '../lib/api';
import type { CompletedOrder, PaymentMethod } from '../app/payment';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card / EFTPOS',
  gift_card: 'Gift Card',
  bnpl: 'BNPL',
};

const METHOD_EMOJIS: Record<PaymentMethod, string> = {
  cash: '💵',
  card: '💳',
  gift_card: '🎁',
  bnpl: '📱',
};

interface ReceiptModalProps {
  order: CompletedOrder;
  onNewSale: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReceiptModal({ order, onNewSale }: ReceiptModalProps) {
  const [emailMode, setEmailMode] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [printing, setPrinting] = useState(false);

  const discount = 0; // Placeholder — pass through order when discounts are wired

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await posApiFetch('/api/v1/hardware-bridge/print', {
        method: 'POST',
        body: JSON.stringify({
          type: 'receipt',
          orderNumber: order.orderNumber,
          items: order.items.map((i) => ({
            name: i.name,
            qty: i.qty,
            unitPrice: i.price,
            total: i.price * i.qty,
            modifiers: i.modifiers ?? [],
          })),
          subtotal: order.subtotal,
          tax: order.tax,
          discount,
          total: order.total,
          tenders: order.tenders.map((t) => ({
            method: t.method,
            amount: t.amount,
          })),
          change: order.change,
        }),
      });
      Alert.alert('Sent to Printer', 'Receipt sent to printer successfully.');
    } catch {
      Alert.alert('Print Failed', 'Could not connect to the printer. Please try again.');
    } finally {
      setPrinting(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailAddress.trim()) return;
    setEmailSending(true);
    try {
      await posApiFetch('/api/v1/notifications/email', {
        method: 'POST',
        body: JSON.stringify({
          to: emailAddress.trim(),
          subject: `Receipt — Order ${order.orderNumber}`,
          type: 'receipt',
          data: {
            orderNumber: order.orderNumber,
            items: order.items,
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            tenders: order.tenders,
            change: order.change,
          },
        }),
      });
      setEmailSent(true);
    } catch {
      Alert.alert('Failed to Send', 'Could not send email receipt. Please check the address and try again.');
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent={false}>
      <SafeAreaView style={r.root}>
        {/* Header */}
        <View style={r.header}>
          <View style={r.successBadge}>
            <Text style={r.successIcon}>✓</Text>
          </View>
          <Text style={r.orderNumber}>{order.orderNumber}</Text>
          <Text style={r.headerLabel}>Sale Complete</Text>
        </View>

        <ScrollView style={r.scroll} contentContainerStyle={r.scrollContent}>
          {/* Divider */}
          <View style={r.divider} />

          {/* Items */}
          <View style={r.section}>
            <Text style={r.sectionTitle}>Items</Text>
            {order.items.map((item, idx) => (
              <View key={`${item.id}-${idx}`} style={r.itemRow}>
                <Text style={r.itemQtyName}>
                  {item.qty} × {item.name}
                </Text>
                <Text style={r.itemTotal}>${(item.price * item.qty).toFixed(2)}</Text>
              </View>
            ))}
          </View>

          <View style={r.divider} />

          {/* Totals */}
          <View style={r.section}>
            <View style={r.totalRow}>
              <Text style={r.totalLabel}>Subtotal</Text>
              <Text style={r.totalValue}>${order.subtotal.toFixed(2)}</Text>
            </View>
            <View style={r.totalRow}>
              <Text style={r.totalLabel}>GST (10%)</Text>
              <Text style={r.totalValue}>${order.tax.toFixed(2)}</Text>
            </View>
            {discount > 0 && (
              <View style={r.totalRow}>
                <Text style={[r.totalLabel, { color: '#4ade80' }]}>Discount</Text>
                <Text style={[r.totalValue, { color: '#4ade80' }]}>
                  −${discount.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={[r.totalRow, r.totalFinalRow]}>
              <Text style={r.totalFinalLabel}>Total Paid</Text>
              <Text style={r.totalFinalValue}>${order.total.toFixed(2)}</Text>
            </View>
          </View>

          {/* Payment breakdown */}
          <View style={r.divider} />
          <View style={r.section}>
            <Text style={r.sectionTitle}>Payment</Text>
            {order.tenders.map((t) => (
              <View key={t.id} style={r.payRow}>
                <Text style={r.payMethod}>
                  {METHOD_EMOJIS[t.method]} {METHOD_LABELS[t.method]}
                  {t.bnplProvider
                    ? ` (${t.bnplProvider === 'afterpay' ? 'Afterpay' : 'Zip'})`
                    : ''}
                  {t.giftCardCode ? ` ···${t.giftCardCode.slice(-4)}` : ''}
                </Text>
                <Text style={r.payAmount}>${t.amount.toFixed(2)}</Text>
              </View>
            ))}
            {order.change > 0 && (
              <View style={[r.payRow, r.changeRow]}>
                <Text style={r.changeLabel}>Change Given</Text>
                <Text style={r.changeValue}>${order.change.toFixed(2)}</Text>
              </View>
            )}
          </View>

          <View style={r.divider} />

          {/* Email receipt */}
          <View style={r.section}>
            <Text style={r.sectionTitle}>Email Receipt</Text>
            {emailSent ? (
              <View style={r.emailSentBox}>
                <Text style={r.emailSentText}>✓ Receipt sent to {emailAddress}</Text>
              </View>
            ) : emailMode ? (
              <View style={r.emailRow}>
                <TextInput
                  style={r.emailInput}
                  placeholder="customer@example.com"
                  placeholderTextColor="#4b5563"
                  value={emailAddress}
                  onChangeText={setEmailAddress}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[r.emailSendBtn, emailSending && { opacity: 0.6 }]}
                  onPress={handleSendEmail}
                  disabled={emailSending || !emailAddress.trim()}
                >
                  {emailSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={r.emailSendBtnText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={r.emailToggleBtn}
                onPress={() => setEmailMode(true)}
              >
                <Text style={r.emailToggleBtnText}>✉ Enter email address</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* Footer actions */}
        <View style={r.footer}>
          <TouchableOpacity
            style={[r.printBtn, printing && { opacity: 0.6 }]}
            onPress={handlePrint}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator size="small" color="#60a5fa" />
            ) : (
              <Text style={r.printBtnText}>🖨 Print Receipt</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={r.newSaleBtn} onPress={onNewSale}>
            <Text style={r.newSaleBtnText}>New Sale</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const r = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 8,
  },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4ade8022',
    borderWidth: 2,
    borderColor: '#4ade80',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successIcon: { fontSize: 36, color: '#4ade80', fontWeight: '800' },
  orderNumber: { fontSize: 24, fontWeight: '800', color: '#f1f5f9', letterSpacing: 1 },
  headerLabel: { fontSize: 14, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  divider: {
    height: 1,
    backgroundColor: '#0f3460',
    marginHorizontal: 16,
    marginVertical: 4,
  },
  section: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemQtyName: { flex: 1, fontSize: 14, color: '#cbd5e1' },
  itemTotal: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, color: '#64748b' },
  totalValue: { fontSize: 14, color: '#94a3b8' },
  totalFinalRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    marginTop: 4,
  },
  totalFinalLabel: { fontSize: 16, fontWeight: '700', color: '#f1f5f9' },
  totalFinalValue: { fontSize: 20, fontWeight: '800', color: '#4ade80' },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payMethod: { fontSize: 14, color: '#94a3b8', flex: 1 },
  payAmount: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  changeRow: {
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  changeLabel: { fontSize: 14, color: '#86efac' },
  changeValue: { fontSize: 16, fontWeight: '700', color: '#4ade80' },
  emailRow: { flexDirection: 'row', gap: 8 },
  emailInput: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  emailSendBtn: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e40af',
    minWidth: 60,
    alignItems: 'center',
  },
  emailSendBtnText: { color: '#93c5fd', fontWeight: '600', fontSize: 14 },
  emailToggleBtn: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  emailToggleBtnText: { color: '#64748b', fontSize: 14 },
  emailSentBox: {
    backgroundColor: '#052e1644',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#166534',
  },
  emailSentText: { color: '#4ade80', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    gap: 10,
  },
  printBtn: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0f3460',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  printBtnText: { color: '#93c5fd', fontSize: 15, fontWeight: '600' },
  newSaleBtn: {
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  newSaleBtnText: { fontSize: 17, fontWeight: '800', color: '#052e16' },
});
