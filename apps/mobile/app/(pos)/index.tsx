import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable } from 'react-native';
import { usePosStore } from '../../store/pos';
import { useCatalogStore, type CatalogProduct } from '../../store/catalog';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { useCustomerDisplayStore } from '../../store/customer-display';
import { usePrinterStore } from '../../store/printers';
import { confirm, toast } from '../../components/ui';
import {
  printReceipt,
  printOrderTicket,
  printTyroMerchantReceipt,
  isConnected as isPrinterConnected,
  connectPrinter,
} from '../../lib/printer';
import { useRouter } from 'expo-router';
import { initTyro, tyroPurchase, isTyroInitialized } from '../../modules/tyro-tta';
import { useTyroStore } from '../../store/tyro';
import {
  TyroTransactionModal,
  type TyroTransactionOutcome,
} from '../../components/TyroTransactionModal';
import { useAnzStore, isAnzConfigured } from '../../store/anz';
import {
  AnzPaymentModal,
  type AnzPaymentResult,
} from '../../components/AnzPaymentModal';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#3b82f6',
];

function catColor(index: number, explicit?: string | null): string {
  return explicit || CATEGORY_COLORS[index % CATEGORY_COLORS.length]!;
}

function parsePrice(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function PosSellScreen() {
  const { cart, addItem, removeItem, updateItem, clearCart, customerName, customerId, setCustomer } =
    usePosStore();
  const { products, categories, loading, error, fetchAll } = useCatalogStore();
  const unavailable = useCatalogStore((s) => s.unavailable);
  const hydrateUnavailable = useCatalogStore((s) => s.hydrateUnavailable);
  const toggleUnavailable = useCatalogStore((s) => s.toggleUnavailable);
  const { identity } = useDeviceStore();

  const { settings: displaySettings, syncTransaction, showThankYou, hydrate: hydrateDisplay } =
    useCustomerDisplayStore();

  const router = useRouter();
  const authEmployee = useAuthStore((s) => s.employee);
  const authLogout = useAuthStore((s) => s.logout);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [charging, setCharging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Payment method modal
  const [showPayment, setShowPayment] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splitCardAmount, setSplitCardAmount] = useState('');
  const [splitCashAmount, setSplitCashAmount] = useState('');

  // Optional Tyro extras (cert: Integrated Cashout, Surcharging, Tipping)
  const [cashoutDollars, setCashoutDollars] = useState('');

  // Cart item edit modal
  const [editingCartItem, setEditingCartItem] = useState<{ id: string; cartKey: string; name: string; qty: number; price: number; note?: string; discount?: number; discountType?: '%' | '$' } | null>(null);
  const [itemDiscount, setItemDiscount] = useState('');
  const [itemDiscountType, setItemDiscountType] = useState<'%' | '$'>('$');
  const [itemNote, setItemNote] = useState('');

  // Order discount modal
  const [showOrderDiscount, setShowOrderDiscount] = useState(false);
  const [orderDiscountStr, setOrderDiscountStr] = useState('');
  const [orderDiscountType, setOrderDiscountType] = useState<'%' | '$'>('%');
  const [orderDiscountAmount, setOrderDiscountAmount] = useState(0);

  // Product detail modal (long-press)
  const [detailProduct, setDetailProduct] = useState<CatalogProduct | null>(null);

  // Customer search modal (P8)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; firstName: string; lastName: string; email?: string; phone?: string; loyaltyPoints?: number }>>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);

  // Tyro EFTPOS transaction modal
  const [showTyroModal, setShowTyroModal] = useState(false);
  const [tyroAmount, setTyroAmount] = useState(0);
  const tyroConfig = useTyroStore((s) => s.config);
  const hydrateTyro = useTyroStore((s) => s.hydrate);

  // ANZ Worldline TIM payment modal
  const [showAnzModal, setShowAnzModal] = useState(false);
  const [anzAmount, setAnzAmount] = useState(0);
  const [anzRefId, setAnzRefId] = useState('');
  const anzConfig = useAnzStore((s) => s.config);
  const hydrateAnz = useAnzStore((s) => s.hydrate);

  // Fetch catalog + hydrate customer display on mount
  useEffect(() => {
    fetchAll();
    hydrateDisplay();
    hydrateTyro();
    hydrateAnz();
    hydrateUnavailable();
  }, []);

  // Auto-initialise Tyro SDK if we have a saved API key
  useEffect(() => {
    if (tyroConfig.autoInit && tyroConfig.apiKey && !isTyroInitialized()) {
      try {
        initTyro(tyroConfig.apiKey, tyroConfig.environment);
      } catch (err) {
        console.warn('[Tyro] auto-init failed:', err);
      }
    }
  }, [tyroConfig.apiKey, tyroConfig.environment, tyroConfig.autoInit]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // ── Device heartbeat (revocation check) ──────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      useDeviceStore.getState().checkHeartbeat().then(() => {
        const id = useDeviceStore.getState().identity;
        if (!id) {
          router.replace('/pair');
        }
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // ── Category colour map ──────────────────────────────────────────
  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c, i) => m.set(c.id, catColor(i, c.color)));
    return m;
  }, [categories]);

  // ── Client-side filtering ────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = products;
    if (selectedCategoryId) {
      list = list.filter((p) => p.categoryId === selectedCategoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [products, selectedCategoryId, search]);

  // ── Cart totals (tax-inclusive — AU GST) ─────────────────────────
  const subtotal = cart.reduce((s, i) => {
    const itemDisc = i.discount
      ? (i.discountType === '%' ? (i.price * i.discount / 100) : i.discount)
      : 0;
    return s + (i.price - Math.min(itemDisc, i.price)) * i.qty;
  }, 0);
  const discountedTotal = orderDiscountAmount > 0 ? Math.max(0, subtotal - orderDiscountAmount) : subtotal;
  const total = discountedTotal;
  const gst = total / 11; // GST portion of the tax-inclusive total
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  // ── Sync cart → customer display ──────────────────────────────────
  useEffect(() => {
    if (displaySettings.enabled) {
      syncTransaction({
        items: cart.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
        total,
        gst,
        itemCount,
        customerName,
      });
    }
  }, [cart, customerName, displaySettings.enabled]);

  // ── Add product to cart ──────────────────────────────────────────
  function handleAdd(p: CatalogProduct) {
    if (unavailable.has(p.id)) {
      toast.warning('86\u2019d', `${p.name} is marked as unavailable. Long-press the item to bring it back.`);
      return;
    }
    addItem({
      id: p.id,
      name: p.name,
      price: parsePrice(p.basePrice),
      categoryColor: p.categoryId ? colorMap.get(p.categoryId) : undefined,
    });
  }

  // ── Toggle the Auto 86 (out-of-stock) flag for a product ─────────
  async function handleToggle86(p: CatalogProduct) {
    const wasUnavailable = unavailable.has(p.id);
    await toggleUnavailable(p.id);
    if (wasUnavailable) {
      toast.success('Back in stock', `${p.name} is now available.`);
    } else {
      toast.info('86\u2019d', `${p.name} is hidden from sale until you re-enable it.`);
    }
  }

  // ── Charge ───────────────────────────────────────────────────────
  async function handleCharge(
    paymentMethod: 'Card' | 'Cash' | 'Split' = 'Card',
    changeGiven = 0,
    tyroExtras?: { tipCents?: number; surchargeCents?: number; transactionTotalCents?: number },
  ) {
    if (cart.length === 0) return;
    setCharging(true);

    const authToken = useAuthStore.getState().employeeToken;
    const authEmployee = useAuthStore.getState().employee;
    const printerConfig = usePrinterStore.getState().config;
    const orderTotal = total;
    const orderGst = +gst.toFixed(2);

    // Actual amount charged by Tyro (includes surcharge + tip). Falls back to cart total.
    const tipDollars = tyroExtras?.tipCents ? tyroExtras.tipCents / 100 : 0;
    const surchargeDollars = tyroExtras?.surchargeCents ? tyroExtras.surchargeCents / 100 : 0;
    const paidTotal = tyroExtras?.transactionTotalCents
      ? tyroExtras.transactionTotalCents / 100
      : orderTotal;
    const orderItems = cart.map((i) => ({
      productId: i.id,
      name: i.name,
      quantity: i.qty,
      unitPrice: i.price,
      costPrice: 0,
      taxRate: 10,
    }));

    let orderNumber: string;
    let orderId: string;

    try {
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
      const token = authToken ?? identity?.deviceToken ?? '';
      const res = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locationId: identity?.locationId,
          registerId: identity?.registerId || undefined,
          channel: 'pos',
          orderType: 'retail',
          lines: orderItems,
          ...(customerId ? { customerId } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        setCharging(false);
        const errBody = await res.json().catch(() => ({})) as { message?: string; detail?: string; title?: string };
        const errMsg = errBody.message ?? errBody.detail ?? errBody.title ?? `Server error (${res.status})`;
        Alert.alert('Order Failed', errMsg);
        return;
      }
      const data = await res.json();
      orderNumber = data.orderNumber;
      orderId = data.id;

      // Mark order as completed (fires order.completed Kafka event → loyalty points)
      try {
        await fetch(`${base}/api/v1/orders/${orderId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ paidTotal, changeGiven, tipAmount: tipDollars || undefined, surchargeAmount: surchargeDollars || undefined }),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        // Non-fatal — order is created, complete can be retried
      }
    } catch (err) {
      setCharging(false);
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('timeout') || msg.includes('AbortError') || msg.includes('TimeoutError');
      const isNetwork = msg.toLowerCase().includes('network request failed') || msg.toLowerCase().includes('failed to fetch');
      const apiUrl = process.env['EXPO_PUBLIC_API_URL'] ?? '(not set)';
      Alert.alert(
        'Order Failed',
        isTimeout
          ? 'The request timed out. The server may be unreachable — check that this device has internet access.'
          : isNetwork
            ? `Cannot reach the server at ${apiUrl}.\n\nMake sure this device has internet access (not just local network). If you are on an isolated EFTPOS network, connect to a Wi-Fi with internet or use mobile data.`
            : `Server error: ${msg}`,
      );
      return;
    }

    // Auto-print receipt if configured
    if (printerConfig.autoPrint && printerConfig.type) {
      try {
        if (!isPrinterConnected()) await connectPrinter();
        await printReceipt({
          storeName: 'ElevatedPOS',
          orderNumber,
          items: cart.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
          subtotal: orderTotal - orderGst,
          gst: orderGst,
          total: paidTotal,
          paymentMethod,
          cashierName: authEmployee
            ? `${authEmployee.firstName} ${authEmployee.lastName}`
            : undefined,
          surchargeAmount: surchargeDollars || undefined,
          tipAmount: tipDollars || undefined,
        });
      } catch {
        // Print failed — don't block order
      }
    }

    // Print kitchen order ticket if enabled
    if (printerConfig.printOrderTicket && printerConfig.type) {
      try {
        if (!isPrinterConnected()) await connectPrinter();
        await printOrderTicket({
          orderNumber,
          items: cart.map((i) => ({ name: i.name, qty: i.qty })),
        });
      } catch {
        // Order ticket print failed — don't block order
      }
    }

    clearCart();
    if (displaySettings.enabled) showThankYou();
    toast.success('Order Placed', `Order #${orderNumber} — $${paidTotal.toFixed(2)}`);
    setCharging(false);
  }

  // ── Render product card ──────────────────────────────────────────
  function renderProduct({ item }: { item: CatalogProduct }) {
    const price = parsePrice(item.basePrice);
    const inCart = cart.find((c) => c.id === item.id);
    const cc =
      item.categoryId ? (colorMap.get(item.categoryId) ?? '#6366f1') : '#6366f1';
    const is86 = unavailable.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.card, inCart && styles.cardActive, is86 && styles.cardDisabled]}
        onPress={() => handleAdd(item)}
        onLongPress={() => setDetailProduct(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.cardColorBar, { backgroundColor: cc, opacity: is86 ? 0.35 : 1 }]} />
        <View style={styles.cardBody}>
          <Text
            style={[styles.cardName, is86 && { color: '#666', textDecorationLine: 'line-through' }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <View style={styles.cardFooter}>
            <Text style={[styles.cardPrice, is86 && { color: '#555' }]}>
              ${price.toFixed(2)}
            </Text>
            {is86 ? (
              <View style={styles.outOfStockBadge}>
                <Text style={styles.outOfStockText}>86&apos;d</Text>
              </View>
            ) : inCart ? (
              <View style={styles.cardBadge}>
                <Text style={styles.cardBadgeText}>{inCart.qty}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Handle payment method selection ──────────────────────────────
  function handlePayCard() {
    setShowPayment(false);

    // If Tyro is ready → open the headless transaction modal and
    // start a purchase. The modal handles status/question/cancel UI
    // itself per iClient.Retail.Headless cert rules.
    if (isTyroInitialized()) {
      const cashoutDollarsNum =
        tyroConfig.cashoutEnabled && cashoutDollars ? parseFloat(cashoutDollars) || 0 : 0;
      const cashoutCents = cashoutDollarsNum > 0 ? String(Math.round(cashoutDollarsNum * 100)) : '';

      // The Tyro amount shown in the modal includes the cashout so the
      // merchant knows what the customer will be charged.
      setTyroAmount(total + cashoutDollarsNum);
      setShowTyroModal(true);

      const amountCents = String(Math.round(total * 100));
      try {
        tyroPurchase(amountCents, {
          cashoutCents,
          integratedReceipt: tyroConfig.integratedReceipts,
          enableSurcharge: tyroConfig.enableSurcharge,
          transactionId: `POS-${Date.now()}`,
        });
        setCashoutDollars('');
      } catch (err) {
        console.warn('[Tyro] start purchase failed:', err);
        setShowTyroModal(false);
        toast.error(
          'EFTPOS Error',
          err instanceof Error
            ? err.message
            : 'Failed to start a Tyro transaction. Please try again.',
        );
      }
      return;
    }

    // ANZ Worldline TIM — direct HTTP call to terminal on local network
    if (isAnzConfigured()) {
      setAnzAmount(total);
      setAnzRefId(`POS-${Date.now()}`);
      setShowAnzModal(true);
      return;
    }

    // Fallback: direct charge without EFTPOS (dev / demo mode)
    handleCharge('Card');
  }

  // ── Handle Tyro transaction completion ───────────────────────────
  async function handleTyroComplete(outcomeEvent: TyroTransactionOutcome) {
    setShowTyroModal(false);

    const result = outcomeEvent.result;
    const outcome = String(result.result || 'UNKNOWN').toUpperCase();
    const split = pendingSplit;
    // Always clear the pending split after reading it.
    if (split) setPendingSplit(null);

    if (outcome === 'APPROVED') {
      // Extract tip and surcharge from the Tyro result (values are in cents as strings).
      const tipCents = result.tipAmount ? parseInt(String(result.tipAmount), 10) : 0;
      const surchargeCents = result.surchargeAmount ? parseInt(String(result.surchargeAmount), 10) : 0;
      const transactionTotalCents = result.transactionAmount ? parseInt(String(result.transactionAmount), 10) : 0;

      // Print the Tyro merchant receipt (with signature line if required)
      // before finalising the sale. Best-effort — never block the success
      // flow if the printer is offline.
      const printerConfig = usePrinterStore.getState().config;
      if (printerConfig.type && outcomeEvent.merchantReceipt) {
        try {
          if (!isPrinterConnected()) await connectPrinter();
          await printTyroMerchantReceipt({
            merchantReceipt: outcomeEvent.merchantReceipt,
            signatureRequired: outcomeEvent.signatureRequired,
          });
        } catch (err) {
          console.warn('[Tyro] merchant receipt print failed:', err);
        }
      }

      // Finalise the sale, passing Tyro extras so tip/surcharge are stored
      // with the order and shown on the POS receipt.
      handleCharge(split ? 'Split' : 'Card', 0, {
        tipCents: tipCents || undefined,
        surchargeCents: surchargeCents || undefined,
        transactionTotalCents: transactionTotalCents || undefined,
      });

      if (split) {
        setSplitCardAmount('');
        setSplitCashAmount('');
        const msg =
          split.change > 0
            ? `Card $${split.cardAmt.toFixed(2)} · Cash $${split.cashAmt.toFixed(2)} · Change $${split.change.toFixed(2)}`
            : `Card $${split.cardAmt.toFixed(2)} · Cash $${split.cashAmt.toFixed(2)}`;
        toast.success('Split Payment Complete', msg);
      }
      return;
    }

    if (outcome === 'CANCELLED') {
      toast.warning('Payment Cancelled', 'The EFTPOS transaction was cancelled.');
      return;
    }

    if (outcome === 'DECLINED') {
      toast.error(
        'Card Declined',
        'The card was declined by the bank. Try another card or payment method.',
      );
      return;
    }

    if (outcome === 'REVERSED') {
      toast.warning(
        'Transaction Reversed',
        'The terminal auto-reversed the transaction. No funds were taken.',
      );
      return;
    }

    if (outcome === 'SYSTEM ERROR') {
      const msg = result.errorMessage || '';
      // Tyro documents a 503 / terminal busy scenario that comes back as
      // SYSTEM ERROR — give the merchant a more actionable message.
      if (msg.toLowerCase().includes('503') || msg.toLowerCase().includes('busy')) {
        toast.warning(
          'Terminal Busy',
          'The Tyro terminal is handling another transaction. Wait and try again.',
        );
        return;
      }
      toast.error(
        'EFTPOS System Error',
        msg || 'Tyro reported a system error. Check the terminal and retry.',
      );
      return;
    }

    if (outcome === 'NOT STARTED') {
      toast.error(
        'Transaction Not Started',
        'The terminal could not begin the transaction. Check the terminal and try again.',
      );
      return;
    }

    // UNKNOWN / anything else
    toast.warning(
      'Payment Incomplete',
      `Ended with status "${result.result}". Please verify on the terminal before retrying.`,
    );
  }

  // ── Handle ANZ TIM payment result ────────────────────────────────
  function handleAnzApproved(result: AnzPaymentResult) {
    setShowAnzModal(false);

    const split = pendingSplit;
    if (split) setPendingSplit(null);

    // ANZ TIM doesn't expose surcharge/tip separately — charge the plain cart total.
    handleCharge(split ? 'Split' : 'Card');

    const cardDesc = result.cardType
      ? `${result.cardType} ••••${result.cardLast4 ?? ''}`
      : `Auth: ${result.authCode ?? result.transactionId ?? 'OK'}`;

    if (split) {
      setSplitCardAmount('');
      setSplitCashAmount('');
      const msg =
        split.change > 0
          ? `Card $${split.cardAmt.toFixed(2)} · Cash $${split.cashAmt.toFixed(2)} · Change $${split.change.toFixed(2)}`
          : `Card $${split.cardAmt.toFixed(2)} · Cash $${split.cashAmt.toFixed(2)}`;
      toast.success('Split Payment Complete', msg);
    } else {
      toast.success('Payment Approved', cardDesc);
    }
  }

  function handleAnzDeclined(result: AnzPaymentResult) {
    setShowAnzModal(false);
    toast.error('Card Declined', result.responseText || 'The card was declined by the bank.');
  }

  function handleAnzCancelled() {
    setShowAnzModal(false);
    toast.warning('Payment Cancelled', 'The ANZ transaction was cancelled.');
  }

  function handleAnzError(message: string) {
    setShowAnzModal(false);
    toast.error('EFTPOS Error', message);
  }

  function handlePayCash() {
    const tendered = parseFloat(cashTendered) || 0;
    if (tendered < total) {
      toast.warning('Insufficient', `Need at least $${total.toFixed(2)}`);
      return;
    }
    const change = tendered - total;
    setShowPayment(false);
    setCashTendered('');
    // Process as cash, passing change given for order complete record
    handleCharge('Cash', change);
    if (change > 0) {
      toast.info('Change Due', `$${change.toFixed(2)}`);
    }
  }

  // Track cash/change from a split so we can report after Tyro approves.
  const [pendingSplit, setPendingSplit] = useState<{
    cardAmt: number;
    cashAmt: number;
    change: number;
  } | null>(null);

  function handlePaySplit() {
    const cardAmt = parseFloat(splitCardAmount) || 0;
    const cashAmt = parseFloat(splitCashAmount) || 0;
    if (cardAmt + cashAmt < total) {
      toast.warning(
        'Insufficient',
        `Card $${cardAmt.toFixed(2)} + Cash $${cashAmt.toFixed(2)} = $${(cardAmt + cashAmt).toFixed(2)}. Need $${total.toFixed(2)}.`,
      );
      return;
    }
    const change = cardAmt + cashAmt - total;

    // Route the card portion through Tyro if available.
    if (cardAmt > 0 && isTyroInitialized()) {
      setShowPayment(false);
      setSplitMode(false);
      setPendingSplit({ cardAmt, cashAmt, change });
      setTyroAmount(cardAmt);
      setShowTyroModal(true);

      const amountCents = String(Math.round(cardAmt * 100));
      try {
        tyroPurchase(amountCents, {
          integratedReceipt: tyroConfig.integratedReceipts,
          enableSurcharge: tyroConfig.enableSurcharge,
          transactionId: `POS-SPLIT-${Date.now()}`,
        });
      } catch (err) {
        console.warn('[Tyro] start split purchase failed:', err);
        setShowTyroModal(false);
        setPendingSplit(null);
        toast.error(
          'EFTPOS Error',
          err instanceof Error ? err.message : 'Failed to start Tyro transaction.',
        );
      }
      return;
    }

    // Route card portion through ANZ TIM if configured and Tyro is not available.
    if (cardAmt > 0 && isAnzConfigured()) {
      setShowPayment(false);
      setSplitMode(false);
      setPendingSplit({ cardAmt, cashAmt, change });
      setAnzAmount(cardAmt);
      setAnzRefId(`POS-SPLIT-${Date.now()}`);
      setShowAnzModal(true);
      return;
    }

    // Cash-only or no EFTPOS — fall through to the legacy flow.
    setShowPayment(false);
    setSplitMode(false);
    setSplitCardAmount('');
    setSplitCashAmount('');
    handleCharge('Split');
    if (change > 0) {
      toast.success(
        'Split Payment Complete',
        `Card $${cardAmt.toFixed(2)} · Cash $${cashAmt.toFixed(2)} · Change $${change.toFixed(2)}`,
      );
    } else {
      toast.success(
        'Split Payment Complete',
        `Card $${cardAmt.toFixed(2)} · Cash $${cashAmt.toFixed(2)}`,
      );
    }
  }

  function applyOrderDiscount() {
    const val = parseFloat(orderDiscountStr) || 0;
    if (val <= 0) return;
    const amt = orderDiscountType === '%' ? (subtotal * val / 100) : val;
    setOrderDiscountAmount(Math.min(amt, subtotal));
    setShowOrderDiscount(false);
    setOrderDiscountStr('');
  }

  function handleSwitchEmployee() {
    authLogout();
    router.replace('/employee-login');
  }

  // ── Customer search ──────────────────────────────────────────────
  async function searchCustomers(query: string) {
    setCustomerSearchLoading(true);
    try {
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
      const token = useAuthStore.getState().employeeToken ?? identity?.deviceToken ?? '';
      const res = await fetch(
        `${base}/api/v1/customers?search=${encodeURIComponent(query)}&limit=20`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCustomerResults(Array.isArray(data) ? data : (data.data ?? []));
      }
    } catch {
      // ignore — user can retry
    } finally {
      setCustomerSearchLoading(false);
    }
  }

  function openCustomerSearch() {
    setCustomerQuery('');
    setCustomerResults([]);
    setShowCustomerSearch(true);
    // Pre-load recent customers immediately
    searchCustomers('');
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* ═══ Staff Header Bar ═══ */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#141425', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>ElevatedPOS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {authEmployee && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>
                  {authEmployee.firstName.charAt(0)}{authEmployee.lastName.charAt(0)}
                </Text>
              </View>
              <Text style={{ color: '#ccc', fontSize: 12, fontWeight: '600' }}>{authEmployee.firstName}</Text>
            </View>
          )}
          <TouchableOpacity onPress={handleSwitchEmployee} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#2a2a3a' }}>
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '600' }}>Switch</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.layout}>
        {/* ═══════════ LEFT: Products ═══════════ */}
        <View style={styles.leftPane}>
          {/* Search + Customer */}
          <View style={styles.topRow}>
            <View style={styles.searchWrap}>
              <Ionicons
                name="search"
                size={16}
                color="#555"
                style={{ marginLeft: 10 }}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search products..."
                placeholderTextColor="#444"
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              {search !== '' && (
                <TouchableOpacity
                  onPress={() => setSearch('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color="#555"
                    style={{ marginRight: 10 }}
                  />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.custBtn, customerName ? styles.custBtnActive : null]}
              onPress={async () => {
                if (customerName) {
                  const removeIt = await confirm({
                    title: 'Customer',
                    description: customerName,
                    confirmLabel: 'Remove',
                    cancelLabel: 'Keep',
                    destructive: true,
                  });
                  if (removeIt) setCustomer(null, null);
                } else {
                  openCustomerSearch();
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="person"
                size={16}
                color={customerName ? '#6366f1' : '#555'}
              />
              {customerName ? (
                <Text style={styles.custName} numberOfLines={1}>
                  {customerName}
                </Text>
              ) : null}
            </TouchableOpacity>
          </View>

          {/* Category filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catBar}
            contentContainerStyle={styles.catBarInner}
          >
            <TouchableOpacity
              style={[styles.chip, !selectedCategoryId && styles.chipActive]}
              onPress={() => setSelectedCategoryId(null)}
            >
              <Text
                style={[
                  styles.chipText,
                  !selectedCategoryId && styles.chipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {categories.map((cat, idx) => {
              const active = selectedCategoryId === cat.id;
              const c = catColor(idx, cat.color);
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.chip,
                    active
                      ? { backgroundColor: c, borderColor: c }
                      : { borderColor: `${c}44` },
                  ]}
                  onPress={() =>
                    setSelectedCategoryId(active ? null : cat.id)
                  }
                >
                  {!active && (
                    <View style={[styles.chipDot, { backgroundColor: c }]} />
                  )}
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Product grid */}
          {loading && products.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.centerText}>Loading catalog...</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle" size={36} color="#ef4444" />
              <Text style={styles.centerTextErr}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchAll}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="cube-outline" size={36} color="#444" />
              <Text style={styles.centerText}>
                {search ? 'No matching products' : 'No products found'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(p) => p.id}
              numColumns={4}
              renderItem={renderProduct}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          )}
        </View>

        {/* ═══════════ RIGHT: Cart ═══════════ */}
        <View style={styles.cartPanel}>
          <View style={styles.cartHead}>
            <Text style={styles.cartTitle}>Order</Text>
            {itemCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{itemCount}</Text>
              </View>
            )}
          </View>

          {cart.length === 0 ? (
            <View style={styles.cartEmpty}>
              <Ionicons name="cart-outline" size={36} color="#2a2a3a" />
              <Text style={styles.cartEmptyText}>Tap products to add</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.cartList}
              showsVerticalScrollIndicator={false}
            >
              {cart.map((item) => (
                <TouchableOpacity
                  key={item.cartKey}
                  style={styles.cartRow}
                  onPress={() => { setEditingCartItem(item); setItemDiscount(item.discount ? String(item.discount) : ''); setItemDiscountType(item.discountType ?? '$'); setItemNote(item.note ?? ''); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.cartItemLeft}>
                    <View
                      style={[
                        styles.cartDot,
                        { backgroundColor: item.categoryColor ?? '#6366f1' },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.cartItemSub}>
                        ${item.price.toFixed(2)} ea
                        {item.discount ? ` (-${item.discountType === '%' ? `${item.discount}%` : `$${item.discount.toFixed(2)}`})` : ''}
                      </Text>
                      {item.note ? <Text style={{ fontSize: 10, color: '#f59e0b', marginTop: 1 }} numberOfLines={1}>{item.note}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => removeItem(item.cartKey)}
                    >
                      <Text style={styles.qtyBtnLabel}>
                        {item.qty === 1 ? '×' : '−'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyNum}>{item.qty}</Text>
                    <TouchableOpacity
                      style={[styles.qtyBtn, styles.qtyBtnPlus]}
                      onPress={() => addItem(item)}
                    >
                      <Text style={styles.qtyBtnLabel}>+</Text>
                    </TouchableOpacity>
                    <Text style={styles.lineTotal}>
                      ${(item.price * item.qty).toFixed(2)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {cart.length > 0 && (
            <View style={styles.totalsWrap}>
              {orderDiscountAmount > 0 && (
                <View style={styles.totalLine}>
                  <Text style={[styles.totalLabel, { color: '#ef4444' }]}>Discount</Text>
                  <Text style={[styles.totalValue, { color: '#ef4444' }]}>-${orderDiscountAmount.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
              </View>
              <Text style={styles.gstNote}>
                Incl. GST ${gst.toFixed(2)}
              </Text>

              <TouchableOpacity
                style={[
                  styles.chargeBtn,
                  (charging || cart.length === 0) && styles.chargeBtnOff,
                ]}
                onPress={() => setShowPayment(true)}
                disabled={charging || cart.length === 0}
                activeOpacity={0.85}
              >
                <Text style={styles.chargeText}>
                  {charging
                    ? 'Processing...'
                    : `Charge $${total.toFixed(2)}`}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={[styles.clearBtn, { flex: 1 }]} onPress={() => router.push('/(pos)/split-check' as never)}>
                  <Text style={[styles.clearText, { color: '#6366f1' }]}>Split</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.clearBtn, { flex: 1 }]} onPress={() => setShowOrderDiscount(true)}>
                  <Text style={[styles.clearText, { color: '#f59e0b' }]}>Discount</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.clearBtn, { flex: 1 }]} onPress={() => { clearCart(); setOrderDiscountAmount(0); }}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ═══ Payment Method Modal ═══ */}
      <Modal visible={showPayment} transparent animationType="fade" onRequestClose={() => { setShowPayment(false); setSplitMode(false); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => { setShowPayment(false); setSplitMode(false); }}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 340, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 20, textAlign: 'center' }}>Payment — ${total.toFixed(2)}</Text>

            {!splitMode ? (
              <>
                {tyroConfig.cashoutEnabled && isTyroInitialized() && (
                  <View style={{ backgroundColor: '#141425', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10 }}>
                    <Text style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>Cashout (optional)</Text>
                    <TextInput
                      style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a' }}
                      value={cashoutDollars}
                      onChangeText={setCashoutDollars}
                      keyboardType="decimal-pad"
                      placeholder="$0.00"
                      placeholderTextColor="#444"
                    />
                  </View>
                )}
                <TouchableOpacity
                  style={{ backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 }}
                  onPress={handlePayCard}
                >
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                    Card / EFTPOS{tyroConfig.enableSurcharge ? ' (Surcharge applies)' : ''}
                  </Text>
                  {tyroConfig.cashoutEnabled && parseFloat(cashoutDollars) > 0 && (
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff', opacity: 0.85, marginTop: 2 }}>
                      ${total.toFixed(2)} + ${(parseFloat(cashoutDollars) || 0).toFixed(2)} cashout
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={{ backgroundColor: '#141425', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10 }}>
                  <Text style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>Cash Tendered</Text>
                  <TextInput
                    style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 20, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a' }}
                    value={cashTendered}
                    onChangeText={setCashTendered}
                    keyboardType="decimal-pad"
                    placeholder={`$${total.toFixed(2)}`}
                    placeholderTextColor="#444"
                  />
                  {cashTendered && parseFloat(cashTendered) >= total && (
                    <Text style={{ color: '#22c55e', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 8 }}>
                      Change: ${(parseFloat(cashTendered) - total).toFixed(2)}
                    </Text>
                  )}
                  <TouchableOpacity
                    style={{ backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                    onPress={handlePayCash}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Pay Cash</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: '#141425', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#f59e0b44' }}
                  onPress={() => { setSplitMode(true); setSplitCardAmount(''); setSplitCashAmount(''); }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#f59e0b' }}>Split Payment</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ backgroundColor: '#141425', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#f59e0b44', marginBottom: 10 }}>
                <Text style={{ color: '#f59e0b', fontSize: 14, fontWeight: '700', marginBottom: 12, textAlign: 'center' }}>Split Payment</Text>
                <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Card Amount</Text>
                <TextInput
                  style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 18, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10 }}
                  value={splitCardAmount}
                  onChangeText={(v) => {
                    setSplitCardAmount(v);
                    const cardVal = parseFloat(v) || 0;
                    const remainder = Math.max(0, total - cardVal);
                    setSplitCashAmount(remainder > 0 ? remainder.toFixed(2) : '');
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#444"
                />
                <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Cash Amount</Text>
                <TextInput
                  style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 18, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10 }}
                  value={splitCashAmount}
                  onChangeText={setSplitCashAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#444"
                />
                {(() => {
                  const cardVal = parseFloat(splitCardAmount) || 0;
                  const cashVal = parseFloat(splitCashAmount) || 0;
                  const remaining = total - cardVal - cashVal;
                  return (
                    <Text style={{ fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 10, color: remaining <= 0 ? '#22c55e' : '#ef4444' }}>
                      {remaining <= 0 ? (remaining < 0 ? `Change: $${Math.abs(remaining).toFixed(2)}` : 'Fully covered') : `Remaining: $${remaining.toFixed(2)}`}
                    </Text>
                  );
                })()}
                <TouchableOpacity
                  style={{ backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                  onPress={handlePaySplit}
                >
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Confirm Split</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSplitMode(false)} style={{ alignItems: 'center', paddingVertical: 8, marginTop: 4 }}>
                  <Text style={{ color: '#888', fontSize: 13 }}>Back</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity onPress={() => { setShowPayment(false); setSplitMode(false); }} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#666', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Cart Item Edit Modal (Discount/Note) ═══ */}
      <Modal visible={!!editingCartItem} transparent animationType="fade" onRequestClose={() => setEditingCartItem(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setEditingCartItem(null)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 340, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 }}>{editingCartItem?.name}</Text>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{editingCartItem?.qty}x @ ${editingCartItem?.price.toFixed(2)}</Text>

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>Discount Type</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: itemDiscountType === '%' ? '#6366f1' : '#141425', borderWidth: 1, borderColor: '#2a2a3a', alignItems: 'center' }}
                onPress={() => setItemDiscountType('%')}
              >
                <Text style={{ color: itemDiscountType === '%' ? '#fff' : '#888', fontWeight: '700' }}>Percentage %</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: itemDiscountType === '$' ? '#6366f1' : '#141425', borderWidth: 1, borderColor: '#2a2a3a', alignItems: 'center' }}
                onPress={() => setItemDiscountType('$')}
              >
                <Text style={{ color: itemDiscountType === '$' ? '#fff' : '#888', fontWeight: '700' }}>Dollar $</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Discount {itemDiscountType === '%' ? '(%)' : '($)'}</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 4 }}
              value={itemDiscount}
              onChangeText={setItemDiscount}
              keyboardType="decimal-pad"
              placeholder={itemDiscountType === '%' ? '10' : '0.00'}
              placeholderTextColor="#444"
            />
            {editingCartItem && itemDiscount ? (
              <Text style={{ fontSize: 12, color: '#f59e0b', marginBottom: 10 }}>
                Saves {itemDiscountType === '%'
                  ? `$${((editingCartItem.price * (parseFloat(itemDiscount) || 0)) / 100).toFixed(2)} per item`
                  : `$${(parseFloat(itemDiscount) || 0).toFixed(2)} per item`}
              </Text>
            ) : <View style={{ height: 10 }} />}

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Note</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 16 }}
              value={itemNote}
              onChangeText={setItemNote}
              placeholder="e.g. No onions"
              placeholderTextColor="#444"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(editingCartItem?.discount || editingCartItem?.note) && (
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#1e1e2e', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#ef444444' }}
                  onPress={() => {
                    if (editingCartItem) {
                      updateItem(editingCartItem.cartKey, { discount: undefined, discountType: undefined, note: undefined });
                    }
                    setEditingCartItem(null);
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#ef4444' }}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                onPress={() => {
                  if (editingCartItem) {
                    const discVal = parseFloat(itemDiscount) || 0;
                    updateItem(editingCartItem.cartKey, {
                      discount: discVal > 0 ? discVal : undefined,
                      discountType: discVal > 0 ? itemDiscountType : undefined,
                      note: itemNote.trim() || undefined,
                    });
                  }
                  setEditingCartItem(null);
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Order Discount Modal ═══ */}
      <Modal visible={showOrderDiscount} transparent animationType="fade" onRequestClose={() => setShowOrderDiscount(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowOrderDiscount(false)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 340, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 16 }}>Order Discount</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: orderDiscountType === '%' ? '#6366f1' : '#141425', borderWidth: 1, borderColor: '#2a2a3a', alignItems: 'center' }}
                onPress={() => setOrderDiscountType('%')}
              >
                <Text style={{ color: orderDiscountType === '%' ? '#fff' : '#888', fontWeight: '700' }}>Percentage %</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: orderDiscountType === '$' ? '#6366f1' : '#141425', borderWidth: 1, borderColor: '#2a2a3a', alignItems: 'center' }}
                onPress={() => setOrderDiscountType('$')}
              >
                <Text style={{ color: orderDiscountType === '$' ? '#fff' : '#888', fontWeight: '700' }}>Dollar $</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 24, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 16 }}
              value={orderDiscountStr}
              onChangeText={setOrderDiscountStr}
              keyboardType="decimal-pad"
              placeholder={orderDiscountType === '%' ? '10' : '5.00'}
              placeholderTextColor="#444"
            />
            <TouchableOpacity
              style={{ backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              onPress={applyOrderDiscount}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Apply Discount</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Product Detail Modal (Long-Press) ═══ */}
      <Modal visible={!!detailProduct} transparent animationType="fade" onRequestClose={() => setDetailProduct(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setDetailProduct(null)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 380, maxHeight: '70%', borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 8 }}>{detailProduct?.name}</Text>
            <Text style={{ fontSize: 18, color: '#6366f1', fontWeight: '700', marginBottom: 12 }}>
              ${parseFloat(String(detailProduct?.basePrice ?? '0')).toFixed(2)}
            </Text>
            {detailProduct?.sku && (
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={{ color: '#666', fontSize: 13, width: 80 }}>SKU</Text>
                <Text style={{ color: '#ccc', fontSize: 13 }}>{detailProduct.sku}</Text>
              </View>
            )}
            {detailProduct?.categoryId && (
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={{ color: '#666', fontSize: 13, width: 80 }}>Category</Text>
                <Text style={{ color: '#ccc', fontSize: 13 }}>{categories.find(c => c.id === detailProduct.categoryId)?.name ?? '—'}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <Text style={{ color: '#666', fontSize: 13, width: 80 }}>Status</Text>
              <Text style={{ color: detailProduct?.isActive ? '#22c55e' : '#ef4444', fontSize: 13 }}>{detailProduct?.isActive ? 'Active' : 'Inactive'}</Text>
            </View>
            {detailProduct?.prepTimeMinutes != null && (
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={{ color: '#666', fontSize: 13, width: 80 }}>Prep time</Text>
                <Text style={{ color: '#ccc', fontSize: 13 }}>{detailProduct.prepTimeMinutes} min</Text>
              </View>
            )}
            {detailProduct?.calories != null && (
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={{ color: '#666', fontSize: 13, width: 80 }}>Calories</Text>
                <Text style={{ color: '#ccc', fontSize: 13 }}>{detailProduct.calories} kcal</Text>
              </View>
            )}
            {detailProduct?.allergens && detailProduct.allergens.length > 0 && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  ⚠ Allergens
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {detailProduct.allergens.map((a) => (
                    <View key={a} style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: '#f59e0b55', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{a}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {detailProduct && unavailable.has(detailProduct.id) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: '#ef444455', borderRadius: 10, padding: 10, marginTop: 10, gap: 8 }}>
                <Ionicons name="warning" size={16} color="#ef4444" />
                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700', flex: 1 }}>
                  This item is 86&apos;d — hidden from sale
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={{
                backgroundColor: detailProduct && unavailable.has(detailProduct.id) ? '#2a2a3a' : '#6366f1',
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                marginTop: 16,
                opacity: detailProduct && unavailable.has(detailProduct.id) ? 0.5 : 1,
              }}
              disabled={!!(detailProduct && unavailable.has(detailProduct.id))}
              onPress={() => { if (detailProduct) handleAdd(detailProduct); setDetailProduct(null); }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Add to Cart</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                marginTop: 8,
                borderWidth: 1,
                borderColor: detailProduct && unavailable.has(detailProduct.id) ? '#22c55e' : '#ef4444',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
              onPress={() => { if (detailProduct) { handleToggle86(detailProduct); setDetailProduct(null); } }}
            >
              <Ionicons
                name={detailProduct && unavailable.has(detailProduct.id) ? 'checkmark-circle' : 'remove-circle'}
                size={16}
                color={detailProduct && unavailable.has(detailProduct.id) ? '#22c55e' : '#ef4444'}
              />
              <Text style={{
                fontSize: 13,
                fontWeight: '800',
                color: detailProduct && unavailable.has(detailProduct.id) ? '#22c55e' : '#ef4444',
              }}>
                {detailProduct && unavailable.has(detailProduct.id) ? 'Mark Back In Stock' : '86 This Item'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDetailProduct(null)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#666', fontSize: 14 }}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Customer Search Modal (P8) ═══ */}
      <Modal visible={showCustomerSearch} transparent animationType="fade" onRequestClose={() => setShowCustomerSearch(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setShowCustomerSearch(false)}
        >
          <Pressable
            style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 20, width: 400, maxHeight: '80%', borderWidth: 1, borderColor: '#2a2a3a' }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: 14 }}>Select Customer</Text>

            {/* Search input */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d14', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a3a', paddingHorizontal: 12, marginBottom: 12 }}>
              <Ionicons name="search" size={16} color="#555" />
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 15, paddingVertical: 10, paddingHorizontal: 8 }}
                placeholder="Name, email or phone..."
                placeholderTextColor="#444"
                value={customerQuery}
                onChangeText={(v) => {
                  setCustomerQuery(v);
                  searchCustomers(v);
                }}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={() => searchCustomers(customerQuery)}
              />
              {customerSearchLoading && <ActivityIndicator size="small" color="#6366f1" />}
              {customerQuery !== '' && !customerSearchLoading && (
                <TouchableOpacity onPress={() => { setCustomerQuery(''); searchCustomers(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color="#555" />
                </TouchableOpacity>
              )}
            </View>

            {/* Results list */}
            {customerResults.length === 0 && !customerSearchLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                <Ionicons name="people-outline" size={32} color="#333" />
                <Text style={{ color: '#555', fontSize: 13, marginTop: 8 }}>
                  {customerQuery ? 'No customers found' : 'Type to search customers'}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {customerResults.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e2e', gap: 12 }}
                    onPress={() => {
                      setCustomer(c.id, `${c.firstName} ${c.lastName}`);
                      setShowCustomerSearch(false);
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                        {c.firstName.charAt(0)}{c.lastName.charAt(0)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{c.firstName} {c.lastName}</Text>
                      {c.email ? <Text style={{ color: '#666', fontSize: 12 }} numberOfLines={1}>{c.email}</Text> : null}
                      {c.phone ? <Text style={{ color: '#555', fontSize: 11 }}>{c.phone}</Text> : null}
                    </View>
                    {c.loyaltyPoints != null && (
                      <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#f59e0b44' }}>
                        <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>{c.loyaltyPoints} pts</Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={14} color="#444" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Walk-in / no-customer shortcut */}
            <TouchableOpacity
              style={{ marginTop: 14, paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a3a' }}
              onPress={() => { setCustomer(null, null); setShowCustomerSearch(false); }}
            >
              <Text style={{ color: '#666', fontSize: 14 }}>Continue without customer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Tyro EFTPOS Transaction Modal ═══ */}
      <TyroTransactionModal
        visible={showTyroModal}
        amount={tyroAmount}
        title="Card Payment"
        onComplete={handleTyroComplete}
        onClose={() => setShowTyroModal(false)}
      />

      {/* ═══ ANZ Worldline TIM Payment Modal ═══ */}
      {showAnzModal && (
        <AnzPaymentModal
          visible={showAnzModal}
          amount={anzAmount}
          config={anzConfig}
          referenceId={anzRefId}
          title="Card Payment"
          onApproved={handleAnzApproved}
          onDeclined={handleAnzDeclined}
          onCancelled={handleAnzCancelled}
          onError={handleAnzError}
        />
      )}

    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  layout: { flex: 1, flexDirection: 'row' },

  /* ── Left pane ── */
  leftPane: {
    flex: 2.2,
    borderRightWidth: 1,
    borderRightColor: '#1e1e2e',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 6,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141425',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    height: 38,
  },
  searchInput: {
    flex: 1,
    color: '#ccc',
    fontSize: 13,
    paddingHorizontal: 8,
    height: 38,
  },
  custBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#141425',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 12,
    height: 38,
  },
  custBtnActive: { borderColor: '#6366f1', backgroundColor: '#1a1a35' },
  custName: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '600',
    maxWidth: 80,
  },

  /* ── Category bar ── */
  catBar: { maxHeight: 44, marginTop: 6 },
  catBarInner: { paddingHorizontal: 8, gap: 6, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#141425',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, color: '#999', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  /* ── Product grid ── */
  grid: { padding: 6, paddingBottom: 20 },
  card: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 10,
    margin: 3,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
    minHeight: 80,
  },
  cardActive: { borderColor: '#6366f1', backgroundColor: '#1a1a35' },
  cardDisabled: {
    borderColor: '#3a1a1a',
    backgroundColor: '#1a0d10',
    opacity: 0.7,
  },
  outOfStockBadge: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderColor: '#ef444466',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  outOfStockText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  cardColorBar: { height: 3 },
  cardBody: {
    padding: 8,
    flex: 1,
    justifyContent: 'space-between',
  },
  cardName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ccc',
    lineHeight: 15,
    marginBottom: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardPrice: { fontSize: 13, fontWeight: '800', color: '#6366f1' },
  cardBadge: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cardBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  /* ── Center states ── */
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: { fontSize: 14, color: '#555' },
  centerTextErr: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryBtn: {
    backgroundColor: '#1e1e2e',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryText: { color: '#ccc', fontWeight: '600', fontSize: 13 },

  /* ── Right pane (cart) ── */
  cartPanel: {
    flex: 1,
    backgroundColor: '#0a0a14',
    padding: 12,
    flexDirection: 'column',
  },
  cartHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cartTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  cartBadge: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  cartBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  cartEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.35,
  },
  cartEmptyText: { fontSize: 13, color: '#666', marginTop: 8 },

  cartList: { flex: 1 },
  cartRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2a',
  },
  cartItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cartDot: { width: 8, height: 8, borderRadius: 4 },
  cartItemName: { fontSize: 13, fontWeight: '600', color: '#ccc' },
  cartItemSub: { fontSize: 11, color: '#555', marginTop: 1 },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 16,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnPlus: { backgroundColor: '#6366f1' },
  qtyBtnLabel: { fontSize: 14, color: '#fff', fontWeight: '700' },
  qtyNum: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    minWidth: 18,
    textAlign: 'center',
  },
  lineTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    marginLeft: 'auto',
  },

  /* ── Totals ── */
  totalsWrap: {
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    paddingTop: 10,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  totalLabel: { fontSize: 17, fontWeight: '800', color: '#fff' },
  totalValue: { fontSize: 19, fontWeight: '900', color: '#6366f1' },
  gstNote: { fontSize: 11, color: '#555', marginBottom: 12 },

  chargeBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  chargeBtnOff: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  chargeText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  clearBtn: { paddingVertical: 6, alignItems: 'center' },
  clearText: { fontSize: 12, color: '#444' },
});
