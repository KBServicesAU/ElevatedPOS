import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  printSaleReceipts,
  printOrderTickets,
  printTyroMerchantReceipt,
  isConnected as isPrinterConnected,
  connectPrinter,
  type ReceiptLine,
} from '../../lib/printer';
import { useRouter } from 'expo-router';
import { initTyro, tyroPurchase, isTyroInitialized } from '../../modules/tyro-tta';
import { useTyroStore } from '../../store/tyro';
import {
  TyroTransactionModal,
  type TyroTransactionOutcome,
} from '../../components/TyroTransactionModal';
import { useDeviceSettings, getServerAnzConfig, getReceiptSettings } from '../../store/device-settings';

/**
 * v2.7.44 — hospitality order-type picker.
 *
 * Hospitality merchants need to tag every sale as Eat-In, Takeaway or
 * Delivery so the kitchen ticket and receipt show the right channel.
 * Retail/pharmacy/services merchants don't see the picker at all and
 * keep posting `orderType: 'retail'` exactly like before.
 */
type HospitalityOrderType = 'dine_in' | 'takeaway' | 'delivery';
const HOSPITALITY_ORDER_TYPES: { value: HospitalityOrderType; label: string }[] = [
  { value: 'dine_in',  label: 'Eat In'    },
  { value: 'takeaway', label: 'Takeaway'  },
  { value: 'delivery', label: 'Delivery'  },
];

/** Receipt label form ("Dine In" instead of internal `dine_in` snake_case). */
function hospitalityOrderTypeLabel(t: HospitalityOrderType): string {
  switch (t) {
    case 'dine_in':  return 'Dine In';
    case 'takeaway': return 'Takeaway';
    case 'delivery': return 'Delivery';
  }
}
import {
  AnzPaymentModal,
  type AnzPaymentResult,
} from '../../components/AnzPaymentModal';
import { useAnzBridge } from '../../components/AnzBridgeHost';
import {
  StripePaymentModal,
  type StripePaymentResult,
} from '../../components/payments/StripePaymentModal';
import { useStripeTerminalStore } from '../../store/stripe-terminal';
import { useTillStore } from '../../store/till';
// v2.7.48-univlog — universal transaction logger. Every payment outcome
// (Tyro, Stripe, cash, gift_card, layby, split, ANZ) gets one row in
// `terminal_transactions` for forensics + dashboards.
import { logTerminalTx } from '../../lib/terminal-tx-log';

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
  // v2.7.20 — surface an inline banner when the till is closed so the
  // operator knows why sales aren't being recorded against a shift. The
  // layout no longer auto-redirects to Open Till mid-session, so the
  // Sell screen itself has to show the state.
  const tillOpen  = useTillStore((s) => s.isOpen);
  const tillReady = useTillStore((s) => s.ready);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [charging, setCharging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // v2.7.44 — Hold flow: park the cart as a held order so the operator can
  // serve another customer / re-open it later from Orders → Resume.
  const [holding, setHolding] = useState(false);

  // Payment method modal
  const [showPayment, setShowPayment] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splitCardAmount, setSplitCardAmount] = useState('');
  const [splitCashAmount, setSplitCashAmount] = useState('');
  // Tracks cash/card amounts from a split payment so results can be reported
  // after the card terminal (Tyro / ANZ) approves the card portion.
  const [pendingSplit, setPendingSplit] = useState<{
    cardAmt: number;
    cashAmt: number;
    change: number;
  } | null>(null);

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

  // Loyalty redemption
  const [loyaltyAccount, setLoyaltyAccount] = useState<{ id: string; points: number; earnRate: number } | null>(null);
  const [showLoyaltyRedeem, setShowLoyaltyRedeem] = useState(false);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState('');
  const [loyaltyRedeemLoading, setLoyaltyRedeemLoading] = useState(false);

  // Tyro EFTPOS transaction modal
  const [showTyroModal, setShowTyroModal] = useState(false);
  const [tyroAmount, setTyroAmount] = useState(0);
  const tyroConfig = useTyroStore((s) => s.config);
  const hydrateTyro = useTyroStore((s) => s.hydrate);

  // ANZ Worldline TIM payment modal
  const [showAnzModal, setShowAnzModal] = useState(false);
  const [anzAmount, setAnzAmount] = useState(0);
  const [anzRefId, setAnzRefId] = useState('');
  // v2.7.23 — read the real ANZ terminal capability bits (set after
  // activateCompleted) so the Card button can surface "(Surcharge applies)"
  // based on the acquirer-level merchant config, not a stale local toggle.
  const anzCapabilities = useAnzBridge().capabilities;
  // Server-managed terminal config (replaces local anz/eftpos stores)
  const serverSettingsLoaded = useDeviceSettings((s) => s.loaded);

  // v2.7.44 — hospitality industry gating + order-type picker.
  // The /api/v1/devices/config response includes an `industry` field on
  // the identity block; we only render the picker when industry is
  // explicitly 'hospitality'. Older server builds (or retail merchants)
  // fall through to the existing `orderType: 'retail'` behaviour.
  const deviceIndustry = useDeviceSettings((s) => s.config?.identity?.industry);
  const isHospitality = deviceIndustry === 'hospitality';
  const [hospitalityOrderType, setHospitalityOrderType] = useState<HospitalityOrderType>('dine_in');

  // Stripe Terminal (Tap to Pay on Android)
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeAmount, setStripeAmount] = useState(0);
  const stripeConfig = useStripeTerminalStore((s) => s.config);

  // Gift card issuing modal
  const [showGiftCardModal, setShowGiftCardModal] = useState(false);
  const [giftCardAmount, setGiftCardAmount] = useState('');
  const [giftCardRecipientName, setGiftCardRecipientName] = useState('');
  const [giftCardRecipientEmail, setGiftCardRecipientEmail] = useState('');
  const [giftCardIssuing, setGiftCardIssuing] = useState(false);

  // Layby creation modal
  const [showLaybyModal, setShowLaybyModal] = useState(false);
  const [laybyDepositAmount, setLaybyDepositAmount] = useState('');
  const [laybyCustomerName, setLaybyCustomerName] = useState('');
  const [laybyCustomerPhone, setLaybyCustomerPhone] = useState('');
  const [laybyCreating, setLaybyCreating] = useState(false);

  // Fetch catalog + hydrate customer display on mount
  useEffect(() => {
    fetchAll();
    hydrateDisplay();
    hydrateTyro();
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
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          // v2.7.58 — also match against the registered barcodes so typing or
          // pasting a code into the search bar surfaces the matching product
          // card. The hidden barcode input below adds the product directly,
          // but this still helps for manual lookup / debugging "is this
          // barcode in the catalog?".
          (Array.isArray(p.barcodes) && p.barcodes.some((b) => b.toLowerCase().includes(q))),
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

  // ── Barcode scan-to-add (v2.7.58) ────────────────────────────────
  // USB barcode scanners on Android emit the digits as keystrokes followed
  // by an Enter suffix. Without a target input, the keystrokes were landing
  // on the sidebar's search-icon button (first focusable element in the
  // layout), and the Enter triggered its onPress, opening the command
  // palette — confusing and useless.
  //
  // The hidden TextInput rendered later in this screen captures the scan
  // via `onSubmitEditing`. We look the code up against the already-loaded
  // products array (catalog is hydrated locally) so a successful scan
  // adds to the cart with no network round-trip. If the code doesn't
  // match, we surface a not-found toast with the actual scanned value so
  // the operator knows whether to register it on the product.
  const barcodeInputRef = useRef<TextInput>(null);
  const handleBarcodeScan = useCallback((rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const match = products.find(
      (p) => Array.isArray(p.barcodes) && p.barcodes.includes(code),
    );
    if (!match) {
      toast.error('Barcode not found', `No active product registered with barcode ${code}.`);
      return;
    }
    if (unavailable.has(match.id)) {
      toast.warning('Unavailable', `${match.name} is marked as unavailable.`);
      return;
    }
    addItem({
      id: match.id,
      name: match.name,
      price: parsePrice(match.basePrice),
      categoryColor: match.categoryId ? colorMap.get(match.categoryId) : undefined,
    });
    toast.success('Scanned', `${match.name} added to cart.`);
  }, [products, unavailable, colorMap, addItem]);

  // ── Charge ───────────────────────────────────────────────────────
  async function handleCharge(
    paymentMethod: 'Card' | 'Cash' | 'Split' = 'Card',
    changeGiven = 0,
    tyroExtras?: { tipCents?: number; surchargeCents?: number; transactionTotalCents?: number; authCode?: string; cardLast4?: string; cardScheme?: string },
    cardExtras?: {
      cardType?: string;
      cardLast4?: string;
      authCode?: string;
      rrn?: string;
      /** Raw ANZ terminal receipt text — customer copy. */
      anzCustomerReceipt?: string;
      /** Raw ANZ terminal receipt text — merchant copy. */
      anzMerchantReceipt?: string;
    },
    cashExtras?: { tendered?: number },
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

    // Snapshot the cart for the receipt before we clear it on success.
    const cartSnapshot = cart.map((i) => ({ ...i }));
    const orderDiscountSnapshot = orderDiscountAmount;

    let orderNumber: string;
    let orderId: string;

    try {
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
      const token = authToken ?? identity?.deviceToken ?? '';
      // v2.7.44 — log every order-creation attempt with the surface-level
      // payload shape so the next regression (silent /complete drop, schema
      // mismatch, status-enum drift) is diagnosable from device logs alone.
      console.log('[POS/complete]', 'sell.handleCharge → POST /orders', {
        paymentMethod,
        lines: orderItems.length,
        total: orderTotal,
        paidTotal,
      });
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
          // v2.7.44 — hospitality merchants pick Eat-In / Takeaway / Delivery
          // in the cart panel; everyone else still posts 'retail'.
          orderType: isHospitality ? hospitalityOrderType : 'retail',
          lines: orderItems,
          ...(customerId ? { customerId } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        setCharging(false);
        const errBody = await res.json().catch(() => ({})) as { message?: string; detail?: string; title?: string };
        const errMsg = errBody.message ?? errBody.detail ?? errBody.title ?? `Server error (${res.status})`;
        console.error('[POS/complete]', 'sell.handleCharge POST /orders FAILED', res.status, errBody);
        Alert.alert('Order Failed', errMsg);
        return;
      }
      const data = await res.json();
      orderNumber = data.orderNumber;
      orderId = data.id;
      console.log('[POS/complete]', 'sell.handleCharge order created', { orderId, orderNumber });

      // Mark order as completed (fires order.completed Kafka event → loyalty points)
      //
      // v2.7.33 — fetch() does NOT throw on HTTP 4xx/5xx, so the old
      // try/catch silently swallowed server errors. Bug symptom: order
      // created successfully, /complete returns 500, POS shows "Sale
      // complete", but Postgres order.status stays 'open' forever — no
      // Kafka event, no ClickHouse row, dashboard shows $0 revenue,
      // Close-Till shows no sales. We now:
      //   1. Check res.ok and log the actual status/body
      //   2. Retry ONCE (cold-start latency or transient DB blip)
      //   3. Send `paymentMethod` so the EOD summary can split cash/card
      //   4. Warn the operator if both attempts fail so they know the
      //      order needs manual reconciliation (but don't refund the
      //      card — the money was already taken)
      const completeBody = JSON.stringify({
        paidTotal,
        changeGiven,
        paymentMethod,
        tipAmount: tipDollars || undefined,
        surchargeAmount: surchargeDollars || undefined,
      });
      let completed = false;
      let completeErr: string | null = null;
      for (let attempt = 0; attempt < 2 && !completed; attempt++) {
        try {
          console.log('[POS/complete]', 'sell.handleCharge → POST /complete', { orderId, attempt: attempt + 1, paymentMethod, paidTotal });
          const completeRes = await fetch(`${base}/api/v1/orders/${orderId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: completeBody,
            signal: AbortSignal.timeout(15000),
          });
          if (completeRes.ok) {
            completed = true;
            console.log('[POS/complete]', 'sell.handleCharge /complete OK', { orderId });
            break;
          }
          const errBody = await completeRes.json().catch(() => ({})) as { message?: string; detail?: string; title?: string };
          completeErr = errBody.detail ?? errBody.message ?? errBody.title ?? `HTTP ${completeRes.status}`;
          console.error('[POS/complete]', 'sell.handleCharge /complete non-OK', { orderId, status: completeRes.status, errBody });
          // 409 means the order is already completed (double-submit) —
          // treat as success, no need to retry.
          if (completeRes.status === 409) {
            completed = true;
            break;
          }
        } catch (err) {
          completeErr = err instanceof Error ? err.message : String(err);
          console.error('[POS/complete]', 'sell.handleCharge /complete threw', { orderId, err: completeErr });
        }
      }
      if (!completed) {
        // Log for diagnostics and warn the operator. Do NOT abort the
        // sale flow — the money was already taken on the terminal; the
        // order just needs to be re-closed server-side. Staff can do
        // this from Orders → find the open order → Reprint / Complete.
        console.error('[POS/complete]', 'sell.handleCharge /complete failed after retries', orderId, completeErr);
        toast.warning(
          'Order still open',
          `Sale was charged but the server did not mark it complete (${completeErr ?? 'unknown'}). Go to Orders to reconcile.`,
        );
      }

      // v2.7.48-univlog — log non-card sales to terminal_transactions.
      // Tyro/Stripe/ANZ already log from their respective callbacks BEFORE
      // handleCharge runs (so the operator can trace failed-auth attempts
      // that never reach a sale). For Cash + Split + the bare 'Card'
      // dev-fallback we log here, AFTER /complete, so the row carries
      // the orderId and the actual paidTotal.
      const isCardWithExtras = !!cardExtras || !!tyroExtras;
      if (!isCardWithExtras) {
        const provider: 'cash' | 'split' | 'card' =
          paymentMethod === 'Cash'  ? 'cash'
          : paymentMethod === 'Split' ? 'split'
          : 'card';
        logTerminalTx({
          provider,
          outcome: completed ? 'approved' : 'error',
          transactionType: 'purchase',
          amountCents: Math.round(paidTotal * 100),
          orderId,
          referenceId: orderNumber,
          errorCategory: completed ? null : 'order_complete_failed',
          errorMessage: completed ? null : (completeErr ?? null),
          raw: {
            paymentMethod,
            paidTotal,
            tendered: cashExtras?.tendered ?? null,
            changeGiven,
            tipDollars,
            surchargeDollars,
          },
        });
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

    // Auto-print receipt(s) if configured
    if (printerConfig.autoPrint && printerConfig.type) {
      try {
        if (!isPrinterConnected()) await connectPrinter();

        // Compute per-item and order-level discount totals so the receipt
        // can break them out on their own lines.
        let itemDiscountTotal = 0;
        const receiptItems: ReceiptLine[] = cartSnapshot.map((i) => {
          const discPerUnit = i.discount
            ? (i.discountType === '%' ? (i.price * i.discount / 100) : i.discount)
            : 0;
          const effectiveDisc = Math.min(discPerUnit, i.price);
          const lineDiscount = effectiveDisc * i.qty;
          itemDiscountTotal += lineDiscount;
          return {
            name: i.name,
            qty: i.qty,
            unitPrice: i.price,
            lineTotal: (i.price - effectiveDisc) * i.qty,
            discountAmount: lineDiscount > 0 ? +lineDiscount.toFixed(2) : undefined,
            note: i.note,
            seat: i.seat,
          };
        });

        await printSaleReceipts({
          store: {
            name: identity?.label || 'ElevatedPOS',
            // v2.7.20 — device label doubles as branch hint; register id
            // as device. Real branch/QR metadata will come from the
            // server-side device settings in a follow-up.
            ...(identity?.label ? { branch: identity.label } : {}),
            ...(identity?.registerId ? { device: identity.registerId } : {}),
          },
          order: {
            orderNumber,
            registerLabel: identity?.registerId ?? undefined,
            cashierName: authEmployee
              ? `${authEmployee.firstName} ${authEmployee.lastName}`
              : undefined,
            customerName: customerName ?? undefined,
            orderedAt: new Date(),
            showOrderNumber: getReceiptSettings().showOrderNumber,
            // v2.7.44 — render "Order #1234 · Dine In" on hospitality receipts.
            orderTypeLabel: isHospitality
              ? hospitalityOrderTypeLabel(hospitalityOrderType)
              : undefined,
          },
          items: receiptItems,
          totals: {
            subtotalExGst: +(orderTotal - orderGst).toFixed(2),
            itemDiscount: itemDiscountTotal > 0 ? +itemDiscountTotal.toFixed(2) : undefined,
            orderDiscount: orderDiscountSnapshot > 0 ? +orderDiscountSnapshot.toFixed(2) : undefined,
            gst: orderGst,
            surcharge: surchargeDollars || undefined,
            tip: tipDollars || undefined,
            total: paidTotal,
          },
          payment: {
            method: paymentMethod,
            tendered: cashExtras?.tendered,
            changeGiven: changeGiven > 0 ? changeGiven : undefined,
            cardType:  cardExtras?.cardType  ?? tyroExtras?.cardScheme,
            cardLast4: cardExtras?.cardLast4 ?? tyroExtras?.cardLast4,
            authCode:  cardExtras?.authCode  ?? tyroExtras?.authCode,
            rrn:       cardExtras?.rrn,
          },
          anzCustomerReceipt: cardExtras?.anzCustomerReceipt,
          anzMerchantReceipt: cardExtras?.anzMerchantReceipt,
          traceId: orderNumber,
        });
      } catch {
        // Print failed — don't block order
      }
    }

    // Print kitchen / bar / etc. order ticket(s) if enabled.
    // v2.7.48 — `printOrderTickets` groups lines by category.printerDestination
    // and dispatches each group to the matching printer. Single-printer rigs
    // still work because the routing helper falls back to the legacy
    // cfg.orderPrinter when no multi-printer entries are configured.
    if (printerConfig.printOrderTicket) {
      try {
        const productIndex = useCatalogStore.getState().products;
        const categoryIndex = useCatalogStore.getState().categories;
        const lines = cart.map((i) => {
          const product = productIndex.find((p) => p.id === i.id);
          const category = product?.categoryId
            ? categoryIndex.find((c) => c.id === product.categoryId)
            : undefined;
          return {
            name: i.name,
            qty: i.qty,
            note: i.note,
            destination: category?.printerDestination ?? 'kitchen',
          };
        });
        await printOrderTickets({
          orderNumber,
          orderTypeLabel: isHospitality
            ? hospitalityOrderTypeLabel(hospitalityOrderType)
            : undefined,
          lines,
        });
      } catch {
        // Best-effort: never block the sale on a kitchen-ticket failure.
      }
    }

    clearCart();
    if (displaySettings.enabled) showThankYou();
    toast.success('Order Placed', `Order #${orderNumber} — $${paidTotal.toFixed(2)}`);
    setCharging(false);
  }

  // ── Hold (v2.7.44) ───────────────────────────────────────────────
  // Creates the order on the server and immediately transitions it to
  // 'held'. The operator can find it in Orders → Held and Resume it,
  // which rehydrates the cart for re-checkout.
  async function handleHold() {
    if (cart.length === 0 || holding || charging) return;
    setHolding(true);
    try {
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
      const authToken = useAuthStore.getState().employeeToken;
      const token = authToken ?? identity?.deviceToken ?? '';
      const lines = cart.map((i) => ({
        productId: i.id,
        name: i.name,
        quantity: i.qty,
        unitPrice: i.price,
        costPrice: 0,
        taxRate: 10,
        ...(i.note ? { notes: i.note } : {}),
        ...(i.seat !== undefined ? { seatNumber: i.seat } : {}),
      }));

      // Step 1 — create the order (status defaults to 'open')
      const createRes = await fetch(`${base}/api/v1/orders`, {
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
          lines,
          ...(customerId ? { customerId } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!createRes.ok) {
        const errBody = await createRes.json().catch(() => ({})) as { message?: string; detail?: string; title?: string };
        const errMsg = errBody.message ?? errBody.detail ?? errBody.title ?? `Server error (${createRes.status})`;
        toast.error('Hold Failed', errMsg);
        return;
      }
      const created = await createRes.json();
      const orderId: string = created.id;
      const orderNumber: string = created.orderNumber;

      // Step 2 — flip to 'held'
      const holdRes = await fetch(`${base}/api/v1/orders/${orderId}/hold`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!holdRes.ok) {
        const errBody = await holdRes.json().catch(() => ({})) as { message?: string; detail?: string };
        toast.warning(
          'Held with warnings',
          errBody.detail ?? errBody.message ?? `Hold returned ${holdRes.status}; order #${orderNumber} stayed open.`,
        );
      }

      // Reset POS state so the next operator/customer starts fresh.
      clearCart();
      setOrderDiscountAmount(0);
      setLoyaltyAccount(null);
      setCashTendered('');

      toast.success('Held', `#${orderNumber} — open Orders to resume`);
      // Stay on the Sell home with an empty cart — no router push needed
      // because we're already here, but if a child route were active we'd
      // still want the empty cart state. Defensive replace keeps the URL
      // clean if Expo Router ever stacks anything.
      router.replace('/(pos)/sell' as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Hold Failed', msg);
    } finally {
      setHolding(false);
    }
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
    if (getServerAnzConfig()) {
      setAnzAmount(total);
      setAnzRefId(`POS-${Date.now()}`);
      setShowAnzModal(true);
      return;
    }

    // Check for Stripe Terminal (Tap to Pay)
    // Guard with `enabled` flag — having the publishable key in the build env
    // does NOT mean Terminal is installed or configured on this device.
    const stripeKey = stripeConfig.publishableKey;
    if (stripeConfig.enabled && stripeKey && !isTyroInitialized() && !getServerAnzConfig()) {
      setStripeAmount(Math.round(total * 100));
      setShowStripeModal(true);
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

    // v2.7.48-univlog — log every Tyro outcome, not just approvals. The
    // merchant + ANZ-style cert reviewers need a unified audit trail
    // across providers.
    const tyroLogOutcome: 'approved' | 'cancelled' | 'declined' | 'error' =
      outcome === 'APPROVED' ? 'approved'
      : outcome === 'CANCELLED' ? 'cancelled'
      : outcome === 'DECLINED' ? 'declined'
      : 'error';
    const tyroAmtCents = result.transactionAmount
      ? parseInt(String(result.transactionAmount), 10)
      : Math.round((tyroAmount || total) * 100);
    logTerminalTx({
      provider: 'tyro',
      outcome: tyroLogOutcome,
      transactionType: 'purchase',
      amountCents: Number.isFinite(tyroAmtCents) ? tyroAmtCents : null,
      transactionRef: result.transactionReference ?? null,
      authCode: result.authorisationCode ?? null,
      rrn: result.rrn ?? null,
      maskedPan: result.elidedPan ?? null,
      cardType: result.cardType ?? null,
      merchantReceipt: outcomeEvent.merchantReceipt ?? null,
      customerReceipt: result.customerReceipt ?? null,
      errorCategory: tyroLogOutcome === 'error' ? 'tyro_system_error' : null,
      errorMessage: result.errorMessage ?? null,
      raw: result,
    });

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
    handleCharge(split ? 'Split' : 'Card', 0, undefined, {
      cardType:  result.cardType,
      cardLast4: result.cardLast4,
      authCode:  result.authCode,
      rrn:       result.rrn,
      anzCustomerReceipt: result.customerReceipt,
      anzMerchantReceipt: result.merchantReceipt,
    });

    const cardDesc = result.cardType
      ? `${result.cardType} ••••${result.cardLast4 ?? ''}`
      : `Auth: ${result.authCode ?? result.transactionRef ?? 'OK'}`;

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
    toast.error('Card Declined', result.declineReason || 'The card was declined by the bank.');
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
    handleCharge('Cash', change, undefined, undefined, { tendered });
    if (change > 0) {
      toast.info('Change Due', `$${change.toFixed(2)}`);
    }
  }

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
    if (cardAmt > 0 && getServerAnzConfig()) {
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

  // ── Issue gift card ──────────────────────────────────────────────
  async function handleIssueGiftCard() {
    const amount = parseFloat(giftCardAmount) || 0;
    if (amount <= 0) {
      toast.warning('Invalid Amount', 'Please enter a valid gift card amount.');
      return;
    }
    setGiftCardIssuing(true);
    try {
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
      const token = useAuthStore.getState().employeeToken ?? identity?.deviceToken ?? '';
      const res = await fetch(`${base}/api/v1/gift-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          balance: Math.round(amount * 100),
          customerName: giftCardRecipientName.trim() || undefined,
          locationId: identity?.locationId ?? '',
          ...(giftCardRecipientEmail.trim() ? { email: giftCardRecipientEmail.trim(), sendEmail: true } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string; detail?: string };
        // v2.7.48-univlog — record the failure for forensics.
        logTerminalTx({
          provider: 'gift_card',
          outcome: 'error',
          transactionType: 'purchase',
          amountCents: Math.round(amount * 100),
          errorCategory: 'gift_card_create_failed',
          errorMessage: err.message ?? err.detail ?? `HTTP ${res.status}`,
        });
        toast.error('Gift Card Failed', err.message ?? err.detail ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json() as { code?: string; balance?: number };
      const code = data.code ?? '';
      // v2.7.48-univlog — gift-card issuance is a transaction in its own
      // right; log so the merchant sees it in the unified Logs page.
      logTerminalTx({
        provider: 'gift_card',
        outcome: 'approved',
        transactionType: 'purchase',
        amountCents: Math.round(amount * 100),
        referenceId: code || null,
        raw: { code, balance: data.balance, recipient: giftCardRecipientName.trim() || null, email: giftCardRecipientEmail.trim() || null },
      });
      toast.success('Gift Card Issued', `${code} · $${amount.toFixed(2)}`);
      setShowGiftCardModal(false);
      setShowPayment(false);
      setGiftCardAmount('');
      setGiftCardRecipientName('');
      setGiftCardRecipientEmail('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Gift Card Failed', msg);
    } finally {
      setGiftCardIssuing(false);
    }
  }

  // ── Create layby ─────────────────────────────────────────────────
  async function handleCreateLayby() {
    if (cart.length === 0) return;
    const depositAmt = parseFloat(laybyDepositAmount) || 0;
    if (depositAmt <= 0) {
      toast.warning('Invalid Deposit', 'Please enter a deposit amount.');
      return;
    }
    if (!laybyCustomerName.trim()) {
      toast.warning('Customer Required', 'Please enter the customer name.');
      return;
    }
    setLaybyCreating(true);
    try {
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
      const token = useAuthStore.getState().employeeToken ?? identity?.deviceToken ?? '';
      const res = await fetch(`${base}/api/v1/laybys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerName: laybyCustomerName.trim(),
          customerPhone: laybyCustomerPhone.trim() || undefined,
          description: cart.map((i) => `${i.qty}x ${i.name}`).join(', '),
          totalAmount: Math.round(total * 100),
          depositAmount: Math.round(depositAmt * 100),
          locationId: identity?.locationId ?? '',
          items: cart.map((i) => ({ productId: i.id, name: i.name, quantity: i.qty, unitPrice: i.price })),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string; detail?: string };
        logTerminalTx({
          provider: 'layby',
          outcome: 'error',
          transactionType: 'purchase',
          amountCents: Math.round(depositAmt * 100),
          errorCategory: 'layby_create_failed',
          errorMessage: err.message ?? err.detail ?? `HTTP ${res.status}`,
        });
        toast.error('Layby Failed', err.message ?? err.detail ?? `Error ${res.status}`);
        return;
      }
      // v2.7.48-univlog — record the layby deposit. The cart total is
      // captured in `raw` so the merchant can reconcile against the
      // layby agreement in the dashboard.
      logTerminalTx({
        provider: 'layby',
        outcome: 'approved',
        transactionType: 'purchase',
        amountCents: Math.round(depositAmt * 100),
        raw: {
          totalAmountCents: Math.round(total * 100),
          depositCents: Math.round(depositAmt * 100),
          customerName: laybyCustomerName.trim(),
          customerPhone: laybyCustomerPhone.trim() || null,
          itemCount: cart.length,
        },
      });
      toast.success('Layby Created', `$${depositAmt.toFixed(2)} deposit recorded`);
      setShowLaybyModal(false);
      setLaybyDepositAmount('');
      setLaybyCustomerName('');
      setLaybyCustomerPhone('');
      clearCart();
      setOrderDiscountAmount(0);
      setLoyaltyAccount(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Layby Failed', msg);
    } finally {
      setLaybyCreating(false);
    }
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

  // Fetch loyalty account for the selected customer (best-effort, non-blocking)
  async function fetchLoyaltyAccount(cId: string) {
    setLoyaltyAccount(null);
    try {
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
      const token = useAuthStore.getState().employeeToken ?? identity?.deviceToken ?? '';
      const res = await fetch(
        `${base}/api/v1/loyalty/accounts/customer/${encodeURIComponent(cId)}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) },
      );
      if (res.ok) {
        const data = await res.json() as { data?: Array<{ id: string; points: number; program?: { earnRate?: number } }> };
        const accounts = data.data ?? [];
        if (accounts.length > 0) {
          const acc = accounts[0]!;
          setLoyaltyAccount({
            id: acc.id,
            points: acc.points ?? 0,
            earnRate: acc.program?.earnRate ?? 10,
          });
        }
      }
    } catch {
      // Non-fatal — loyalty badge just won't show
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* ── Hidden barcode-scanner capture (v2.7.58) ─────────────────────
          Auto-focuses on screen mount + after every successful scan so a
          USB scanner's Enter-terminated keystroke stream lands here
          instead of the sidebar search-icon button (which used to open
          the command palette on every scan). `showSoftInputOnFocus={false}`
          keeps the soft keyboard from popping up on touch devices —
          relevant only for hardware-scanner workflows. */}
      <TextInput
        ref={barcodeInputRef}
        autoFocus
        showSoftInputOnFocus={false}
        blurOnSubmit={false}
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        onSubmitEditing={(e) => {
          const code = e.nativeEvent.text;
          handleBarcodeScan(code);
          // Clear via the native ref + restore focus for the next scan.
          barcodeInputRef.current?.clear();
          requestAnimationFrame(() => barcodeInputRef.current?.focus());
        }}
        // Off-screen but mounted — lets us reliably accept hardware-keyboard
        // events without taking up any visible layout. opacity:0 alone
        // wouldn't be enough as some devices still render a caret/border.
        style={{
          position: 'absolute',
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          opacity: 0,
        }}
      />

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

      {/* ═══ Till-closed banner (v2.7.20) ═══
          Shown when the operator is logged in but the till has not been
          opened. Non-blocking — they can still browse the catalog; the
          banner just makes the state visible and offers a one-tap route
          to the Open Till screen. */}
      {authEmployee && tillReady && !tillOpen && (
        <View style={styles.tillClosedBanner}>
          <Ionicons name="lock-closed-outline" size={16} color="#f59e0b" />
          <Text style={styles.tillClosedText}>
            Till is closed. Open the till to start a shift.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(pos)/open-till' as never)}
            style={styles.tillClosedBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.tillClosedBtnText}>Open Till</Text>
          </TouchableOpacity>
        </View>
      )}

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
                  if (removeIt) { setCustomer(null, null); setLoyaltyAccount(null); }
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
            {/* Loyalty redemption button — only shown when customer has points */}
            {loyaltyAccount && loyaltyAccount.points > 0 && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#f59e0b44', backgroundColor: 'rgba(245,158,11,0.1)' }}
                onPress={() => { setLoyaltyPointsToRedeem(String(loyaltyAccount.points)); setShowLoyaltyRedeem(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="star" size={13} color="#f59e0b" />
                <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>{loyaltyAccount.points} pts</Text>
              </TouchableOpacity>
            )}
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

          {/* v2.7.44 — hospitality-only order-type picker (Eat In / Takeaway / Delivery). */}
          {isHospitality && (
            <View style={styles.orderTypeRow}>
              {HOSPITALITY_ORDER_TYPES.map((opt) => {
                const active = hospitalityOrderType === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.orderTypeBtn, active && styles.orderTypeBtnActive]}
                    onPress={() => setHospitalityOrderType(opt.value)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Order type: ${opt.label}`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.orderTypeText, active && styles.orderTypeTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

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
                      ${(() => {
                        const disc = item.discount
                          ? (item.discountType === '%' ? (item.price * item.discount / 100) : item.discount)
                          : 0;
                        return ((item.price - Math.min(disc, item.price)) * item.qty).toFixed(2);
                      })()}
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

              {/* v2.7.44 — Charge + Hold side-by-side. Charge is the
                  primary action (75% width), Hold is a smaller secondary
                  action that parks the cart for later. */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.chargeBtn,
                    { flex: 3, marginBottom: 0 },
                    (charging || holding || cart.length === 0) && styles.chargeBtnOff,
                  ]}
                  onPress={() => setShowPayment(true)}
                  disabled={charging || holding || cart.length === 0}
                  activeOpacity={0.85}
                >
                  <Text style={styles.chargeText}>
                    {charging
                      ? 'Processing...'
                      : `Charge $${total.toFixed(2)}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.holdBtn,
                    (charging || holding || cart.length === 0) && styles.chargeBtnOff,
                  ]}
                  onPress={handleHold}
                  disabled={charging || holding || cart.length === 0}
                  activeOpacity={0.85}
                >
                  {holding ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="pause-circle" size={18} color="#fff" />
                      <Text style={styles.holdBtnText}>Hold</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={[styles.clearBtn, { flex: 1 }]} onPress={() => router.push('/(pos)/split-check' as never)}>
                  <Text style={[styles.clearText, { color: '#6366f1' }]}>Split</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.clearBtn, { flex: 1 }]} onPress={() => setShowOrderDiscount(true)}>
                  <Text style={[styles.clearText, { color: '#f59e0b' }]}>Discount</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.clearBtn, { flex: 1, borderColor: '#22c55e44' }]}
                  onPress={() => { setLaybyDepositAmount(''); setLaybyCustomerName(customerName ?? ''); setLaybyCustomerPhone(''); setShowLaybyModal(true); }}
                >
                  <Text style={[styles.clearText, { color: '#22c55e' }]}>Layby</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.clearBtn, { flex: 1 }]} onPress={() => { clearCart(); setOrderDiscountAmount(0); setLoyaltyAccount(null); }}>
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
                    Card / EFTPOS{(() => {
                      // v2.7.23 — show "(Surcharge applies)" based on the
                      // active payment provider:
                      //   Tyro  → the local enableSurcharge toggle
                      //   ANZ   → the terminal-reported capability bit
                      //           (set after activateCompleted)
                      const anzActive = !!getServerAnzConfig();
                      const surchargeOn = anzActive
                        ? !!anzCapabilities?.canSurcharge
                        : tyroConfig.enableSurcharge;
                      return surchargeOn ? ' (Surcharge applies)' : '';
                    })()}
                  </Text>
                  {tyroConfig.cashoutEnabled && parseFloat(cashoutDollars) > 0 && (
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff', opacity: 0.85, marginTop: 2 }}>
                      ${total.toFixed(2)} + ${(parseFloat(cashoutDollars) || 0).toFixed(2)} cashout
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={{ backgroundColor: '#141425', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10 }}>
                  <Text style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>Cash Tendered</Text>

                  {/* Quick-tender chips — Exact, then next four $5 increments
                      rounded UP from the total. e.g. total $12.30 → chips
                      show $12.30 · $15 · $20 · $25 · $30. */}
                  {(() => {
                    const exact = parseFloat(total.toFixed(2));
                    const nextFive = Math.ceil(total / 5) * 5;
                    const quickAmounts: number[] = [exact];
                    let next = nextFive;
                    if (next === exact) next = exact + 5;
                    for (let i = 0; i < 4; i++) {
                      quickAmounts.push(next);
                      next += 5;
                    }
                    return (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {quickAmounts.map((amt, i) => {
                          const isExact = i === 0;
                          const selected = cashTendered === amt.toFixed(2);
                          return (
                            <TouchableOpacity
                              key={`${i}-${amt}`}
                              style={{
                                flex: 1,
                                minWidth: 70,
                                backgroundColor: selected ? '#6366f1' : '#0d0d14',
                                borderRadius: 10,
                                paddingVertical: 12,
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: selected ? '#6366f1' : (isExact ? '#22c55e66' : '#2a2a3a'),
                              }}
                              onPress={() => setCashTendered(amt.toFixed(2))}
                              activeOpacity={0.8}
                            >
                              <Text style={{ fontSize: 10, color: isExact ? '#22c55e' : '#888', fontWeight: '700', letterSpacing: 1 }}>
                                {isExact ? 'EXACT' : ''}
                              </Text>
                              <Text style={{ fontSize: 15, fontWeight: '800', color: selected ? '#fff' : '#eee', marginTop: isExact ? 2 : 11 }}>
                                ${amt.toFixed(amt % 1 === 0 ? 0 : 2)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })()}

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
                <TouchableOpacity
                  style={{ backgroundColor: '#141425', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#22c55e44' }}
                  onPress={() => { setShowPayment(false); setGiftCardAmount(''); setGiftCardRecipientName(''); setGiftCardRecipientEmail(''); setShowGiftCardModal(true); }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#22c55e' }}>Issue Gift Card</Text>
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
                      fetchLoyaltyAccount(c.id);
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

      {/* ═══ Loyalty Redemption Modal ═══ */}
      {loyaltyAccount && (
        <Modal visible={showLoyaltyRedeem} transparent animationType="fade" onRequestClose={() => setShowLoyaltyRedeem(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={() => setShowLoyaltyRedeem(false)}>
            <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 18, padding: 22, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Ionicons name="star" size={20} color="#f59e0b" />
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Redeem Points</Text>
              </View>
              <Text style={{ color: '#888', fontSize: 13, marginBottom: 18 }}>
                {customerName} has {loyaltyAccount.points} points available
              </Text>

              <Text style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>
                Points to redeem
              </Text>
              <TextInput
                style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 20, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10 }}
                value={loyaltyPointsToRedeem}
                onChangeText={(v) => {
                  const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
                  setLoyaltyPointsToRedeem(isNaN(n) ? '' : String(Math.min(n, loyaltyAccount.points)));
                }}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#444"
              />
              {(() => {
                const pts = parseInt(loyaltyPointsToRedeem, 10) || 0;
                // earnRate is points per dollar — discount = pts / earnRate
                const discount = pts > 0 ? +(pts / loyaltyAccount.earnRate).toFixed(2) : 0;
                return (
                  <Text style={{ color: '#f59e0b', fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: 18 }}>
                    = ${discount.toFixed(2)} discount
                  </Text>
                );
              })()}

              <TouchableOpacity
                style={{ backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8, opacity: loyaltyRedeemLoading ? 0.6 : 1 }}
                disabled={loyaltyRedeemLoading || !loyaltyPointsToRedeem || parseInt(loyaltyPointsToRedeem, 10) <= 0}
                onPress={async () => {
                  const pts = parseInt(loyaltyPointsToRedeem, 10);
                  if (!pts || pts <= 0 || pts > loyaltyAccount.points) return;
                  setLoyaltyRedeemLoading(true);
                  try {
                    const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
                    const token = useAuthStore.getState().employeeToken ?? identity?.deviceToken ?? '';
                    // Pre-authorise the redemption (deduct points from balance)
                    const res = await fetch(`${base}/api/v1/loyalty/accounts/${loyaltyAccount.id}/redeem`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({
                        points: pts,
                        orderId: undefined, // orderId not known yet — will be linked on order creation
                        idempotencyKey: `pos-redeem-${loyaltyAccount.id}-${Date.now()}`,
                      }),
                      signal: AbortSignal.timeout(8000),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({})) as { title?: string; detail?: string };
                      toast.warning('Redemption Failed', err.title ?? err.detail ?? `Error ${res.status}`);
                      return;
                    }
                    const discount = +(pts / loyaltyAccount.earnRate).toFixed(2);
                    setOrderDiscountAmount((prev) => Math.min(prev + discount, subtotal));
                    setLoyaltyAccount({ ...loyaltyAccount, points: loyaltyAccount.points - pts });
                    setShowLoyaltyRedeem(false);
                    toast.success('Points Redeemed', `${pts} pts = $${discount.toFixed(2)} discount applied`);
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    toast.warning('Redemption Failed', msg);
                  } finally {
                    setLoyaltyRedeemLoading(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#000', fontWeight: '800', fontSize: 15 }}>
                  {loyaltyRedeemLoading ? 'Processing…' : 'Apply Discount'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowLoyaltyRedeem(false)}>
                <Text style={{ color: '#888', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ═══ Tyro EFTPOS Transaction Modal ═══ */}
      <TyroTransactionModal
        visible={showTyroModal}
        amount={tyroAmount}
        title="Card Payment"
        onComplete={handleTyroComplete}
        onClose={() => setShowTyroModal(false)}
      />

      {/* ═══ ANZ Worldline TIM Payment Modal ═══ */}
      {showAnzModal && getServerAnzConfig() && (
        <AnzPaymentModal
          visible={showAnzModal}
          amount={anzAmount}
          config={getServerAnzConfig()!}
          referenceId={anzRefId}
          title="Card Payment"
          onApproved={handleAnzApproved}
          onDeclined={handleAnzDeclined}
          onCancelled={handleAnzCancelled}
          onError={handleAnzError}
        />
      )}

      {/* ═══ Stripe Terminal Tap to Pay Modal ═══ */}
      <StripePaymentModal
        visible={showStripeModal}
        amountCents={stripeAmount}
        orderId={undefined}
        onApproved={(result) => {
          setShowStripeModal(false);
          // v2.7.48-univlog — capture every Stripe outcome.
          logTerminalTx({
            provider: 'stripe',
            outcome: 'approved',
            transactionType: 'purchase',
            amountCents: result.amount ?? stripeAmount,
            transactionRef: result.paymentIntentId ?? null,
            authCode: result.paymentIntentId ?? null,
            cardType: result.cardBrand ?? null,
            maskedPan: result.cardLast4 ? `**** **** **** ${result.cardLast4}` : null,
            raw: result,
          });
          handleCharge('Card', 0, {
            authCode: result.paymentIntentId,
            cardLast4: result.cardLast4,
            cardScheme: result.cardBrand,
          });
        }}
        onDeclined={(result) => {
          setShowStripeModal(false);
          logTerminalTx({
            provider: 'stripe',
            outcome: 'declined',
            transactionType: 'purchase',
            amountCents: stripeAmount,
            transactionRef: result.paymentIntentId ?? null,
            errorCategory: 'stripe_declined',
            errorMessage: result.errorMessage ?? null,
            errorStep: result.declineCode ?? null,
            raw: result,
          });
          toast.error('Payment Declined', result.errorMessage ?? 'Card was declined');
        }}
        onCancel={() => {
          setShowStripeModal(false);
          logTerminalTx({
            provider: 'stripe',
            outcome: 'cancelled',
            transactionType: 'purchase',
            amountCents: stripeAmount,
          });
        }}
      />

      {/* ═══ Issue Gift Card Modal ═══ */}
      <Modal visible={showGiftCardModal} transparent animationType="fade" onRequestClose={() => setShowGiftCardModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowGiftCardModal(false)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 340, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 6 }}>Issue Gift Card</Text>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Create a new gift card for a customer</Text>

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Amount ($)</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 24, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 14 }}
              value={giftCardAmount}
              onChangeText={setGiftCardAmount}
              keyboardType="decimal-pad"
              placeholder="50.00"
              placeholderTextColor="#444"
            />

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Recipient Name (optional)</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 12 }}
              value={giftCardRecipientName}
              onChangeText={setGiftCardRecipientName}
              placeholder="e.g. Jane Smith"
              placeholderTextColor="#444"
              autoCapitalize="words"
            />

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Recipient Email (optional)</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 20 }}
              value={giftCardRecipientEmail}
              onChangeText={setGiftCardRecipientEmail}
              placeholder="jane@example.com"
              placeholderTextColor="#444"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={{ backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10, opacity: giftCardIssuing ? 0.6 : 1 }}
              onPress={handleIssueGiftCard}
              disabled={giftCardIssuing}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                {giftCardIssuing ? 'Issuing...' : 'Issue Gift Card'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowGiftCardModal(false)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#666', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Create Layby Modal ═══ */}
      <Modal visible={showLaybyModal} transparent animationType="fade" onRequestClose={() => setShowLaybyModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowLaybyModal(false)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 340, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 4 }}>Create Layby</Text>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>Total: ${total.toFixed(2)} · {cart.length} item{cart.length !== 1 ? 's' : ''}</Text>

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Customer Name</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 12 }}
              value={laybyCustomerName}
              onChangeText={setLaybyCustomerName}
              placeholder="e.g. Jane Smith"
              placeholderTextColor="#444"
              autoCapitalize="words"
            />

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Customer Phone (optional)</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 12 }}
              value={laybyCustomerPhone}
              onChangeText={setLaybyCustomerPhone}
              placeholder="e.g. 0412 345 678"
              placeholderTextColor="#444"
              keyboardType="phone-pad"
            />

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Deposit Amount ($)</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 8 }}
              value={laybyDepositAmount}
              onChangeText={setLaybyDepositAmount}
              keyboardType="decimal-pad"
              placeholder={`Min $${(total * 0.1).toFixed(2)} (10%)`}
              placeholderTextColor="#444"
            />
            {laybyDepositAmount && parseFloat(laybyDepositAmount) > 0 && (
              <Text style={{ color: parseFloat(laybyDepositAmount) >= total * 0.1 ? '#22c55e' : '#f59e0b', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 12 }}>
                {parseFloat(laybyDepositAmount) >= total * 0.1
                  ? `Remaining: $${Math.max(0, total - parseFloat(laybyDepositAmount)).toFixed(2)}`
                  : `Min deposit is $${(total * 0.1).toFixed(2)} (10%)`}
              </Text>
            )}
            {!laybyDepositAmount && <View style={{ height: 12 }} />}

            <TouchableOpacity
              style={{ backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10, opacity: laybyCreating ? 0.6 : 1 }}
              onPress={handleCreateLayby}
              disabled={laybyCreating}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                {laybyCreating ? 'Creating...' : 'Create Layby'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowLaybyModal(false)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#666', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  layout: { flex: 1, flexDirection: 'row' },

  // Till-closed inline banner (v2.7.20)
  tillClosedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,158,11,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tillClosedText: {
    flex: 1,
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '700',
  },
  tillClosedBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tillClosedBtnText: {
    color: '#0d0d14',
    fontSize: 11,
    fontWeight: '800',
  },

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

  /* v2.7.44 — hospitality order-type picker (Eat In / Takeaway / Delivery) */
  orderTypeRow: {
    flexDirection: 'row',
    backgroundColor: '#10101d',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  orderTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  orderTypeBtnActive: { backgroundColor: '#6366f1' },
  orderTypeText: { fontSize: 12, fontWeight: '700', color: '#888' },
  orderTypeTextActive: { color: '#fff' },

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
  holdBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  holdBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  clearBtn: { paddingVertical: 6, alignItems: 'center' },
  clearText: { fontSize: 12, color: '#444' },
});
