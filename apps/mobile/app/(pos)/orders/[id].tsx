import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useDeviceStore } from '../../../store/device';
import { useAuthStore } from '../../../store/auth';
import { useTillStore } from '../../../store/till';
import { usePrinterStore } from '../../../store/printers';
import { toast, confirm } from '../../../components/ui';
import { useAnzBridge, type AnzTransactionResult } from '../../../components/AnzBridgeHost';
import {
  printSaleReceipts,
  printRefundReceiptDetailed,
  printRawAnzReceipt,
  connectPrinter,
  isConnected as isPrinterConnected,
  type ReceiptLine,
  type PrintReceiptOpts,
} from '../../../lib/printer';

/**
 * Order detail (v2.7.27).
 *
 * The orders list links here so an operator can:
 *   - See the full itemised order, totals, payment, and refund history
 *   - Reprint the receipt (flagged "*** REPRINT ***")
 *   - Refund the order via the persistent ANZ bridge
 *   - Reverse a same-shift card transaction
 *   - Edit internal notes (read-only until the backend PATCH endpoint ships)
 */

const API_BASE =
  process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4004';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface OrderLine {
  id: string;
  name: string;
  sku?: string | null;
  quantity: number | string;
  unitPrice: number | string;
  taxRate?: number | string;
  taxAmount?: number | string;
  discountAmount?: number | string;
  lineTotal: number | string;
  modifiers?: { name: string; priceAdjustment?: number }[];
  notes?: string | null;
  seatNumber?: number | null;
}

interface RefundRecord {
  id: string;
  refundNumber: string;
  reason: string;
  totalAmount: number | string;
  refundMethod: string;
  processedAt: string;
  createdAt?: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  orderType: string;
  subtotal: number | string;
  discountTotal?: number | string;
  taxTotal: number | string;
  total: number | string;
  paidTotal?: number | string;
  changeGiven?: number | string;
  paymentMethod?: string | null;
  notes?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  locationId?: string;
  registerId?: string | null;
  employeeId?: string;
  lines: OrderLine[];
  refunds?: RefundRecord[];
}

interface PaymentRecord {
  id: string;
  method?: string;
  amount?: number | string;
  cardLast4?: string;
  cardType?: string;
  acquirerTransactionId?: string;
  authCode?: string;
  rrn?: string;
  createdAt?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function money(n: number | string | null | undefined): string {
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  return `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
}

function toNum(n: number | string | null | undefined): number {
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function statusColour(s: string): string {
  if (s === 'completed' || s === 'paid') return '#22c55e';
  if (s === 'partially_refunded' || s === 'pending' || s === 'open') return '#f59e0b';
  if (s === 'cancelled' || s === 'refunded' || s === 'reversed') return '#ef4444';
  return '#888';
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const orderId = params.id;
  const identity = useDeviceStore((s) => s.identity);
  const authEmployee = useAuthStore((s) => s.employee);
  const employeeToken = useAuthStore((s) => s.employeeToken);
  const tillOpenedAt = useTillStore((s) => s.openedAt);
  const bridge = useAnzBridge();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>('');

  const [showRefund, setShowRefund] = useState(false);
  const [anzBusy, setAnzBusy] = useState(false);
  const [reprinting, setReprinting] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  const token = employeeToken ?? identity?.deviceToken ?? '';

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/orders/${orderId}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        const o = (data.data ?? data) as OrderDetail;
        setOrder(o);
        setNotesDraft(o.notes ?? '');
      } else {
        const body = await res.text().catch(() => '');
        let errMsg = `Error ${res.status}`;
        try { const j = JSON.parse(body); errMsg = j.message ?? j.detail ?? j.title ?? errMsg; } catch { /* ignore */ }
        setError(errMsg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load order');
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  // Fetch the backing payment row so we can surface the card last4 +
  // acquirer transaction id (used for reversal). Best-effort — if the
  // payments service isn't reachable the UI just hides the card info
  // rather than blocking the page.
  const loadPayment = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/payments?orderId=${orderId}&limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const first = (data.data ?? [])[0] as PaymentRecord | undefined;
        setPayment(first ?? null);
      }
    } catch { /* ignore */ }
  }, [orderId, token]);

  useEffect(() => {
    loadOrder();
    loadPayment();
  }, [loadOrder, loadPayment]);

  /* ------------------------------------------------------------------ */
  /* Derived state                                                       */
  /* ------------------------------------------------------------------ */

  const alreadyRefunded = useMemo(() => {
    if (!order?.refunds) return 0;
    return order.refunds.reduce((s, r) => s + toNum(r.totalAmount), 0);
  }, [order]);

  const refundableBalance = Math.max(0, toNum(order?.total) - alreadyRefunded);
  const orderTotalNum = toNum(order?.total);
  const orderGstNum = toNum(order?.taxTotal);

  const isCardPaid = !!(
    payment?.method?.toLowerCase().includes('card') ||
    (order?.paymentMethod ?? '').toLowerCase().includes('card') ||
    payment?.cardLast4
  );

  // Reversal is only offered when:
  //   - the order was paid by card
  //   - the order was created in the current (still-open) till shift
  //   - the bridge has a live connection (till open on the terminal)
  //   - no refund has been recorded yet (refunds + reversals are exclusive)
  const withinShift = useMemo(() => {
    if (!order || !tillOpenedAt) return false;
    try {
      return new Date(order.createdAt).getTime() >= new Date(tillOpenedAt).getTime();
    } catch {
      return false;
    }
  }, [order, tillOpenedAt]);

  const canRefund = !!order
    && (order.status === 'completed' || order.status === 'partially_refunded' || order.status === 'paid')
    && refundableBalance > 0.005;

  const canReverse = !!order
    && isCardPaid
    && withinShift
    && alreadyRefunded === 0
    && (bridge.state === 'open' || bridge.state === 'transacting')
    && order.status !== 'reversed'
    && order.status !== 'cancelled';

  /* ------------------------------------------------------------------ */
  /* Reprint                                                             */
  /* ------------------------------------------------------------------ */

  const buildReceiptOpts = useCallback((): PrintReceiptOpts | null => {
    if (!order) return null;
    // Items ← order lines, with unit + line totals and modifier metadata.
    const items: ReceiptLine[] = order.lines.map((l) => ({
      name: l.name,
      qty: toNum(l.quantity),
      unitPrice: toNum(l.unitPrice),
      lineTotal: toNum(l.lineTotal),
      discountAmount: toNum(l.discountAmount) || undefined,
      note: l.notes ?? undefined,
      modifiers: Array.isArray(l.modifiers)
        ? l.modifiers.map((m) => ({ name: m.name, priceAdjustment: Number(m.priceAdjustment ?? 0) }))
        : undefined,
      seat: l.seatNumber ?? undefined,
    }));

    const subtotalExGst = +(toNum(order.total) - toNum(order.taxTotal)).toFixed(2);

    return {
      store: {
        name: identity?.label || 'ElevatedPOS',
        ...(identity?.label ? { branch: identity.label } : {}),
        ...(identity?.registerId ? { device: identity.registerId } : {}),
      },
      order: {
        orderNumber: order.orderNumber,
        registerLabel: identity?.registerId ?? undefined,
        cashierName: authEmployee ? `${authEmployee.firstName} ${authEmployee.lastName}` : undefined,
        customerName: order.customerName ?? undefined,
        orderedAt: new Date(order.createdAt),
      },
      items,
      totals: {
        subtotalExGst,
        gst: toNum(order.taxTotal),
        total: toNum(order.total),
      },
      payment: {
        method: order.paymentMethod ?? payment?.method ?? 'Payment',
        ...(payment?.cardType ? { cardType: payment.cardType } : {}),
        ...(payment?.cardLast4 ? { cardLast4: payment.cardLast4 } : {}),
        ...(payment?.authCode ? { authCode: payment.authCode } : {}),
        ...(payment?.rrn ? { rrn: payment.rrn } : {}),
      },
    };
  }, [order, payment, identity, authEmployee]);

  async function handleReprint() {
    const opts = buildReceiptOpts();
    if (!opts) return;
    setReprinting(true);
    try {
      const printerConfig = usePrinterStore.getState().config;
      if (!printerConfig.type) {
        toast.warning('No printer configured', 'Add a printer in Settings first.');
        return;
      }
      if (!isPrinterConnected()) await connectPrinter();
      await printSaleReceipts({
        ...opts,
        order: { ...opts.order, reprint: true },
      });
      toast.success('Receipt reprinted', `Order #${order!.orderNumber}`);
    } catch (err) {
      toast.error('Reprint failed', err instanceof Error ? err.message : String(err));
    } finally {
      setReprinting(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Mark as Paid (reconcile a stuck 'open' order — v2.7.33)             */
  /* ------------------------------------------------------------------ */
  // Before v2.7.33, the POS's /complete call could silently fail (fetch
  // doesn't throw on 4xx/5xx and we had no res.ok check), leaving the
  // order stuck in 'open' even though the card was charged. This action
  // fires /complete again from the detail screen so staff can self-serve
  // reconcile without touching the DB.
  const [marking, setMarking] = useState(false);
  async function markAsPaid() {
    if (!order) return;
    if (order.status !== 'open') return;
    const ok = await confirm({
      title: 'Mark as Paid',
      description:
        'Only use this if the customer was actually charged but the order never closed. It will be added to today\'s sales and EOD.',
      confirmLabel: 'Mark as Paid',
    });
    if (!ok) return;
    setMarking(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/orders/${order.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          paidTotal: toNum(order.total),
          changeGiven: 0,
          paymentMethod: 'Unknown',
        }),
      });
      if (res.status === 409) {
        toast.success('Already completed', 'This order was already closed.');
      } else if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { message?: string; detail?: string };
        throw new Error(errBody.detail ?? errBody.message ?? `HTTP ${res.status}`);
      } else {
        toast.success('Marked as paid', 'The order now counts towards today\'s sales.');
      }
      await loadOrder();
    } catch (err) {
      toast.error('Could not complete', err instanceof Error ? err.message : String(err));
    } finally {
      setMarking(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Refund                                                              */
  /* ------------------------------------------------------------------ */

  async function confirmRefundFlow() {
    if (!order) return;
    const amountToRefund = refundableBalance;
    const ok = await confirm({
      title: 'Refund this order?',
      description:
        `$${amountToRefund.toFixed(2)} will be refunded to the card via the ANZ terminal.\n\n` +
        `The customer must present the card used for the original sale.`,
      confirmLabel: 'Start Refund',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    void runRefund(amountToRefund);
  }

  async function runRefund(amountDollars: number) {
    if (!order) return;
    setAnzBusy(true);
    setShowRefund(true);
    let bridgeResult: AnzTransactionResult | null = null;
    try {
      const amountCents = Math.round(amountDollars * 100);
      const refId = `POS-REFUND-${order.orderNumber}-${Date.now()}`;
      bridgeResult = await bridge.refund(amountCents, refId);

      // Record the refund on the backend (best-effort, matches the
      // existing schema already used by orders.tsx for Tyro refunds).
      const lines = order.lines && order.lines.length > 0
        ? order.lines.map((l) => ({
            orderLineId: l.id,
            quantity: toNum(l.quantity),
            amount: toNum(l.lineTotal),
          })).filter((l) => l.orderLineId)
        : [{ orderLineId: order.id, quantity: 1, amount: amountDollars }];

      try {
        await fetch(`${API_BASE}/api/v1/orders/${order.id}/refund`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            reason:
              `Card refund via ANZ — ref: ${bridgeResult.transactionRef ?? refId}` +
              (bridgeResult.authCode ? ` auth: ${bridgeResult.authCode}` : ''),
            refundMethod: 'original',
            lines,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch { /* offline — treat as success locally */ }

      // Print the refund receipt (customer + merchant copies) with the
      // ANZ receipts attached.
      try {
        const printerConfig = usePrinterStore.getState().config;
        if (printerConfig.type) {
          if (!isPrinterConnected()) await connectPrinter();
          const base = buildReceiptOpts();
          if (base) {
            await printRefundReceiptDetailed({
              ...base,
              originalOrderNumber: order.orderNumber,
              refundAmount: amountDollars,
              ...(bridgeResult.merchantReceipt ? { anzMerchantReceipt: bridgeResult.merchantReceipt } : {}),
              ...(bridgeResult.customerReceipt ? { anzCustomerReceipt: bridgeResult.customerReceipt } : {}),
            });
          }
        }
      } catch { /* print failed — don't block the refund success */ }

      toast.success('Refund Approved', `$${amountDollars.toFixed(2)} refunded via ANZ.`);
      await loadOrder();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Refund Failed', msg);
    } finally {
      setAnzBusy(false);
      setShowRefund(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Reversal                                                            */
  /* ------------------------------------------------------------------ */

  async function confirmReverseFlow() {
    if (!order) return;
    const ok = await confirm({
      title: 'Reverse this transaction?',
      description:
        `$${orderTotalNum.toFixed(2)} will be reversed on the terminal.\n\n` +
        `Only use this for same-shift card sales where the card has NOT left ` +
        `the customer's hands. Past today? Use Refund instead.`,
      confirmLabel: 'Reverse',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    void runReversal();
  }

  async function runReversal() {
    if (!order) return;
    setAnzBusy(true);
    let bridgeResult: AnzTransactionResult | null = null;
    try {
      const amountCents = Math.round(orderTotalNum * 100);
      bridgeResult = await bridge.reverse(amountCents, payment?.acquirerTransactionId ?? null);

      // Annotate the order so the reversal shows up in history.
      // There is currently no PATCH /:id endpoint on the orders service,
      // so we fall back to recording this as a full refund (preserves
      // refundableBalance accounting) with a note-style reason. When
      // the backend adds a proper PATCH route this can switch to a
      // single-call status update.
      const lines = order.lines && order.lines.length > 0
        ? order.lines.map((l) => ({
            orderLineId: l.id,
            quantity: toNum(l.quantity),
            amount: toNum(l.lineTotal),
          })).filter((l) => l.orderLineId)
        : [{ orderLineId: order.id, quantity: 1, amount: orderTotalNum }];
      try {
        await fetch(`${API_BASE}/api/v1/orders/${order.id}/refund`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            reason:
              `Reversal via ANZ terminal — ref: ${bridgeResult.transactionRef ?? 'N/A'}` +
              (bridgeResult.authCode ? ` auth: ${bridgeResult.authCode}` : ''),
            refundMethod: 'original',
            lines,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch { /* offline — treat as success locally */ }

      // Print a reversal receipt. Same layout as a refund receipt but
      // with the ANZ reversal receipts appended. We use the detailed
      // refund printer and let its banner say REFUND; then we also
      // print the ANZ receipts standalone so the reversal text is
      // explicit on paper.
      try {
        const printerConfig = usePrinterStore.getState().config;
        if (printerConfig.type) {
          if (!isPrinterConnected()) await connectPrinter();
          const base = buildReceiptOpts();
          if (base) {
            await printRefundReceiptDetailed({
              ...base,
              originalOrderNumber: order.orderNumber,
              refundAmount: orderTotalNum,
              ...(bridgeResult.merchantReceipt ? { anzMerchantReceipt: bridgeResult.merchantReceipt } : {}),
              ...(bridgeResult.customerReceipt ? { anzCustomerReceipt: bridgeResult.customerReceipt } : {}),
            });
          }
          // Also push the raw ANZ receipts (they'll typically say "REVERSAL"
          // at the top) so the reversal paperwork is unmistakable.
          if (bridgeResult.merchantReceipt) {
            await printRawAnzReceipt(bridgeResult.merchantReceipt, 'merchant');
          }
        }
      } catch { /* ignore */ }

      toast.success('Reversal Approved', `$${orderTotalNum.toFixed(2)} reversed via ANZ.`);
      await loadOrder();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Reversal Failed', msg);
    } finally {
      setAnzBusy(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  if (loading && !order) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Order', headerShown: false }} />
        <View style={s.center}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      </SafeAreaView>
    );
  }
  if (error || !order) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Order', headerShown: false }} />
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
            <Text style={s.backText}>Orders</Text>
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <Ionicons name="alert-circle" size={36} color="#ef4444" />
          <Text style={s.errorText}>{error ?? 'Order not found'}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={loadOrder}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const subtotalExGst = +(orderTotalNum - orderGstNum).toFixed(2);

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <Stack.Screen options={{ title: `Order #${order.orderNumber}`, headerShown: false }} />

      <View style={s.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
          <Text style={s.backText}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={loadOrder} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <Ionicons name="refresh" size={20} color="#888" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {/* ── Order header card ──────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.orderNumberBig}>#{order.orderNumber}</Text>
              <Text style={s.orderTimeBig}>
                {new Date(order.createdAt).toLocaleString('en-AU', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.orderTotalBig}>{money(order.total)}</Text>
              <View
                style={[
                  s.statusBadge,
                  {
                    backgroundColor: `${statusColour(order.status)}20`,
                    borderColor: `${statusColour(order.status)}40`,
                  },
                ]}
              >
                <Text style={[s.statusText, { color: statusColour(order.status) }]}>
                  {order.status}
                </Text>
              </View>
            </View>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaItem}>Channel · {order.channel}</Text>
            <Text style={s.metaItem}>Type · {order.orderType}</Text>
          </View>
        </View>

        {/* ── Customer ─────────────────────────────────────── */}
        {(order.customerName || order.customerEmail || order.customerPhone) && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Customer</Text>
            {order.customerName && <Text style={s.sectionBody}>{order.customerName}</Text>}
            {order.customerEmail && <Text style={s.sectionMuted}>{order.customerEmail}</Text>}
            {order.customerPhone && <Text style={s.sectionMuted}>{order.customerPhone}</Text>}
          </View>
        )}

        {/* ── Items ────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Items</Text>
          {order.lines.map((l) => {
            const qty = toNum(l.quantity);
            const unit = toNum(l.unitPrice);
            const lineTotal = toNum(l.lineTotal);
            return (
              <View key={l.id} style={s.itemBlock}>
                <View style={s.itemRow}>
                  <Text style={s.itemName}>
                    {qty}× {l.name}
                  </Text>
                  <Text style={s.itemTotal}>{money(lineTotal)}</Text>
                </View>
                <Text style={s.itemMuted}>
                  @ ${unit.toFixed(2)} ea
                  {toNum(l.discountAmount) > 0
                    ? `  ·  Discount -$${toNum(l.discountAmount).toFixed(2)}`
                    : ''}
                </Text>
                {Array.isArray(l.modifiers) && l.modifiers.length > 0 && (
                  <View style={s.modList}>
                    {l.modifiers.map((m, i) => (
                      <Text key={i} style={s.itemMuted}>
                        - {m.name}
                        {m.priceAdjustment
                          ? ` (${Number(m.priceAdjustment) >= 0 ? '+' : ''}$${Number(
                              m.priceAdjustment,
                            ).toFixed(2)})`
                          : ''}
                      </Text>
                    ))}
                  </View>
                )}
                {l.notes && <Text style={s.itemNote}>Note: {l.notes}</Text>}
              </View>
            );
          })}
        </View>

        {/* ── Totals ───────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Totals</Text>
          <View style={s.kvRow}>
            <Text style={s.kvKey}>Subtotal (ex GST)</Text>
            <Text style={s.kvVal}>{money(subtotalExGst)}</Text>
          </View>
          {toNum(order.discountTotal) > 0 && (
            <View style={s.kvRow}>
              <Text style={s.kvKey}>Discount</Text>
              <Text style={s.kvVal}>-{money(order.discountTotal)}</Text>
            </View>
          )}
          <View style={s.kvRow}>
            <Text style={s.kvKey}>GST</Text>
            <Text style={s.kvVal}>{money(order.taxTotal)}</Text>
          </View>
          <View style={[s.kvRow, s.kvRowTotal]}>
            <Text style={s.kvKeyBold}>Total</Text>
            <Text style={s.kvValBold}>{money(order.total)}</Text>
          </View>
          {alreadyRefunded > 0 && (
            <View style={s.kvRow}>
              <Text style={[s.kvKey, { color: '#ef4444' }]}>Refunded</Text>
              <Text style={[s.kvVal, { color: '#ef4444' }]}>-${alreadyRefunded.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* ── Payment ──────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Payment</Text>
          <View style={s.kvRow}>
            <Text style={s.kvKey}>Method</Text>
            <Text style={s.kvVal}>{order.paymentMethod ?? payment?.method ?? '—'}</Text>
          </View>
          {payment?.cardLast4 && (
            <View style={s.kvRow}>
              <Text style={s.kvKey}>Card</Text>
              <Text style={s.kvVal}>
                {payment.cardType ?? 'Card'} ****{payment.cardLast4}
              </Text>
            </View>
          )}
          {payment?.authCode && (
            <View style={s.kvRow}>
              <Text style={s.kvKey}>Auth</Text>
              <Text style={s.kvVal}>{payment.authCode}</Text>
            </View>
          )}
          {payment?.rrn && (
            <View style={s.kvRow}>
              <Text style={s.kvKey}>RRN</Text>
              <Text style={s.kvVal}>{payment.rrn}</Text>
            </View>
          )}
          {toNum(order.paidTotal) > 0 && (
            <View style={s.kvRow}>
              <Text style={s.kvKey}>Tendered</Text>
              <Text style={s.kvVal}>{money(order.paidTotal)}</Text>
            </View>
          )}
          {toNum(order.changeGiven) > 0 && (
            <View style={s.kvRow}>
              <Text style={s.kvKey}>Change</Text>
              <Text style={s.kvVal}>{money(order.changeGiven)}</Text>
            </View>
          )}
        </View>

        {/* ── Refund history ───────────────────────────────── */}
        {order.refunds && order.refunds.length > 0 && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Refund History</Text>
            {order.refunds.map((r) => (
              <View key={r.id} style={s.refundRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.refundNumber}>#{r.refundNumber}</Text>
                  <Text style={s.sectionMuted} numberOfLines={2}>
                    {r.reason}
                  </Text>
                </View>
                <Text style={s.refundAmount}>-{money(r.totalAmount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Notes ────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.notesHeader}>
            <Text style={s.sectionTitle}>Internal Notes</Text>
            {notesSaving && <ActivityIndicator size="small" color="#94a3b8" />}
          </View>
          <TextInput
            style={s.notesInput}
            value={notesDraft}
            onChangeText={setNotesDraft}
            editable={!notesSaving}
            multiline
            numberOfLines={4}
            placeholder="Add internal notes for this order (e.g. reason for discount, follow-up, …)"
            placeholderTextColor="#444"
          />
          <TouchableOpacity
            style={[
              s.actionBtn,
              { marginTop: 10 },
              (notesSaving || notesDraft === (order?.notes ?? '')) && { opacity: 0.5 },
            ]}
            disabled={notesSaving || notesDraft === (order?.notes ?? '')}
            activeOpacity={0.85}
            onPress={async () => {
              if (!order) return;
              setNotesSaving(true);
              try {
                const res = await fetch(`${API_BASE}/api/v1/orders/${order.id}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ notes: notesDraft }),
                });
                if (!res.ok) {
                  const msg = `Could not save notes (HTTP ${res.status})`;
                  toast.error('Save failed', msg);
                  return;
                }
                // Reflect the saved value so the "unchanged" check works.
                setOrder((prev) => (prev ? { ...prev, notes: notesDraft } : prev));
                toast.success('Notes saved', 'Internal notes updated.');
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                toast.error('Save failed', msg);
              } finally {
                setNotesSaving(false);
              }
            }}
          >
            <Ionicons name="save-outline" size={16} color="#6366f1" />
            <Text style={s.actionText}>
              {notesSaving ? 'Saving…' : 'Save Notes'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Actions ──────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Actions</Text>

          <TouchableOpacity
            style={[s.actionBtn, reprinting && { opacity: 0.6 }]}
            onPress={handleReprint}
            disabled={reprinting}
            activeOpacity={0.85}
          >
            {reprinting
              ? <ActivityIndicator size="small" color="#6366f1" />
              : <Ionicons name="print-outline" size={16} color="#6366f1" />}
            <Text style={s.actionText}>Reprint Receipt</Text>
          </TouchableOpacity>

          {/* v2.7.33 — Mark as Paid: self-serve reconcile for orders that
              got stuck in 'open' because /complete silently failed on a
              pre-v2.7.33 build. */}
          {order.status === 'open' && (
            <>
              <TouchableOpacity
                style={[s.actionBtn, marking && { opacity: 0.4 }]}
                onPress={markAsPaid}
                disabled={marking}
                activeOpacity={0.85}
              >
                {marking
                  ? <ActivityIndicator size="small" color="#22c55e" />
                  : <Ionicons name="checkmark-circle-outline" size={16} color="#22c55e" />}
                <Text style={[s.actionText, { color: '#22c55e' }]}>Mark as Paid</Text>
              </TouchableOpacity>
              <Text style={s.disabledHint}>
                Use only if the card was already charged but this order is still open.
              </Text>
            </>
          )}

          <TouchableOpacity
            style={[s.actionBtn, (!canRefund || anzBusy) && { opacity: 0.4 }]}
            onPress={() => { if (canRefund && !anzBusy) confirmRefundFlow(); }}
            disabled={!canRefund || anzBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="return-up-back" size={16} color="#ef4444" />
            <Text style={[s.actionText, { color: '#ef4444' }]}>
              {canRefund ? `Refund ${money(refundableBalance)}` : 'Refund unavailable'}
            </Text>
          </TouchableOpacity>
          {!canRefund && (
            <Text style={s.disabledHint}>
              {alreadyRefunded >= orderTotalNum
                ? 'Order has already been fully refunded.'
                : `Only completed or partially-refunded orders can be refunded.`}
            </Text>
          )}

          <TouchableOpacity
            style={[s.actionBtn, (!canReverse || anzBusy) && { opacity: 0.4 }]}
            onPress={() => { if (canReverse && !anzBusy) confirmReverseFlow(); }}
            disabled={!canReverse || anzBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="swap-horizontal" size={16} color="#f59e0b" />
            <Text style={[s.actionText, { color: '#f59e0b' }]}>Reverse Transaction</Text>
          </TouchableOpacity>
          {!canReverse && (
            <Text style={s.disabledHint}>
              {alreadyRefunded > 0
                ? 'Already refunded — reversal unavailable.'
                : !isCardPaid
                  ? 'Reversal is only available on card-paid orders.'
                  : !withinShift
                    ? 'Reversal is only available for the current shift. Use Refund.'
                    : bridge.state !== 'open' && bridge.state !== 'transacting'
                      ? 'Open the till to bring the ANZ terminal online.'
                      : 'Reversal unavailable.'}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* ── Busy modal during ANZ call ─────────────────────── */}
      <Modal
        visible={showRefund}
        transparent
        animationType="fade"
        onRequestClose={() => { /* disallow close during call */ }}
      >
        <Pressable style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Processing refund</Text>
            <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 18 }} />
            <Text style={s.modalHint}>
              Follow the prompts on the ANZ terminal. Do not close the app.
            </Text>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  errorText: { color: '#ef4444', fontSize: 14, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  retryText: { color: '#fff', fontWeight: '700' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  backText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  card: {
    backgroundColor: '#141425',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderNumberBig: { fontSize: 24, fontWeight: '900', color: '#fff' },
  orderTimeBig: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  orderTotalBig: { fontSize: 28, fontWeight: '900', color: '#6366f1' },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 6,
  },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },

  metaRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  metaItem: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },

  sectionTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  sectionBody: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sectionMuted: { color: '#94a3b8', fontSize: 12, marginTop: 2 },

  itemBlock: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1, paddingRight: 8 },
  itemTotal: { color: '#fff', fontSize: 14, fontWeight: '800' },
  itemMuted: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  itemNote: { color: '#f59e0b', fontSize: 11, marginTop: 2 },
  modList: { marginTop: 2, paddingLeft: 6 },

  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  kvRowTotal: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  kvKey: { color: '#94a3b8', fontSize: 13 },
  kvVal: { color: '#fff', fontSize: 13, fontWeight: '600' },
  kvKeyBold: { color: '#fff', fontSize: 14, fontWeight: '800' },
  kvValBold: { color: '#6366f1', fontSize: 16, fontWeight: '900' },

  refundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    gap: 10,
  },
  refundNumber: { color: '#fff', fontSize: 13, fontWeight: '700' },
  refundAmount: { color: '#ef4444', fontSize: 14, fontWeight: '800' },

  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: '#0d0d14',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    minHeight: 80,
    textAlignVertical: 'top',
  },

  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 8,
    marginBottom: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  bannerText: { color: '#94a3b8', fontSize: 11, flex: 1 },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    backgroundColor: '#0d0d14',
    marginTop: 8,
  },
  actionText: { color: '#6366f1', fontSize: 14, fontWeight: '800' },
  disabledHint: { color: '#555', fontSize: 11, marginTop: 4, marginLeft: 4 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
  },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  modalHint: { color: '#94a3b8', fontSize: 12, textAlign: 'center' },
});
