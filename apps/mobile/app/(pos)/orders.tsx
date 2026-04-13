import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { toast } from '../../components/ui';
import { isTyroInitialized, tyroRefund } from '../../modules/tyro-tta';
import { printRefundReceipt, isConnected as isPrinterConnected, connectPrinter } from '../../lib/printer';
import { usePrinterStore } from '../../store/printers';
import { useTyroStore } from '../../store/tyro';
import {
  TyroTransactionModal,
  type TyroTransactionOutcome,
} from '../../components/TyroTransactionModal';
import { getServerAnzConfig } from '../../store/device-settings';

// In local dev, orders service runs on EXPO_PUBLIC_ORDERS_API_URL (default port 4004).
// In production, EXPO_PUBLIC_API_URL points at the nginx gateway which routes
// /api/v1/orders → orders service, so it also works as a fallback.
const API_BASE =
  process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'http://localhost:4004';

interface Order {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  channel: string;
  createdAt: string;
  lines?: { name: string; quantity: number; unitPrice: number }[];
}

export default function OrdersScreen() {
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);
  const tyroConfig = useTyroStore((s) => s.config);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refund state
  const [showRefund, setShowRefund] = useState(false);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [showTyroModal, setShowTyroModal] = useState(false);
  const [tyroAmount, setTyroAmount] = useState(0);
  const [anzRefunding, setAnzRefunding] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    try {
      const locationId = identity?.locationId ?? '';
      const res = await fetch(`${API_BASE}/api/v1/orders?limit=50&locationId=${locationId}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data ?? data ?? []);
      } else {
        const body = await res.text().catch(() => '');
        let errMsg = `Error ${res.status}`;
        try { const j = JSON.parse(body); errMsg = j.message ?? j.detail ?? j.title ?? errMsg; } catch { /* ignore */ }
        setError(errMsg);
      }
    } catch {
      setError('Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [employeeToken, identity]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  function statusColor(status: string) {
    if (status === 'completed' || status === 'paid') return '#22c55e';
    if (status === 'pending') return '#f59e0b';
    if (status === 'cancelled' || status === 'refunded') return '#ef4444';
    return '#888';
  }

  function openRefund(order: Order) {
    setRefundOrder(order);
    const totalNum = typeof order.total === 'number' ? order.total : Number(order.total) || 0;
    setRefundAmount(totalNum.toFixed(2));
    setShowRefund(true);
  }

  async function startRefund() {
    if (!refundOrder) return;
    const dollars = parseFloat(refundAmount) || 0;
    if (dollars <= 0) {
      toast.warning('Invalid amount', 'Refund amount must be greater than zero.');
      return;
    }

    // ── Tyro refund ──────────────────────────────────────────────────
    if (isTyroInitialized()) {
      setShowRefund(false);
      setTyroAmount(dollars);
      setShowTyroModal(true);

      const amountCents = String(Math.round(dollars * 100));
      try {
        tyroRefund(amountCents, {
          integratedReceipt: tyroConfig.integratedReceipts,
          transactionId: `POS-REFUND-${refundOrder.orderNumber}-${Date.now()}`,
        });
      } catch (err) {
        setShowTyroModal(false);
        toast.error(
          'Refund Failed',
          err instanceof Error ? err.message : 'Failed to start the refund on the terminal.',
        );
      }
      return;
    }

    // ── ANZ Worldline TIM refund (direct HTTP to terminal) ───────────
    const serverAnz = getServerAnzConfig();
    if (serverAnz) {
      setShowRefund(false);
      setAnzRefunding(true);
      const token = employeeToken ?? identity?.deviceToken ?? '';
      const amountCents = Math.round(dollars * 100);
      const ip = (serverAnz.terminalIp ?? '').trim();
      const port = serverAnz.terminalPort ?? 8080;
      const refId = `POS-REFUND-${refundOrder.orderNumber}-${Date.now()}`;

      try {
        // Try to get the original acquirer transaction ID from the backend
        let originalTransactionId: string | undefined;
        try {
          const paymentsRes = await fetch(
            `${API_BASE}/api/v1/payments?orderId=${refundOrder.id}&limit=1`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) },
          );
          if (paymentsRes.ok) {
            const paymentsData = await paymentsRes.json();
            const firstPayment = (paymentsData.data ?? [])[0] as { acquirerTransactionId?: string } | undefined;
            originalTransactionId = firstPayment?.acquirerTransactionId;
          }
        } catch {
          // Continue without originalTransactionId — terminal handles standalone refund
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 90_000);
        const res = await fetch(`http://${ip}:${port}/v1/refunds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactionType: 'refund',
            amount: amountCents,
            referenceId: refId,
            ...(originalTransactionId ? { originalTransactionId } : {}),
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        let data: Record<string, unknown> = {};
        const text = await res.text().catch(() => '');
        try { data = JSON.parse(text); } catch { /* use empty */ }

        const responseCode = (data['responseCode'] as string) ?? String(res.status);
        const approved = responseCode === '00';

        if (approved) {
          // Record the refund on the backend (best-effort)
          try {
            const lines = refundOrder.lines && refundOrder.lines.length > 0
              ? refundOrder.lines.map((l) => ({
                  orderLineId: (l as { id?: string; orderLineId?: string }).id
                    ?? (l as { id?: string; orderLineId?: string }).orderLineId
                    ?? '',
                  quantity: l.quantity,
                  amount: Number(l.unitPrice) * l.quantity,
                })).filter((l) => l.orderLineId)
              : [{ orderLineId: refundOrder.id, quantity: 1, amount: dollars }];
            await fetch(`${API_BASE}/api/v1/orders/${refundOrder.id}/refund`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                reason: `Card refund via ANZ Worldline — ref: ${(data['transactionId'] as string) ?? refId}`,
                refundMethod: 'original',
                lines,
              }),
              signal: AbortSignal.timeout(5000),
            });
          } catch { /* offline — treat as success locally */ }

          // Auto-print refund receipt if printer is configured
          const printerConfig = usePrinterStore.getState().config;
          if (printerConfig.autoPrint && printerConfig.type) {
            try {
              if (!isPrinterConnected()) await connectPrinter();
              await printRefundReceipt({
                storeName: 'ElevatedPOS',
                orderNumber: refundOrder.orderNumber,
                items: refundOrder.lines?.map((l) => ({ name: l.name, qty: l.quantity, price: Number(l.unitPrice) })) ?? [],
                refundAmount: dollars,
                reason: `Card refund via ANZ — ref: ${(data['transactionId'] as string) ?? refId}`,
              });
            } catch {
              // Print failed — don't block the refund success
            }
          }

          toast.success('Refund Approved', `$${dollars.toFixed(2)} refunded via ANZ.`);
          setRefundOrder(null);
          setRefundAmount('');
          fetchOrders();
        } else {
          toast.error(
            'Refund Declined',
            (data['responseText'] as string) ?? `Terminal declined (${responseCode})`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error('Refund Failed', msg.includes('abort') ? 'Refund timed out — check the terminal.' : msg);
      } finally {
        setAnzRefunding(false);
      }
      return;
    }

    toast.warning(
      'No EFTPOS Configured',
      'Configure Tyro or ANZ Worldline in Settings before processing refunds.',
    );
  }

  async function handleTyroComplete(outcomeEvent: TyroTransactionOutcome) {
    setShowTyroModal(false);
    const result = outcomeEvent.result;
    const outcome = String(result.result || 'UNKNOWN').toUpperCase();

    if (outcome === 'APPROVED') {
      // Best-effort: update the order status on the server using the correct refund schema.
      const token = employeeToken ?? identity?.deviceToken ?? '';
      if (refundOrder) {
        try {
          const refundDollars = parseFloat(refundAmount) || 0;
          // Build lines array from the order's lines; fall back to a single synthetic line
          const lines = refundOrder.lines && refundOrder.lines.length > 0
            ? refundOrder.lines.map((l) => ({
                orderLineId: (l as { id?: string; orderLineId?: string }).id ?? (l as { id?: string; orderLineId?: string }).orderLineId ?? '',
                quantity: l.quantity,
                amount: Number(l.unitPrice) * l.quantity,
              })).filter((l) => l.orderLineId)
            : [{
                orderLineId: refundOrder.id, // fallback — server will validate
                quantity: 1,
                amount: refundDollars,
              }];
          await fetch(`${API_BASE}/api/v1/orders/${refundOrder.id}/refund`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              reason: `Card refund via Tyro — ref: ${result.transactionReference ?? 'N/A'}`,
              refundMethod: 'original',
              lines,
            }),
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          // Offline — still treat as success locally.
        }
      }
      // Auto-print refund receipt if printer is configured
      const printerConfig = usePrinterStore.getState().config;
      if (printerConfig.autoPrint && printerConfig.type && refundOrder) {
        try {
          if (!isPrinterConnected()) await connectPrinter();
          await printRefundReceipt({
            storeName: 'ElevatedPOS',
            orderNumber: refundOrder.orderNumber,
            items: refundOrder.lines?.map((l) => ({ name: l.name, qty: l.quantity, price: Number(l.unitPrice) })) ?? [],
            refundAmount: parseFloat(refundAmount) || 0,
            reason: `Card refund via Tyro — ref: ${result.transactionReference ?? 'N/A'}`,
          });
        } catch {
          // Print failed — don't block the refund success
        }
      }

      toast.success(
        'Refund Approved',
        `$${(parseFloat(refundAmount) || 0).toFixed(2)} refunded successfully.`,
      );
      setRefundOrder(null);
      setRefundAmount('');
      fetchOrders();
      return;
    }

    if (outcome === 'CANCELLED') {
      toast.warning('Refund Cancelled', 'The refund was cancelled on the terminal.');
      return;
    }
    if (outcome === 'DECLINED') {
      toast.error('Refund Declined', 'The refund was declined.');
      return;
    }
    if (outcome === 'SYSTEM ERROR') {
      toast.error(
        'Refund Error',
        result.errorMessage || 'The terminal reported a system error during the refund.',
      );
      return;
    }
    toast.warning(
      'Refund Incomplete',
      `Ended with status "${result.result}". Verify on the terminal before retrying.`,
    );
  }

  function renderOrder({ item }: { item: Order }) {
    const time = new Date(item.createdAt).toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const date = new Date(item.createdAt).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
    });
    const total =
      typeof item.total === 'number' ? item.total.toFixed(2) : (Number(item.total) || 0).toFixed(2);
    const isRefundable = item.status === 'completed' || item.status === 'paid';

    return (
      <View style={s.orderCard}>
        <View style={s.orderRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.orderNumber}>#{item.orderNumber}</Text>
            <Text style={s.orderTime}>
              {date} {time}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.orderTotal}>${total}</Text>
            <View
              style={[
                s.statusBadge,
                {
                  backgroundColor: `${statusColor(item.status)}20`,
                  borderColor: `${statusColor(item.status)}40`,
                },
              ]}
            >
              <Text style={[s.statusText, { color: statusColor(item.status) }]}>
                {item.status}
              </Text>
            </View>
          </View>
        </View>
        {item.lines && item.lines.length > 0 && (
          <View style={s.linesWrap}>
            {item.lines.slice(0, 3).map((line, i) => (
              <Text key={i} style={s.lineText}>
                {line.quantity}x {line.name}
              </Text>
            ))}
            {item.lines.length > 3 && (
              <Text style={s.lineText}>+{item.lines.length - 3} more</Text>
            )}
          </View>
        )}
        {isRefundable && (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={s.refundBtn}
              onPress={() => openRefund(item)}
              activeOpacity={0.85}
            >
              <Ionicons name="return-up-back" size={14} color="#ef4444" />
              <Text style={s.refundBtnText}>Refund</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Orders</Text>
        <TouchableOpacity onPress={fetchOrders} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <Ionicons name="refresh" size={20} color="#888" />
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle" size={36} color="#ef4444" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={fetchOrders}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : orders.length === 0 && !loading ? (
        <View style={s.center}>
          <Ionicons name="receipt-outline" size={36} color="#444" />
          <Text style={s.emptyText}>No orders yet</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={renderOrder}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          refreshing={loading}
          onRefresh={fetchOrders}
        />
      )}

      {/* ─── Refund prompt ─────────────────────────────── */}
      <Modal
        visible={showRefund}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRefund(false)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setShowRefund(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>Refund Order</Text>
            {refundOrder && (
              <Text style={s.modalSubtitle}>#{refundOrder.orderNumber}</Text>
            )}
            <Text style={s.modalLabel}>Amount to refund</Text>
            <TextInput
              style={s.modalInput}
              value={refundAmount}
              onChangeText={setRefundAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#444"
            />
            <Text style={s.modalHint}>
              The refund will be processed on the EFTPOS terminal. The customer must present
              the same card used for the original purchase.
            </Text>
            <TouchableOpacity
              style={[s.modalPrimaryBtn, anzRefunding && { opacity: 0.6 }]}
              onPress={startRefund}
              disabled={anzRefunding}
            >
              <Ionicons name="return-up-back" size={16} color="#fff" />
              <Text style={s.modalPrimaryText}>
                {anzRefunding ? 'Processing…' : 'Start Refund'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.modalSecondaryBtn}
              onPress={() => setShowRefund(false)}
            >
              <Text style={s.modalSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Tyro transaction modal for the actual refund ── */}
      <TyroTransactionModal
        visible={showTyroModal}
        amount={tyroAmount}
        title="Refund"
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  title: { fontSize: 20, fontWeight: '900', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  errorText: { color: '#ef4444', fontSize: 14 },
  emptyText: { color: '#555', fontSize: 14 },
  retryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  orderCard: {
    backgroundColor: '#141425',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  orderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  orderNumber: { fontSize: 16, fontWeight: '800', color: '#fff' },
  orderTime: { fontSize: 12, color: '#666', marginTop: 2 },
  orderTotal: { fontSize: 18, fontWeight: '900', color: '#6366f1' },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  linesWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  lineText: { fontSize: 12, color: '#888', lineHeight: 18 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    gap: 6,
  },
  refundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef444488',
  },
  refundBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 2 },
  modalSubtitle: { color: '#888', fontSize: 13, marginBottom: 18 },
  modalLabel: {
    color: '#888',
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
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
    marginBottom: 12,
  },
  modalHint: { color: '#555', fontSize: 11, marginBottom: 14, lineHeight: 16 },
  modalPrimaryBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  modalPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalSecondaryBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  modalSecondaryText: { color: '#888', fontSize: 13 },
});
