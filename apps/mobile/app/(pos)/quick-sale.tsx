import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { usePrinterStore } from '../../store/printers';
import { usePosStore } from '../../store/pos';
import { confirm, toast } from '../../components/ui';
import {
  connectPrinter,
  isConnected as isPrinterConnected,
  printSaleReceipts,
} from '../../lib/printer';
import { initTyro, isTyroInitialized, tyroPurchase } from '../../modules/tyro-tta';
import { useTyroStore } from '../../store/tyro';
import {
  TyroTransactionModal,
  type TyroTransactionOutcome,
} from '../../components/TyroTransactionModal';

const KEYS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

const QUICK_AMOUNTS = [5, 10, 20, 50, 100];

/**
 * Quick Sale — lets the cashier charge an arbitrary amount (tips, service
 * fees, custom items) without selecting a product. Tax-inclusive.
 */
export default function QuickSaleScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const authEmployee = useAuthStore((s) => s.employee);
  const authToken = useAuthStore((s) => s.employeeToken);
  const printerConfig = usePrinterStore((s) => s.config);
  const customerId = usePosStore((s) => s.customerId);

  const [amountStr, setAmountStr] = useState('0');
  const [description, setDescription] = useState('');
  const [charging, setCharging] = useState(false);

  // Payment method modal
  const [showPayment, setShowPayment] = useState(false);
  const [cashTendered, setCashTendered] = useState('');

  // Tyro transaction modal
  const [showTyroModal, setShowTyroModal] = useState(false);
  const tyroConfig = useTyroStore((s) => s.config);

  const amount = parseFloat(amountStr) || 0;
  const canCharge = amount > 0;

  // AU GST is inclusive — amount entered is already tax-inclusive
  const gst = amount / 11;
  const ex = amount - gst;

  const pressKey = useCallback((key: string) => {
    setAmountStr((prev) => {
      if (key === '⌫') {
        if (prev.length <= 1) return '0';
        const next = prev.slice(0, -1);
        return next === '' || next === '-' ? '0' : next;
      }
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev + '.';
      }
      if (prev === '0') return key;
      const dotIdx = prev.indexOf('.');
      if (dotIdx !== -1 && prev.length - dotIdx > 2) return prev;
      return prev + key;
    });
  }, []);

  function setPreset(a: number) {
    setAmountStr(a.toFixed(2));
  }

  function reset() {
    setAmountStr('0');
    setDescription('');
    setCashTendered('');
  }

  // Auto-init Tyro if configured
  React.useEffect(() => {
    if (tyroConfig.autoInit && tyroConfig.apiKey && !isTyroInitialized()) {
      try {
        initTyro(tyroConfig.apiKey, tyroConfig.environment);
      } catch (err) {
        console.warn('[QuickSale] Tyro auto-init failed:', err);
      }
    }
  }, [tyroConfig.apiKey, tyroConfig.environment, tyroConfig.autoInit]);

  async function saveOrderToServer(): Promise<{ orderNumber: string; orderId: string }> {
    const base = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';
    const token = authToken ?? identity?.deviceToken ?? '';
    const label = description.trim() || 'Quick Sale';
    const body = {
      locationId: identity?.locationId,
      registerId: identity?.registerId || undefined,
      channel: 'pos' as const,
      orderType: 'retail' as const,
      lines: [
        {
          productId: `qs-${Date.now()}`,
          name: label,
          quantity: 1,
          unitPrice: amount,
          costPrice: 0,
          taxRate: 10,
        },
      ],
      ...(customerId ? { customerId } : {}),
    };

    const res = await fetch(`${base}/api/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Order creation failed with status ${res.status}`);
    }
    const data = await res.json();
    if (!data?.orderNumber) {
      throw new Error('No order number returned from server');
    }
    return { orderNumber: data.orderNumber as string, orderId: data.id as string };
  }

  /**
   * v2.7.39 — mark the freshly-created order as completed on the server
   * so it stops appearing as 'open' in the orders list and counts
   * towards dashboard revenue + EOD. Before this fix Quick Sale just
   * called POST /orders and never called /complete, so every Quick
   * Sale order stayed 'open' until someone manually flipped it via
   * the Mark as Paid button.
   *
   * Mirrors the retry + error-visibility pattern in sell.tsx's
   * handleCharge so a transient blip doesn't silently leave the order
   * open — the operator gets a toast telling them to reconcile.
   */
  async function markOrderCompleted(
    orderId: string,
    paidTotal: number,
    changeGiven: number,
    paymentMethod: string,
    token: string,
    base: string,
  ): Promise<boolean> {
    const body = JSON.stringify({ paidTotal, changeGiven, paymentMethod });
    let completeErr: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${base}/api/v1/orders/${orderId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body,
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) return true;
        // 409 — already completed (double-submit) — treat as success.
        if (res.status === 409) return true;
        const errBody = await res.json().catch(() => ({})) as { detail?: string; message?: string; title?: string };
        completeErr = errBody.detail ?? errBody.message ?? errBody.title ?? `HTTP ${res.status}`;
      } catch (err) {
        completeErr = err instanceof Error ? err.message : String(err);
      }
    }
    if (completeErr) console.error('[QuickSale] /complete failed:', orderId, completeErr);
    return false;
  }

  async function printReceiptIfConfigured(
    orderNumber: string,
    paymentMethod: string,
    changeDue: number,
    tendered?: number,
  ) {
    if (!printerConfig.autoPrint || !printerConfig.type) return;
    try {
      if (!isPrinterConnected()) await connectPrinter();
      const label = description.trim() || 'Quick Sale';
      await printSaleReceipts({
        store: {
          name: identity?.label || 'ElevatedPOS',
        },
        order: {
          orderNumber,
          registerLabel: identity?.registerId ?? undefined,
          cashierName: authEmployee
            ? `${authEmployee.firstName} ${authEmployee.lastName}`
            : undefined,
          orderedAt: new Date(),
        },
        items: [
          {
            name: label,
            qty: 1,
            unitPrice: amount,
            lineTotal: amount,
          },
        ],
        totals: {
          subtotalExGst: +ex.toFixed(2),
          gst: +gst.toFixed(2),
          total: amount,
        },
        payment: {
          method: paymentMethod,
          tendered: tendered ?? amount,
          changeGiven: changeDue > 0 ? changeDue : undefined,
        },
        traceId: orderNumber,
      });
    } catch (err) {
      console.warn('[QuickSale] Receipt print failed:', err);
    }
  }

  async function finalise(paymentMethod: string, changeDue: number = 0, tendered?: number) {
    setCharging(true);
    try {
      const { orderNumber, orderId } = await saveOrderToServer();

      // v2.7.39 — mark completed so it counts towards dashboard revenue
      // + EOD and stops showing as 'open' in the orders list.
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';
      const token = authToken ?? identity?.deviceToken ?? '';
      const completed = await markOrderCompleted(
        orderId,
        amount,
        changeDue,
        paymentMethod,
        token,
        base,
      );
      if (!completed) {
        toast.warning(
          'Order still open',
          'Sale was recorded but the server did not mark it complete. Go to Orders to reconcile.',
        );
      }

      await printReceiptIfConfigured(orderNumber, paymentMethod, changeDue, tendered);
      const msg =
        changeDue > 0
          ? `Order #${orderNumber} — $${amount.toFixed(2)} · Change $${changeDue.toFixed(2)}`
          : `Order #${orderNumber} — $${amount.toFixed(2)}`;
      const newSale = await confirm({
        title: 'Order Placed',
        description: msg,
        confirmLabel: 'New Sale',
        cancelLabel: 'Done',
        variant: 'success',
      });
      if (newSale) {
        reset();
      } else {
        reset();
        router.back();
      }
    } finally {
      setCharging(false);
    }
  }

  function handleChargeButton() {
    if (!canCharge) return;
    setShowPayment(true);
  }

  function handlePayCash() {
    const tendered = parseFloat(cashTendered) || 0;
    if (tendered < amount) {
      toast.warning('Insufficient', `Need at least $${amount.toFixed(2)}`);
      return;
    }
    const change = tendered - amount;
    setShowPayment(false);
    setCashTendered('');
    finalise('Cash', change, tendered);
  }

  function handlePayCard() {
    setShowPayment(false);
    if (isTyroInitialized()) {
      setShowTyroModal(true);
      const amountCents = String(Math.round(amount * 100));
      try {
        tyroPurchase(amountCents, {
          integratedReceipt: tyroConfig.integratedReceipts,
          enableSurcharge: tyroConfig.enableSurcharge,
          transactionId: `QS-${Date.now()}`,
        });
      } catch (err) {
        setShowTyroModal(false);
        toast.error(
          'EFTPOS Error',
          err instanceof Error ? err.message : 'Failed to start Tyro transaction.',
        );
      }
      return;
    }
    // Fallback: demo mode
    finalise('Card');
  }

  function handleTyroComplete(outcomeEvent: TyroTransactionOutcome) {
    setShowTyroModal(false);
    const outcome = String(outcomeEvent.result.result || '').toUpperCase();
    if (outcome === 'APPROVED') {
      finalise('Card');
      return;
    }
    if (outcome === 'CANCELLED') {
      toast.warning('Payment Cancelled', 'The EFTPOS transaction was cancelled.');
      return;
    }
    if (outcome === 'DECLINED') {
      toast.error('Card Declined', 'The card was declined. Try another payment method.');
      return;
    }
    toast.warning('Payment Incomplete', `Transaction ended with status "${outcomeEvent.result.result}".`);
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#ccc" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Quick Sale</Text>
        <TouchableOpacity onPress={reset} style={s.resetBtn} activeOpacity={0.7}>
          <Ionicons name="refresh" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        {/* Amount display */}
        <View style={s.amountDisplay}>
          <Text style={s.amountCurrency}>$</Text>
          <Text style={s.amountValue} adjustsFontSizeToFit numberOfLines={1}>
            {amountStr}
          </Text>
        </View>

        {/* Quick presets */}
        <View style={s.presets}>
          {QUICK_AMOUNTS.map((a) => (
            <TouchableOpacity
              key={a}
              style={s.presetBtn}
              onPress={() => setPreset(a)}
              activeOpacity={0.7}
            >
              <Text style={s.presetText}>${a}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description */}
        <View style={s.descBox}>
          <Ionicons name="create-outline" size={16} color="#555" />
          <TextInput
            style={s.descInput}
            placeholder="Description (optional)"
            placeholderTextColor="#444"
            value={description}
            onChangeText={setDescription}
            maxLength={80}
            returnKeyType="done"
          />
          {description.length > 0 && (
            <TouchableOpacity onPress={() => setDescription('')}>
              <Ionicons name="close-circle" size={16} color="#555" />
            </TouchableOpacity>
          )}
        </View>

        {/* Calculator pad */}
        <View style={s.pad}>
          {KEYS.map((row, ri) => (
            <View key={ri} style={s.padRow}>
              {row.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[s.padKey, key === '⌫' && s.padKeyBack]}
                  onPress={() => pressKey(key)}
                  activeOpacity={0.6}
                >
                  {key === '⌫' ? (
                    <Ionicons name="backspace-outline" size={24} color="#888" />
                  ) : (
                    <Text style={s.padKeyText}>{key}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* Tax note + Charge */}
        {canCharge && (
          <View style={s.taxNote}>
            <Text style={s.taxNoteText}>
              Incl. GST ${gst.toFixed(2)}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[s.chargeBtn, (!canCharge || charging) && s.chargeBtnOff]}
          onPress={handleChargeButton}
          disabled={!canCharge || charging}
          activeOpacity={0.85}
        >
          {charging ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="flash" size={18} color="#fff" />
              <Text style={s.chargeText}>
                {canCharge ? `Charge $${amount.toFixed(2)}` : 'Enter Amount'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Payment modal (inline) */}
      {showPayment && (
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={() => setShowPayment(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Payment — ${amount.toFixed(2)}</Text>
              <TouchableOpacity style={s.modalPayBtn} onPress={handlePayCard} activeOpacity={0.85}>
                <Ionicons name="card" size={18} color="#fff" />
                <Text style={s.modalPayText}>Card / EFTPOS</Text>
              </TouchableOpacity>
              <Text style={s.modalLabel}>Cash Tendered</Text>
              <TextInput
                style={s.modalInput}
                value={cashTendered}
                onChangeText={setCashTendered}
                keyboardType="decimal-pad"
                placeholder={`$${amount.toFixed(2)}`}
                placeholderTextColor="#444"
              />
              {cashTendered && parseFloat(cashTendered) >= amount && (
                <Text style={s.modalChange}>
                  Change: ${(parseFloat(cashTendered) - amount).toFixed(2)}
                </Text>
              )}
              <TouchableOpacity
                style={[s.modalPayBtn, { backgroundColor: '#22c55e' }]}
                onPress={handlePayCash}
                activeOpacity={0.85}
              >
                <Ionicons name="cash" size={18} color="#fff" />
                <Text style={s.modalPayText}>Pay Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => setShowPayment(false)}
                activeOpacity={0.7}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Tyro EFTPOS modal */}
      <TyroTransactionModal
        visible={showTyroModal}
        amount={amount}
        title="Card Payment"
        onComplete={handleTyroComplete}
        onClose={() => setShowTyroModal(false)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
    backgroundColor: '#0d0d14',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  resetBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  amountDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  amountCurrency: {
    fontSize: 34,
    color: '#555',
    fontWeight: '300',
    marginBottom: 10,
  },
  amountValue: {
    fontSize: 68,
    fontWeight: '900',
    color: '#fff',
    minWidth: 80,
    textAlign: 'center',
  },

  presets: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  presetText: { color: '#ccc', fontSize: 14, fontWeight: '700' },

  descBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#141425',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 14,
  },
  descInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#fff',
  },

  pad: {
    flex: 1,
    gap: 8,
    marginBottom: 10,
  },
  padRow: { flexDirection: 'row', gap: 8, flex: 1 },
  padKey: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  padKeyBack: { backgroundColor: '#0d0d14' },
  padKeyText: { fontSize: 26, fontWeight: '600', color: '#fff' },

  taxNote: { alignItems: 'center', paddingVertical: 4, marginBottom: 8 },
  taxNoteText: { color: '#666', fontSize: 12 },

  chargeBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  chargeBtnOff: { backgroundColor: '#1e1e2e', shadowOpacity: 0, elevation: 0 },
  chargeText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  // Modal
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    width: 340,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalPayBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  modalPayText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  modalLabel: { color: '#888', fontSize: 12, marginBottom: 6, marginTop: 6 },
  modalInput: {
    backgroundColor: '#0d0d14',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    color: '#fff',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 8,
  },
  modalChange: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalCancel: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  modalCancelText: { color: '#666', fontSize: 14 },
});
