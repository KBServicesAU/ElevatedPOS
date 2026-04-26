import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  printTyroMerchantReceipt,
} from '../../lib/printer';
import { initTyro, isTyroInitialized, tyroPurchase } from '../../modules/tyro-tta';
import { useTyroStore } from '../../store/tyro';
import {
  TyroTransactionModal,
  type TyroTransactionOutcome,
} from '../../components/TyroTransactionModal';
import { useDeviceSettings, getServerAnzConfig } from '../../store/device-settings';

/**
 * v2.7.44 — hospitality order-type picker (mirrors sell.tsx).
 * Renders only when the merchant's industry is 'hospitality'; everyone
 * else continues to post `orderType: 'retail'` like before.
 */
type HospitalityOrderType = 'dine_in' | 'takeaway' | 'delivery';
const HOSPITALITY_ORDER_TYPES: { value: HospitalityOrderType; label: string }[] = [
  { value: 'dine_in',  label: 'Eat In'    },
  { value: 'takeaway', label: 'Takeaway'  },
  { value: 'delivery', label: 'Delivery'  },
];
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
 *
 * v2.7.40 — payment flow rebuilt to match sell.tsx exactly:
 *   - Card / Cash / Split modal (quick-tender chips on the cash row:
 *     Exact + next four $5 increments)
 *   - Card flow fans out to Tyro → ANZ Worldline TIM → Stripe Terminal
 *     using the same fall-through pattern sell.tsx uses
 *   - handleCharge() mirrors sell.tsx's signature (tyroExtras / cardExtras /
 *     cashExtras), so the receipt, /complete payload, and surcharge/tip
 *     treatment are identical
 *   - Receipts go through printSaleReceipts with the ANZ customer + merchant
 *     receipt text attached, so card-paid Quick Sales produce the same
 *     paper as Sell
 */
export default function QuickSaleScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const authEmployee = useAuthStore((s) => s.employee);
  const authToken = useAuthStore((s) => s.employeeToken);
  const printerConfig = usePrinterStore((s) => s.config);
  const customerId = usePosStore((s) => s.customerId);
  const customerName = usePosStore((s) => s.customerName);

  const [amountStr, setAmountStr] = useState('0');
  const [description, setDescription] = useState('');
  const [charging, setCharging] = useState(false);

  // Payment method modal (matches sell.tsx)
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

  // Optional Tyro extras — cashout is the only Sell feature that doesn't
  // make sense on Quick Sale (no cart discounts etc), but keeping the
  // same state shape means we can lift the Sell modal body wholesale.
  const [cashoutDollars, setCashoutDollars] = useState('');

  // Tyro transaction modal
  const [showTyroModal, setShowTyroModal] = useState(false);
  const [tyroAmount, setTyroAmount] = useState(0);
  const tyroConfig = useTyroStore((s) => s.config);
  const hydrateTyro = useTyroStore((s) => s.hydrate);

  // ANZ Worldline TIM payment modal
  const [showAnzModal, setShowAnzModal] = useState(false);
  const [anzAmount, setAnzAmount] = useState(0);
  const [anzRefId, setAnzRefId] = useState('');
  // Read the real ANZ terminal capability bits (set after activateCompleted)
  // so the Card button can surface "(Surcharge applies)" based on the
  // acquirer-level merchant config, not a stale local toggle.
  const anzCapabilities = useAnzBridge().capabilities;
  // Server-managed terminal config
  const serverSettingsLoaded = useDeviceSettings((s) => s.loaded);

  // v2.7.44 — hospitality industry gating + order-type picker.
  const deviceIndustry = useDeviceSettings((s) => s.config?.identity?.industry);
  const isHospitality = deviceIndustry === 'hospitality';
  const [hospitalityOrderType, setHospitalityOrderType] = useState<HospitalityOrderType>('dine_in');

  // Stripe Terminal (Tap to Pay on Android)
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeAmount, setStripeAmount] = useState(0);
  const stripeConfig = useStripeTerminalStore((s) => s.config);

  // v2.7.20 — till open banner driver (card txns require an open till)
  const tillOpen  = useTillStore((s) => s.isOpen);
  const tillReady = useTillStore((s) => s.ready);

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
    setCashoutDollars('');
    setSplitMode(false);
    setSplitCardAmount('');
    setSplitCashAmount('');
    setPendingSplit(null);
  }

  // Hydrate Tyro config + auto-init SDK if configured
  useEffect(() => {
    hydrateTyro();
  }, [hydrateTyro]);

  useEffect(() => {
    if (tyroConfig.autoInit && tyroConfig.apiKey && !isTyroInitialized()) {
      try {
        initTyro(tyroConfig.apiKey, tyroConfig.environment);
      } catch (err) {
        console.warn('[QuickSale] Tyro auto-init failed:', err);
      }
    }
  }, [tyroConfig.apiKey, tyroConfig.environment, tyroConfig.autoInit]);

  /**
   * v2.7.39 — mark the freshly-created order as completed on the server
   * so it stops appearing as 'open' in the orders list and counts
   * towards dashboard revenue + EOD. Mirrors the retry + error-visibility
   * pattern in sell.tsx's handleCharge so a transient blip doesn't
   * silently leave the order open.
   *
   * v2.7.40 — extended to accept tip + surcharge so split-cash + Tyro
   * extras land in the /complete payload exactly like Sell.
   */
  async function markOrderCompleted(
    orderId: string,
    paidTotal: number,
    changeGiven: number,
    paymentMethod: string,
    token: string,
    base: string,
    extras?: { tipAmount?: number; surchargeAmount?: number },
  ): Promise<boolean> {
    const body = JSON.stringify({
      paidTotal,
      changeGiven,
      paymentMethod,
      tipAmount: extras?.tipAmount || undefined,
      surchargeAmount: extras?.surchargeAmount || undefined,
    });
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

  /**
   * Single-line mirror of sell.tsx's handleCharge(). Builds one order
   * line from the entered amount + optional description, then drives
   * the same POST /orders → POST /complete → printSaleReceipts pipeline.
   *
   * tyroExtras comes from the Tyro purchase result (tip / surcharge /
   * scheme / last4) and drives surcharge + tip on the receipt.
   * cardExtras comes from the ANZ TIM result (auth / masked pan /
   * merchant + customer receipt text).
   * cashExtras carries the tendered cash amount so the POS receipt can
   * render the TENDERED / CHANGE lines.
   */
  async function handleCharge(
    paymentMethod: 'Card' | 'Cash' | 'Split' = 'Card',
    changeGiven = 0,
    tyroExtras?: {
      tipCents?: number;
      surchargeCents?: number;
      transactionTotalCents?: number;
      authCode?: string;
      cardLast4?: string;
      cardScheme?: string;
    },
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
    if (!canCharge) return;
    setCharging(true);

    const orderTotal = amount;
    const orderGst = +gst.toFixed(2);

    // Actual amount charged (includes surcharge + tip from Tyro). Falls back to amount.
    const tipDollars = tyroExtras?.tipCents ? tyroExtras.tipCents / 100 : 0;
    const surchargeDollars = tyroExtras?.surchargeCents ? tyroExtras.surchargeCents / 100 : 0;
    const paidTotal = tyroExtras?.transactionTotalCents
      ? tyroExtras.transactionTotalCents / 100
      : orderTotal;

    const label = description.trim() || 'Quick Sale';

    const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
    const token = authToken ?? identity?.deviceToken ?? '';

    let orderNumber: string;
    let orderId: string;

    try {
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
          // v2.7.44 — hospitality merchants tag the sale with the picker
          // value (Eat-In / Takeaway / Delivery); everyone else stays on 'retail'.
          orderType: isHospitality ? hospitalityOrderType : 'retail',
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

      const completed = await markOrderCompleted(
        orderId,
        paidTotal,
        changeGiven,
        paymentMethod,
        token,
        base,
        { tipAmount: tipDollars || undefined, surchargeAmount: surchargeDollars || undefined },
      );
      if (!completed) {
        toast.warning(
          'Order still open',
          'Sale was charged but the server did not mark it complete. Go to Orders to reconcile.',
        );
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
        await printSaleReceipts({
          store: {
            name: identity?.label || 'ElevatedPOS',
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
            // v2.7.44 — render "Order #1234 · Dine In" on hospitality receipts.
            orderTypeLabel: isHospitality
              ? hospitalityOrderTypeLabel(hospitalityOrderType)
              : undefined,
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
            subtotalExGst: +(orderTotal - orderGst).toFixed(2),
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
      } catch (err) {
        console.warn('[QuickSale] Receipt print failed:', err);
        // Don't block order flow on print failure
      }
    }

    setCharging(false);

    const paidMsg =
      changeGiven > 0
        ? `Order #${orderNumber} — $${paidTotal.toFixed(2)} · Change $${changeGiven.toFixed(2)}`
        : `Order #${orderNumber} — $${paidTotal.toFixed(2)}`;

    const newSale = await confirm({
      title: 'Order Placed',
      description: paidMsg,
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
  }

  // ── Handle payment method selection ──────────────────────────────
  function handlePayCard() {
    setShowPayment(false);

    // If Tyro is ready → open the headless transaction modal and start a purchase.
    if (isTyroInitialized()) {
      const cashoutDollarsNum =
        tyroConfig.cashoutEnabled && cashoutDollars ? parseFloat(cashoutDollars) || 0 : 0;
      const cashoutCents = cashoutDollarsNum > 0 ? String(Math.round(cashoutDollarsNum * 100)) : '';

      setTyroAmount(amount + cashoutDollarsNum);
      setShowTyroModal(true);

      const amountCents = String(Math.round(amount * 100));
      try {
        tyroPurchase(amountCents, {
          cashoutCents,
          integratedReceipt: tyroConfig.integratedReceipts,
          enableSurcharge: tyroConfig.enableSurcharge,
          transactionId: `QS-${Date.now()}`,
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
      setAnzAmount(amount);
      setAnzRefId(`QS-${Date.now()}`);
      setShowAnzModal(true);
      return;
    }

    // Check for Stripe Terminal (Tap to Pay)
    const stripeKey = stripeConfig.publishableKey;
    if (stripeConfig.enabled && stripeKey && !isTyroInitialized() && !getServerAnzConfig()) {
      setStripeAmount(Math.round(amount * 100));
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
    if (split) setPendingSplit(null);

    if (outcome === 'APPROVED') {
      const tipCents = result.tipAmount ? parseInt(String(result.tipAmount), 10) : 0;
      const surchargeCents = result.surchargeAmount ? parseInt(String(result.surchargeAmount), 10) : 0;
      const transactionTotalCents = result.transactionAmount ? parseInt(String(result.transactionAmount), 10) : 0;

      // Print the Tyro merchant receipt (with signature line if required)
      // before finalising the sale — same best-effort pattern as Sell.
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

      handleCharge(split ? 'Split' : 'Card', split?.change ?? 0, {
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

    // ANZ TIM doesn't expose surcharge/tip separately — charge the plain amount.
    handleCharge(split ? 'Split' : 'Card', split?.change ?? 0, undefined, {
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
    if (tendered < amount) {
      toast.warning('Insufficient', `Need at least $${amount.toFixed(2)}`);
      return;
    }
    const change = tendered - amount;
    setShowPayment(false);
    setCashTendered('');
    handleCharge('Cash', change, undefined, undefined, { tendered });
    if (change > 0) {
      toast.info('Change Due', `$${change.toFixed(2)}`);
    }
  }

  function handlePaySplit() {
    const cardAmt = parseFloat(splitCardAmount) || 0;
    const cashAmt = parseFloat(splitCashAmount) || 0;
    if (cardAmt + cashAmt < amount) {
      toast.warning(
        'Insufficient',
        `Card $${cardAmt.toFixed(2)} + Cash $${cashAmt.toFixed(2)} = $${(cardAmt + cashAmt).toFixed(2)}. Need $${amount.toFixed(2)}.`,
      );
      return;
    }
    const change = cardAmt + cashAmt - amount;

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
          transactionId: `QS-SPLIT-${Date.now()}`,
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
      setAnzRefId(`QS-SPLIT-${Date.now()}`);
      setShowAnzModal(true);
      return;
    }

    // Cash-only or no EFTPOS — fall through to the legacy flow.
    setShowPayment(false);
    setSplitMode(false);
    setSplitCardAmount('');
    setSplitCashAmount('');
    handleCharge('Split', change, undefined, undefined, cashAmt > 0 ? { tendered: cashAmt } : undefined);
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

  function handleChargeButton() {
    if (!canCharge) return;
    setShowPayment(true);
  }

  // Suppress unused-var warning — serverSettingsLoaded is retained because
  // the Card button gates behave differently once the server config arrives
  // and this hook keeps the component re-rendering when it changes.
  void serverSettingsLoaded;
  void tillReady;

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

      {/* v2.7.40 — Till-closed banner so operators know why card txns fail */}
      {!tillOpen && (
        <View style={s.tillClosedBanner}>
          <Ionicons name="warning" size={14} color="#f59e0b" />
          <Text style={s.tillClosedText}>Till is closed — card payments will fail until opened.</Text>
        </View>
      )}

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

        {/* v2.7.44 — hospitality order-type picker (Eat In / Takeaway / Delivery). */}
        {isHospitality && (
          <View style={s.orderTypeRow}>
            {HOSPITALITY_ORDER_TYPES.map((opt) => {
              const active = hospitalityOrderType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.orderTypeBtn, active && s.orderTypeBtnActive]}
                  onPress={() => setHospitalityOrderType(opt.value)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Order type: ${opt.label}`}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.orderTypeText, active && s.orderTypeTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

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
              Incl. GST ${gst.toFixed(2)} · Ex. GST ${ex.toFixed(2)}
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

      {/* ═══ Payment Method Modal (mirrors sell.tsx) ═══ */}
      <Modal
        visible={showPayment}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowPayment(false); setSplitMode(false); }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => { setShowPayment(false); setSplitMode(false); }}
        >
          <Pressable
            style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 340, borderWidth: 1, borderColor: '#2a2a3a' }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 20, textAlign: 'center' }}>
              Payment — ${amount.toFixed(2)}
            </Text>

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
                      const anzActive = !!getServerAnzConfig();
                      const surchargeOn = anzActive
                        ? !!anzCapabilities?.canSurcharge
                        : tyroConfig.enableSurcharge;
                      return surchargeOn ? ' (Surcharge applies)' : '';
                    })()}
                  </Text>
                  {tyroConfig.cashoutEnabled && parseFloat(cashoutDollars) > 0 && (
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff', opacity: 0.85, marginTop: 2 }}>
                      ${amount.toFixed(2)} + ${(parseFloat(cashoutDollars) || 0).toFixed(2)} cashout
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={{ backgroundColor: '#141425', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10 }}>
                  <Text style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>Cash Tendered</Text>

                  {/* Quick-tender chips — Exact, then next four $5 increments
                      rounded UP from the total. e.g. total $12.30 → chips
                      show $12.30 · $15 · $20 · $25 · $30. */}
                  {(() => {
                    const exact = parseFloat(amount.toFixed(2));
                    const nextFive = Math.ceil(amount / 5) * 5;
                    const quickAmountsList: number[] = [exact];
                    let next = nextFive;
                    if (next === exact) next = exact + 5;
                    for (let i = 0; i < 4; i++) {
                      quickAmountsList.push(next);
                      next += 5;
                    }
                    return (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {quickAmountsList.map((amt, i) => {
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
                    placeholder={`$${amount.toFixed(2)}`}
                    placeholderTextColor="#444"
                  />
                  {cashTendered && parseFloat(cashTendered) >= amount && (
                    <Text style={{ color: '#22c55e', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 8 }}>
                      Change: ${(parseFloat(cashTendered) - amount).toFixed(2)}
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
                    const remainder = Math.max(0, amount - cardVal);
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
                  const remaining = amount - cardVal - cashVal;
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

            <TouchableOpacity
              onPress={() => { setShowPayment(false); setSplitMode(false); }}
              style={{ alignItems: 'center', paddingVertical: 10 }}
            >
              <Text style={{ color: '#666', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Tyro EFTPOS Transaction Modal ═══ */}
      <TyroTransactionModal
        visible={showTyroModal}
        amount={tyroAmount || amount}
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
        onApproved={(result: StripePaymentResult) => {
          setShowStripeModal(false);
          handleCharge('Card', 0, {
            authCode: result.paymentIntentId,
            cardLast4: result.cardLast4,
            cardScheme: result.cardBrand,
          });
        }}
        onDeclined={(result) => {
          setShowStripeModal(false);
          toast.error('Payment Declined', result.errorMessage ?? 'Card was declined');
        }}
        onCancel={() => setShowStripeModal(false)}
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

  tillClosedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2a1a05',
    borderBottomWidth: 1,
    borderBottomColor: '#f59e0b44',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tillClosedText: { color: '#f59e0b', fontSize: 12, fontWeight: '700' },

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

  /* v2.7.44 — hospitality order-type picker (Eat In / Takeaway / Delivery) */
  orderTypeRow: {
    flexDirection: 'row',
    backgroundColor: '#10101d',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  orderTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  orderTypeBtnActive: { backgroundColor: '#6366f1' },
  orderTypeText: { fontSize: 13, fontWeight: '700', color: '#888' },
  orderTypeTextActive: { color: '#fff' },

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
});
