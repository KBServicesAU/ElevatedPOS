'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, X, Wifi, CreditCard, CheckCircle, AlertCircle } from 'lucide-react';
import { usePrinter } from '../printer-context';
import { type ReceiptData } from '../receipt-printer';
import { getDeviceInfo } from '@/lib/device-auth';
import { TyroPaymentOverlay } from './tyro-payment-overlay';
import type { TyroConfig } from '@/lib/tyro-provider';
import { AnzPaymentOverlay } from './anz-payment-overlay';
import type { TimConfig } from '@/lib/payments';

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = 'cash' | 'card' | 'gift_card' | 'bnpl';

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
  discount?: string; // serialised JSON: { type: 'pct' | 'flat'; value: number }
}

interface Tender {
  id: string;
  method: PaymentMethod;
  amount: number;
  cashTendered?: number;
  change?: number;
  giftCardCode?: string;
  bnplProvider?: 'afterpay' | 'zip';
  cardLast4?: string;
  cardBrand?: string;
  paymentIntentId?: string;
  surchargeAmount?: number;
  tipAmount?: number;
  /** Tyro-specific fields */
  tyroTransactionRef?: string;
  tyroReceiptData?: { merchantReceipt?: string; customerReceipt?: string };
}

const METHOD_META: Record<PaymentMethod, { label: string; emoji: string; color: string; hint: string }> = {
  cash:      { label: 'Cash',              emoji: '💵', color: '#4ade80', hint: 'Enter amount tendered by customer' },
  card:      { label: 'Card / EFTPOS',     emoji: '💳', color: '#60a5fa', hint: 'Tap, insert or swipe on the terminal' },
  gift_card: { label: 'Gift Card',         emoji: '🎁', color: '#f59e0b', hint: 'Enter the gift card code to check balance' },
  bnpl:      { label: 'Buy Now Pay Later', emoji: '📱', color: '#a78bfa', hint: 'Customer pays via Afterpay or Zip' },
};

// ─── Stripe Terminal ──────────────────────────────────────────────────────────

type TerminalStatus =
  | 'idle'
  | 'init'
  | 'connecting_reader'
  | 'reader_connected'
  | 'creating_intent'
  | 'presenting'
  | 'processing'
  | 'approved'
  | 'declined'
  | 'error';

interface TerminalResult {
  approved: boolean;
  paymentIntentId?: string;
  cardLast4?: string;
  cardBrand?: string;
  error?: string;
}

// Module-level state (persists across renders, reset on page reload)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _terminal: any = null;
let _readerConnected = false;
let _stripeConfigured: boolean | null = null; // null = not yet checked
/** Whether to use Stripe's built-in simulated reader (true when
 *  STRIPE_TERMINAL_SIMULATED=true server-side, or when no secret key exists). */
let _terminalSimulated = false;
let _tenderSeq = 0;
function newTenderId() { return `t-${Date.now()}-${++_tenderSeq}`; }

/**
 * Returns true when a real Stripe connection token can be obtained
 * (i.e. STRIPE_SECRET_KEY is set on the server).
 * Also caches whether the Terminal should use simulated reader discovery.
 */
async function isStripeConfigured(): Promise<boolean> {
  if (_stripeConfigured !== null) return _stripeConfigured;
  const res = await fetch('/api/stripe/connection-token', { method: 'POST' });
  const data = await res.json() as { secret: string | null; simulated?: boolean };
  _terminalSimulated = data.simulated ?? false;
  // configured = we have a real key AND the server didn't flag pure-demo mode
  _stripeConfigured = data.secret !== null;
  return _stripeConfigured;
}

async function getTerminal() {
  if (_terminal) return _terminal;
  const { loadStripeTerminal } = await import('@stripe/terminal-js');
  const StripeTerminal = await loadStripeTerminal();
  if (!StripeTerminal) throw new Error('Stripe Terminal SDK failed to load');
  _terminal = StripeTerminal.create({
    onFetchConnectionToken: async () => {
      const res = await fetch('/api/stripe/connection-token', { method: 'POST' });
      const data = await res.json() as { secret: string };
      return data.secret;
    },
    onUnexpectedReaderDisconnect: () => {
      _readerConnected = false;
    },
  });
  return _terminal;
}

async function ensureReaderConnected(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  terminal: any,
  onStatus: (s: TerminalStatus, msg?: string) => void,
  simulated = false,
) {
  if (_readerConnected) return;
  onStatus('connecting_reader', 'Discovering reader…');
  // Use simulated:true only when explicitly requested (e.g. Stripe test keys
  // environment).  Production always discovers real physical readers.
  const result = await terminal.discoverReaders({ simulated });
  if (result.error) throw new Error(result.error.message);
  if (!result.discoveredReaders.length) throw new Error('No readers found');
  const connectResult = await terminal.connectReader(result.discoveredReaders[0]);
  if (connectResult.error) throw new Error(connectResult.error.message);
  _readerConnected = true;
}

// ─── Stripe Terminal Dialog ───────────────────────────────────────────────────

function TerminalPaymentOverlay({
  amount,
  orderId,
  onApproved,
  onCancel,
}: {
  amount: number;
  orderId: string;
  onApproved: (result: TerminalResult) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<TerminalStatus>('init');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const cancelledRef = useRef(false);

  const setS = useCallback((s: TerminalStatus, msg = '') => {
    if (cancelledRef.current) return;
    setStatus(s);
    setStatusMsg(msg);
  }, []);

  useEffect(() => {
    // Use a per-invocation flag so StrictMode's double-invoke doesn't
    // cause two concurrent flows both calling onApproved.
    let localCancelled = false;
    cancelledRef.current = false;

    void runTerminalFlow(() => localCancelled);

    return () => {
      localCancelled = true;
      cancelledRef.current = true;
      // Cancel any in-progress collection
      getTerminal().then((t) => {
        try { t.cancelCollectPaymentMethod?.(); } catch { /* ignore */ }
      }).catch(() => {/* ignore */});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTerminalFlow = async (isCancelled: () => boolean) => {
    try {
      setS('init', 'Initialising terminal…');

      const configured = await isStripeConfigured();
      if (isCancelled()) return;

      // ── Pure demo mode (no Stripe secret key configured on server) ──────────
      if (!configured) {
        setS('connecting_reader', 'Connecting to simulated reader…');
        await delay(600);
        if (isCancelled()) return;

        setS('reader_connected', 'Simulated reader connected');
        await delay(400);
        if (isCancelled()) return;

        setS('creating_intent', 'Creating payment…');
        const piRes = await fetch('/api/stripe/payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Math.round(amount * 100), currency: 'aud', orderId }),
        });
        const pi = await piRes.json() as { id: string };
        if (isCancelled()) return;

        setS('presenting', 'Tap, Insert or Swipe card…');
        await delay(2000);
        if (isCancelled()) return;

        setS('processing', 'Processing payment…');
        await delay(900);
        if (isCancelled()) return;

        setS('approved');
        await delay(500);
        if (isCancelled()) return;
        onApproved({ approved: true, paymentIntentId: pi.id, cardLast4: '4242', cardBrand: 'Visa' });
        return;
      }

      // ── Real Stripe Terminal flow ───────────────────────────────────────────
      const terminal = await getTerminal();
      if (isCancelled()) return;

      // Pass the simulated flag so discoverReaders uses the correct mode.
      // _terminalSimulated is true when STRIPE_TERMINAL_SIMULATED=true is set
      // server-side (test keys + no physical hardware), false in production.
      await ensureReaderConnected(terminal, setS, _terminalSimulated);
      if (isCancelled()) return;

      setS('creating_intent', 'Creating payment…');
      const piRes = await fetch('/api/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Math.round(amount * 100), currency: 'aud', orderId }),
      });
      const pi = await piRes.json() as { id: string; clientSecret: string };
      if (isCancelled()) return;

      setS('reader_connected', 'Reader connected');
      setS('presenting', 'Tap, Insert or Swipe card…');

      const collectResult = await terminal.collectPaymentMethod(pi.clientSecret);
      if (isCancelled()) return;
      if (collectResult.error) throw new Error(collectResult.error.message);

      setS('processing', 'Processing payment…');
      const processResult = await terminal.processPayment(collectResult.paymentIntent);
      if (isCancelled()) return;
      if (processResult.error) throw new Error(processResult.error.message);

      await fetch('/api/stripe/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: processResult.paymentIntent.id }),
      });

      setS('approved');
      const pm = processResult.paymentIntent.payment_method_details?.card_present;
      await delay(500);
      if (isCancelled()) return;
      onApproved({
        approved: true,
        paymentIntentId: processResult.paymentIntent.id,
        cardLast4: pm?.last4,
        cardBrand: pm?.brand,
      });
    } catch (err) {
      if (isCancelled()) return;
      setErrorMsg(String(err instanceof Error ? err.message : err));
      setS('error');
    }
  };

  const STATUS_CONFIG: Record<TerminalStatus, { icon: React.ReactNode; label: string; color: string }> = {
    idle:              { icon: <CreditCard className="h-10 w-10" />,       label: 'Ready',                  color: '#60a5fa' },
    init:              { icon: <Spinner />,                                 label: 'Initialising…',          color: '#60a5fa' },
    connecting_reader: { icon: <Spinner />,                                 label: statusMsg || 'Connecting…',color: '#60a5fa' },
    reader_connected:  { icon: <Wifi className="h-10 w-10" />,             label: 'Reader connected',       color: '#4ade80' },
    creating_intent:   { icon: <Spinner />,                                 label: 'Creating payment…',      color: '#60a5fa' },
    presenting:        { icon: <TapIcon />,                                 label: 'Tap, Insert or Swipe',   color: '#f59e0b' },
    processing:        { icon: <Spinner />,                                 label: 'Processing…',            color: '#60a5fa' },
    approved:          { icon: <CheckCircle className="h-10 w-10" />,      label: 'Payment Approved',       color: '#4ade80' },
    declined:          { icon: <AlertCircle className="h-10 w-10" />,      label: 'Payment Declined',       color: '#f87171' },
    error:             { icon: <AlertCircle className="h-10 w-10" />,      label: 'Error',                  color: '#f87171' },
  };

  const cfg = STATUS_CONFIG[status];
  const isTerminal = status === 'approved' || status === 'declined' || status === 'error';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[#1e3a70] bg-[#0f172a] p-8 shadow-2xl">
        {/* Terminal screen */}
        <div
          className="mb-6 flex flex-col items-center justify-center rounded-2xl border-2 py-10 transition-all duration-500"
          style={{ borderColor: cfg.color, backgroundColor: `${cfg.color}15` }}
        >
          <div style={{ color: cfg.color }}>{cfg.icon}</div>

          {status === 'presenting' && (
            <div className="mt-4 flex gap-3">
              {['Tap', 'Insert', 'Swipe'].map((m) => (
                <span key={m} className="rounded-lg border border-yellow-600/40 bg-yellow-900/20 px-2 py-1 text-xs font-semibold text-yellow-400">
                  {m}
                </span>
              ))}
            </div>
          )}

          <p className="mt-4 text-lg font-bold" style={{ color: cfg.color }}>
            {cfg.label}
          </p>
          <p className="mt-1 text-2xl font-extrabold text-white">${amount.toFixed(2)}</p>

          {status === 'error' && errorMsg && (
            <p className="mt-2 max-w-xs text-center text-xs text-red-400">{errorMsg}</p>
          )}

          {/* Simulated reader badge — only shown when using a simulated reader */}
          {(status === 'presenting' || status === 'processing' || status === 'reader_connected') &&
            (process.env.NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATE === 'true' || _terminalSimulated) && (
            <span className="mt-3 rounded-full border border-blue-700 bg-blue-900/30 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
              Simulated Reader
            </span>
          )}
        </div>

        {/* Steps indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {(['connecting_reader', 'presenting', 'processing', 'approved'] as TerminalStatus[]).map((s, i) => {
            const idx = (['connecting_reader', 'creating_intent', 'presenting', 'processing', 'approved'] as TerminalStatus[]).indexOf(status);
            const stepIdx = i;
            const done = stepIdx < idx || status === 'approved';
            const active = stepIdx === idx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full transition-all"
                  style={{
                    backgroundColor: done || active ? cfg.color : '#334155',
                    transform: active ? 'scale(1.4)' : 'scale(1)',
                  }}
                />
                {i < 3 && <div className="h-px w-6" style={{ backgroundColor: done ? cfg.color : '#334155' }} />}
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        {!isTerminal && (
          <button
            onClick={() => { cancelledRef.current = true; onCancel(); }}
            className="w-full rounded-xl border border-[#1e3a70] bg-[#16213e] py-3 text-sm font-semibold text-gray-400 hover:bg-[#1e2a50] hover:text-white"
          >
            Cancel
          </button>
        )}
        {(status === 'declined' || status === 'error') && (
          <button
            onClick={() => {
              _readerConnected = false;
              cancelledRef.current = false;
              setS('init');
              void runTerminalFlow(() => cancelledRef.current);
            }}
            className="mt-2 w-full rounded-xl bg-blue-500 py-3 text-sm font-bold text-white hover:bg-blue-400"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />;
}

function TapIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 fill-none stroke-current" strokeWidth={2}>
      <circle cx="20" cy="20" r="8" />
      <circle cx="20" cy="20" r="14" strokeOpacity={0.4} />
      <circle cx="20" cy="20" r="19" strokeOpacity={0.15} />
    </svg>
  );
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Add Tender Dialog ────────────────────────────────────────────────────────

function AddTenderDialog({
  remaining,
  orderId,
  onClose,
  onAdd,
  onPaymentProcessing,
}: {
  remaining: number;
  orderId: string;
  onClose: () => void;
  onAdd: (tender: Tender) => void;
  onPaymentProcessing?: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountStr, setAmountStr] = useState('');
  const [cashTenderedStr, setCashTenderedStr] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [bnplProvider, setBnplProvider] = useState<'afterpay' | 'zip'>('afterpay');
  const [showTerminal, setShowTerminal] = useState<false | 'stripe' | 'tyro' | 'anz'>(false);
  const [paymentSettings, setPaymentSettings] = useState<{ cardSurchargeRate: number; cashRoundingEnabled: boolean } | null>(null);
  const [tyroConfig, setTyroConfig] = useState<TyroConfig | null>(null);
  const [anzConfig, setAnzConfig] = useState<TimConfig | null>(null);
  const [eftposProvider, setEftposProvider] = useState<'stripe' | 'tyro' | 'anz'>('stripe');
  // true while the terminal config fetch is in flight — disables the card charge button
  const [terminalConfigLoading, setTerminalConfigLoading] = useState(true);

  // Fetch device's terminal config on mount to determine EFTPOS provider
  useEffect(() => {
    // Device info is stored under nexus_device_info by the web POS login
    const deviceInfoRaw = typeof window !== 'undefined' ? localStorage.getItem('nexus_device_info') : null;
    const deviceId = deviceInfoRaw ? (() => { try { return (JSON.parse(deviceInfoRaw) as { deviceId?: string }).deviceId ?? null; } catch { return null; } })() : null;
    const url = deviceId ? `/api/tyro/config?deviceId=${deviceId}` : '/api/tyro/config';
    fetch(url)
      .then(r => {
        // Non-2xx or HTML response means unauthenticated / no config
        if (!r.ok || !r.headers.get('content-type')?.includes('application/json')) return null;
        return r.json() as Promise<{ configured?: boolean; provider?: string; apiKey?: string; merchantId?: string; terminalId?: string; testMode?: boolean; tyroHandlesSurcharge?: boolean; terminalIp?: string; terminalPort?: number; integratorId?: string } | null>;
      })
      .then((data) => {
        if (data?.configured) {
          if (data.provider === 'tyro' && data.apiKey) {
            setEftposProvider('tyro');
            setTyroConfig({
              apiKey: data.apiKey,
              merchantId: data.merchantId ?? '',
              terminalId: data.terminalId ?? '',
              testMode: data.testMode ?? true,
              tyroHandlesSurcharge: data.tyroHandlesSurcharge ?? false,
            });
          } else if (data.provider === 'anz' && data.terminalIp) {
            setEftposProvider('anz');
            setAnzConfig({
              terminalIp:           data.terminalIp,
              terminalPort:         data.terminalPort ?? 80,
              integratorId:         data.integratorId ?? '',
              // ANZ Worldline validation requirements (Section 2.4):
              autoCommit:           true,   // required for ANZ certification
              fetchBrands:          true,   // retrieve brands after login
              dcc:                  false,  // no DCC in AU
              partialApproval:      false,  // no partial approvals
              tipAllowed:           false,  // no tips (retail guide, not gastro)
              printMerchantReceipt: false,  // POS handles printing
              printCustomerReceipt: false,
            });
          }
        }
        // If no terminal configured, eftposProvider stays 'stripe' (Stripe Terminal)
      })
      .catch(() => {/* non-fatal — POS continues with stripe fallback */})
      .finally(() => setTerminalConfigLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/proxy/settings/payments')
      .then(r => r.ok ? r.json() : null)
      .then((data: { paymentMethods?: { id: string; surcharge?: string; rounding?: string }[] } | null) => {
        if (!data?.paymentMethods) return;
        const card = data.paymentMethods.find(m => m.id === 'card');
        const cash = data.paymentMethods.find(m => m.id === 'cash');
        setPaymentSettings({
          cardSurchargeRate: parseFloat(card?.surcharge ?? '0') || 0,
          cashRoundingEnabled: !!(cash?.rounding && parseFloat(cash.rounding) > 0),
        });
      })
      .catch(() => {});
  }, []);

  const amount = amountStr === '' ? remaining : Math.min(Number(amountStr) || 0, remaining);
  const cashTendered = Number(cashTenderedStr) || 0;

  // RBA cash rounding: round to nearest 5 cents
  const roundedCashTotal = paymentSettings?.cashRoundingEnabled
    ? Math.round(amount / 0.05) * 0.05
    : amount;

  // EFTPOS surcharge (ACCC compliance)
  const cardSurchargeRate = paymentSettings?.cardSurchargeRate ?? 0;
  const surchargeAmt = cardSurchargeRate > 0
    ? Math.round(amount * cardSurchargeRate / 100 * 100) / 100
    : 0;
  const cardChargeTotal = amount + surchargeAmt;

  const change = method === 'cash' ? Math.max(0, cashTendered - roundedCashTotal) : 0;

  const canApply = (() => {
    if (amount <= 0) return false;
    if (method === 'cash') return cashTendered >= roundedCashTotal;
    // Block card charges while terminal config is still loading
    if (method === 'card' && terminalConfigLoading) return false;
    return true;
  })();

  const handleApply = () => {
    if (method === 'card') {
      // Route to the correct EFTPOS provider
      onPaymentProcessing?.();
      setShowTerminal(eftposProvider);
      return;
    }
    const tender: Tender = {
      id: newTenderId(),
      method,
      // For cash, record the rounded total as the tendered amount
      amount: method === 'cash' ? roundedCashTotal : amount,
      ...(method === 'cash' ? { cashTendered, change } : {}),
      ...(method === 'gift_card' ? { giftCardCode: giftCode.trim() } : {}),
      ...(method === 'bnpl' ? { bnplProvider } : {}),
    };
    onAdd(tender);
  };

  if (showTerminal === 'anz' && anzConfig) {
    return (
      <AnzPaymentOverlay
        amount={cardChargeTotal}
        posOrderId={orderId}
        config={anzConfig}
        onApproved={(result) => {
          onAdd({
            id: newTenderId(),
            method: 'card',
            amount: cardChargeTotal,
            cardLast4: result.cardLast4,
            cardBrand: result.cardScheme,
            ...(surchargeAmt > 0 ? { surchargeAmount: surchargeAmt } : {}),
          });
        }}
        onFailed={() => setShowTerminal(false)}
        onCancel={() => setShowTerminal(false)}
      />
    );
  }

  if (showTerminal === 'tyro') {
    const tyroAmount = tyroConfig?.tyroHandlesSurcharge ? amount : cardChargeTotal;
    return (
      <TyroPaymentOverlay
        amount={tyroAmount}
        config={tyroConfig}
        onApproved={(result) => {
          const finalAmount = result.totalAmount ?? tyroAmount;
          const tyrSurcharge = result.surchargeAmount ?? 0;
          const tyrTip = result.tipAmount ?? 0;
          onAdd({
            id: newTenderId(),
            method: 'card',
            amount: finalAmount,
            cardLast4: result.cardLast4,
            cardBrand: result.cardBrand,
            tyroTransactionRef: result.transactionRef,
            tyroReceiptData: result.receiptData,
            ...(tyrSurcharge > 0 ? { surchargeAmount: tyrSurcharge } : surchargeAmt > 0 ? { surchargeAmount: surchargeAmt } : {}),
            ...(tyrTip > 0 ? { tipAmount: tyrTip } : {}),
          });
        }}
        onFailed={() => setShowTerminal(false)}
        onCancel={() => setShowTerminal(false)}
      />
    );
  }

  if (showTerminal === 'stripe') {
    return (
      <TerminalPaymentOverlay
        amount={cardChargeTotal}
        orderId={orderId}
        onApproved={(result) => {
          onAdd({
            id: newTenderId(),
            method: 'card',
            amount: cardChargeTotal,
            cardLast4: result.cardLast4,
            cardBrand: result.cardBrand,
            paymentIntentId: result.paymentIntentId,
            ...(surchargeAmt > 0 ? { surchargeAmount: surchargeAmt } : {}),
          });
        }}
        onCancel={() => setShowTerminal(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-[#1a1a2e] p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Add Payment</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Method selector */}
        <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Payment Method</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(Object.keys(METHOD_META) as PaymentMethod[]).map((m) => {
            const meta = METHOD_META[m];
            return (
              <button
                key={m}
                onClick={() => setMethod(m)}
                style={method === m ? { borderColor: meta.color, backgroundColor: `${meta.color}22` } : {}}
                className={`flex flex-col items-center rounded-xl border-2 py-3 transition-all ${
                  method === m ? '' : 'border-[#16213e] bg-[#16213e]'
                }`}
              >
                <span className="text-2xl">{meta.emoji}</span>
                <span className="mt-1 text-xs font-semibold" style={method === m ? { color: meta.color } : { color: '#64748b' }}>
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Hint */}
        <p className="mb-3 rounded-xl bg-[#0f3460] px-3 py-2 text-center text-xs text-blue-300">
          {METHOD_META[method].hint}
        </p>

        {/* Card — no extra fields, Terminal handles everything */}
        {method !== 'card' && (
          <>
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Amount</p>
            <input
              type="number"
              className="mb-3 w-full rounded-xl bg-[#16213e] px-4 py-3 text-white placeholder-gray-600 outline-none"
              placeholder={`$${remaining.toFixed(2)} (remaining)`}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
          </>
        )}

        {/* Cash tendered */}
        {method === 'cash' && (
          <>
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Cash Tendered</p>
            {/* Quick-select row */}
            <div className="mb-2 flex gap-2">
              <button
                onClick={() => setCashTenderedStr(amount.toFixed(2))}
                className="flex-1 rounded-xl border border-[#1e40af] bg-[#0f3460] py-2 text-xs font-semibold text-blue-300 hover:bg-[#1e3a70]"
              >
                Exact
              </button>
              {[20, 50, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setCashTenderedStr(String(v))}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-colors ${
                    cashTendered === v
                      ? 'border-green-600 bg-green-900/40 text-green-300'
                      : 'border-[#1e40af] bg-[#0f3460] text-blue-300 hover:bg-[#1e3a70]'
                  }`}
                >
                  ${v}
                </button>
              ))}
            </div>
            <input
              type="number"
              className="mb-3 w-full rounded-xl bg-[#16213e] px-4 py-3 text-white placeholder-gray-600 outline-none"
              placeholder={`$${amount.toFixed(2)}`}
              value={cashTenderedStr}
              onChange={(e) => setCashTenderedStr(e.target.value)}
            />
            {paymentSettings?.cashRoundingEnabled && roundedCashTotal !== amount && (
              <p className="mb-2 rounded-lg bg-[#0f2a1e] px-3 py-2 text-xs text-green-400">
                RBA cash rounding: ${roundedCashTotal.toFixed(2)}
              </p>
            )}
            {cashTendered >= roundedCashTotal && roundedCashTotal > 0 && (
              <div className="mb-3 flex items-center justify-between rounded-xl border-2 border-green-600 bg-green-950/60 px-5 py-4">
                <span className="text-lg font-bold text-green-300">CHANGE</span>
                <span className="text-3xl font-extrabold text-green-400">${change.toFixed(2)}</span>
              </div>
            )}
          </>
        )}

        {/* Gift card */}
        {method === 'gift_card' && (
          <>
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Gift Card Code</p>
            <input
              className="mb-3 w-full rounded-xl bg-[#16213e] px-4 py-3 uppercase text-white placeholder-gray-600 outline-none"
              placeholder="Enter gift card code"
              value={giftCode}
              onChange={(e) => setGiftCode(e.target.value)}
            />
          </>
        )}

        {/* BNPL */}
        {method === 'bnpl' && (
          <>
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Provider</p>
            <div className="mb-3 flex gap-2">
              {(['afterpay', 'zip'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setBnplProvider(p)}
                  className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
                    bnplProvider === p
                      ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                      : 'border-[#16213e] bg-[#16213e] text-gray-500'
                  }`}
                >
                  {p === 'afterpay' ? 'Afterpay' : 'Zip'}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Card: show amount and terminal badge */}
        {method === 'card' && (
          <div className="mb-3 rounded-xl border border-blue-900 bg-[#0f1e3d] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-400">Charging via Terminal</p>
                {cardSurchargeRate > 0 ? (
                  <div className="mt-0.5">
                    <p className="text-sm text-gray-400">Subtotal: ${amount.toFixed(2)}</p>
                    <p className="text-sm text-yellow-400">Surcharge ({cardSurchargeRate}%): +${surchargeAmt.toFixed(2)}</p>
                    <p className="text-xl font-extrabold text-white">Total: ${cardChargeTotal.toFixed(2)}</p>
                  </div>
                ) : (
                  <p className="text-xl font-extrabold text-white">${remaining.toFixed(2)}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full border border-blue-700 bg-blue-900/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                  Tap to Pay
                </span>
                {(process.env.NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATE === 'true' || _terminalSimulated) && (
                  <span className="text-[10px] text-gray-600">Simulated reader</span>
                )}
              </div>
            </div>
            {cardSurchargeRate > 0 && (
              <p className="mt-2 text-[11px] text-yellow-500">{cardSurchargeRate}% card surcharge applies (ACCC compliance)</p>
            )}
          </div>
        )}

        <button
          onClick={handleApply}
          disabled={!canApply}
          className="mt-1 w-full rounded-xl bg-green-400 py-4 text-base font-bold text-green-950 disabled:opacity-40 hover:bg-green-300"
        >
          {method === 'card'
            ? terminalConfigLoading
              ? '⏳ Loading terminal…'
              : `💳 Charge $${cardChargeTotal.toFixed(2)} on Terminal`
            : `Apply ${METHOD_META[method].emoji} $${amount.toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}

// ─── Receipt modal ────────────────────────────────────────────────────────────

function ReceiptModal({
  orderNumber,
  total,
  change,
  tenders,
  onNewSale,
}: {
  orderNumber: string;
  total: number;
  change: number;
  tenders: Tender[];
  onNewSale: () => void;
}) {
  const cardTender = tenders.find((t) => t.method === 'card');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm rounded-2xl bg-[#1a1a2e] p-8 text-center shadow-2xl">
        <div className="mb-3 text-5xl">✅</div>
        <h2 className="mb-1 text-2xl font-extrabold text-green-400">Sale Complete</h2>
        <p className="mb-1 font-mono text-lg text-white">Order #{orderNumber}</p>
        <p className="mb-4 text-sm text-gray-400">Total: ${total.toFixed(2)}</p>
        {change > 0 && (
          <div className="mb-4 rounded-xl bg-green-950/40 p-3 text-green-300">
            Change due: <strong>${change.toFixed(2)}</strong>
          </div>
        )}
        {cardTender?.cardLast4 && (
          <div className="mb-4 rounded-xl border border-blue-900 bg-[#0f1e3d] p-3">
            <p className="text-xs text-blue-400">Card Payment</p>
            <p className="font-semibold text-white">
              {cardTender.cardBrand ?? 'Card'} •••• {cardTender.cardLast4}
            </p>
            {cardTender.paymentIntentId && (
              <p className="mt-0.5 font-mono text-[10px] text-gray-600">{cardTender.paymentIntentId}</p>
            )}
          </div>
        )}
        <button
          onClick={onNewSale}
          className="w-full rounded-xl bg-indigo-500 py-4 text-base font-bold text-white hover:bg-indigo-400"
        >
          New Sale
        </button>
      </div>
    </div>
  );
}

// ─── Payment page ─────────────────────────────────────────────────────────────

function PaymentContent() {
  const router = useRouter();
  const params = useSearchParams();

  const items: CartItem[] = (() => {
    try { return JSON.parse(params?.get('items') ?? '[]'); } catch { return []; }
  })();
  const exGst = Number(params?.get('exGst') ?? 0);
  const gst = Number(params?.get('gst') ?? 0);
  const total = Number(params?.get('total') ?? 0);
  const customerId = params?.get('customerId') ?? '';
  const customerName = params?.get('customerName') ?? '';
  const staffId = params?.get('staffId') ?? '';
  const staffName = params?.get('staffName') ?? '';

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [showAddTender, setShowAddTender] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<string | null>(null);
  const { receiptConnected, printReceipt: printerPrintReceipt } = usePrinter();

  // Stable orderId for this transaction
  const orderIdRef = useRef(`pos-${Date.now()}`);

  // ── Customer-Facing Display (CFD) broadcast channel ──────────────────────
  const cfdChannelRef = useRef<BroadcastChannel | null>(null);

  /** Post a message to the CFD and mirror it to localStorage for cross-tab fallback. */
  const cfdPost = useCallback((msg: object) => {
    try { cfdChannelRef.current?.postMessage(msg); } catch { /* ignore */ }
    try { localStorage.setItem('pos_cfd_state', JSON.stringify(msg)); } catch { /* ignore */ }
  }, []);

  // On mount: open channel and signal payment screen is active
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('pos_display');
      cfdChannelRef.current = channel;
    } catch { /* BroadcastChannel unavailable */ }

    // Broadcast the current cart so the CFD transitions to cart view
    const cartMsg = {
      type: 'cart_update' as const,
      items: items.map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.price,
        lineTotal: i.price * i.qty,
      })),
      subtotal: exGst,
      tax: gst,
      total,
    };
    try { channel?.postMessage(cartMsg); } catch { /* ignore */ }
    try { localStorage.setItem('pos_cfd_state', JSON.stringify(cartMsg)); } catch { /* ignore */ }

    return () => {
      // Return CFD to idle when leaving the payment screen
      const idleMsg = { type: 'idle' };
      try { channel?.postMessage(idleMsg); } catch { /* ignore */ }
      try { localStorage.setItem('pos_cfd_state', JSON.stringify(idleMsg)); } catch { /* ignore */ }
      try { channel?.close(); } catch { /* ignore */ }
      cfdChannelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paid = tenders.reduce((s, t) => s + t.amount, 0);
  const remaining = Math.max(0, total - paid);
  const isFullyCovered = paid >= total - 0.005;
  const totalChange = tenders.reduce((s, t) => s + (t.change ?? 0), 0);

  const handleAddTender = useCallback((tender: Tender) => {
    setTenders((prev) => [...prev, tender]);
    setShowAddTender(false);
  }, []);

  const handleCompleteSale = async () => {
    if (!isFullyCovered) return;
    setSubmitting(true);
    // Signal CFD: payment is being processed
    cfdPost({ type: 'payment_processing' });
    try {
      // Request order number from the orders API; fall back to a timestamp-based
      // ID that is far less likely to collide than a 4-digit random number.
      let orderNumber: string;
      try {
        const onRes = await fetch('/api/proxy/orders/next-number', { method: 'POST' });
        if (onRes.ok) {
          const onData = await onRes.json() as { orderNumber?: string };
          orderNumber = onData.orderNumber ?? `ORD-${Date.now().toString().slice(-8)}`;
        } else {
          orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
        }
      } catch {
        orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
      }
      const orderId = orderIdRef.current;
      const cardTender = tenders.find((t) => t.method === 'card');
      const surchargeAmount = cardTender?.surchargeAmount ?? 0;
      const tipAmount = cardTender?.tipAmount ?? 0;
      const primaryMethod = tenders[0]?.method ?? 'cash';
      const createdAt = new Date().toISOString();
      const deviceInfo = getDeviceInfo();
      const locationId = deviceInfo?.locationId ?? '00000000-0000-0000-0000-000000000001';

      // Parse item notes/discounts
      const kdsLines = items.map((i) => {
        let discountAmt: number | undefined;
        if (i.discount) {
          try {
            const d = JSON.parse(i.discount) as { type: 'pct' | 'flat'; value: number };
            if (d.type === 'pct') {
              discountAmt = Math.round(i.price * i.qty * (d.value / 100) * 100) / 100;
            } else {
              discountAmt = d.value;
            }
          } catch { /* ignore */ }
        }
        return { name: i.name, qty: i.qty, price: i.price, modifiers: [], note: i.note, discount: discountAmt };
      });

      // 1. Push to KDS
      await fetch('/api/kds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_order',
          paymentMethod: primaryMethod,
          paymentRef: cardTender?.paymentIntentId,
          cardLast4: cardTender?.cardLast4,
          cardBrand: cardTender?.cardBrand,
          order: {
            orderId,
            orderNumber,
            orderType: 'takeaway',
            channel: 'pos',
            locationId,
            lines: kdsLines,
            createdAt,
            status: 'new',
            ...(staffId ? { staffId, staffName } : {}),
            ...(customerId ? { customerId, customerName } : {}),
          },
        }),
      });

      // 2. Best-effort: persist to orders microservice; use server-returned
      //    orderNumber if the API provides one (overrides our generated value).
      fetch('/api/proxy/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber,
          locationId,
          registerId: deviceInfo?.deviceId ?? '00000000-0000-0000-0000-000000000002',
          channel: 'pos',
          orderType: 'takeaway',
          ...(customerId ? { customerId } : {}),
          ...(staffId ? { staffId } : {}),
          ...(surchargeAmount > 0 ? { surchargeAmount } : {}),
          ...(tipAmount > 0 ? { tipAmount } : {}),
          lines: items.map((i) => {
            let discountAmount = 0;
            if (i.discount) {
              try {
                const d = JSON.parse(i.discount) as { type: 'pct' | 'flat'; value: number };
                if (d.type === 'pct') {
                  discountAmount = Math.round(i.price * i.qty * (d.value / 100) * 100) / 100;
                } else {
                  discountAmount = d.value;
                }
              } catch { /* ignore */ }
            }
            return {
              productId: i.id,
              name: i.name,
              sku: i.id,
              quantity: i.qty,
              unitPrice: i.price,
              costPrice: 0,
              taxRate: 0.1,
              discountAmount,
              ...(i.note ? { note: i.note } : {}),
            };
          }),
        }),
      }).then(async (r) => {
        if (r.ok) {
          const d = await r.json().catch(() => ({})) as { orderNumber?: string };
          // If the server assigned a canonical order number, surface it on the
          // completed-order screen so the receipt shows the right number.
          if (d.orderNumber && d.orderNumber !== orderNumber) {
            setCompletedOrder(d.orderNumber);
          }
        }
      }).catch(() => {});

      // 3. Print receipt if printer is connected (uses context fn that reads
      //    the live ref, avoiding the stale-value bug of reading the port directly)
      if (receiptConnected) {
        const receiptData: ReceiptData = {
          storeName: deviceInfo?.label ?? 'ElevatedPOS',
          orderNumber,
          createdAt,
          staffName: staffName || undefined,
          customerName: customerName || undefined,
          lines: items.map((i) => {
            let discountAmt: number | undefined;
            if (i.discount) {
              try {
                const d = JSON.parse(i.discount) as { type: 'pct' | 'flat'; value: number };
                if (d.type === 'pct') {
                  discountAmt = Math.round(i.price * i.qty * (d.value / 100) * 100) / 100;
                } else {
                  discountAmt = d.value;
                }
              } catch { /* ignore */ }
            }
            return { name: i.name, qty: i.qty, price: i.price, discount: discountAmt, note: i.note };
          }),
          subtotalExGst: exGst,
          gst,
          surchargeAmount: surchargeAmount > 0 ? surchargeAmount : undefined,
          tipAmount: tipAmount > 0 ? tipAmount : undefined,
          total,
          tenders: tenders.map((t) => ({
            method: METHOD_META[t.method].label,
            amount: t.amount,
            change: t.change,
          })),
        };
        await printerPrintReceipt(receiptData).catch(() => {});
      }

      // Clear persisted cart on successful transaction
      try { localStorage.removeItem('elevatedpos_cart'); } catch { /* ignore */ }

      // Signal CFD: payment approved
      cfdPost({ type: 'payment_complete', message: 'Thank you for your purchase!' });

      setCompletedOrder(orderNumber);
    } finally {
      setSubmitting(false);
    }
  };

  if (completedOrder) {
    return (
      <ReceiptModal
        orderNumber={completedOrder}
        total={total}
        change={totalChange}
        tenders={tenders}
        onNewSale={() => router.replace('/pos')}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#1a1a2e]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#0f3460] px-4 py-3">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="text-base font-bold text-white">Payment</h1>
        <div className="w-16" />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Amount card */}
        <div className="mb-4 rounded-2xl border border-[#0f3460] bg-[#16213e] p-6 text-center">
          <p className="mb-1 text-xs uppercase tracking-widest text-gray-400">Total Due</p>
          <p className="text-5xl font-extrabold text-white">${total.toFixed(2)}</p>
          <p className="mt-2 text-sm text-gray-500">
            ex-GST ${exGst.toFixed(2)} + GST ${gst.toFixed(2)}
          </p>
        </div>

        {/* Paid / remaining */}
        {tenders.length > 0 && (
          <div className="mb-4 flex gap-0 overflow-hidden rounded-xl border border-[#0f3460] bg-[#16213e]">
            <div className="flex flex-1 flex-col items-center py-3">
              <p className="text-xs text-gray-500">Paid</p>
              <p className="text-xl font-bold text-green-400">${paid.toFixed(2)}</p>
            </div>
            <div className="w-px bg-[#0f3460]" />
            <div className="flex flex-1 flex-col items-center py-3">
              <p className="text-xs text-gray-500">Remaining</p>
              <p className={`text-xl font-bold ${remaining > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                ${remaining.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Tenders applied */}
        {tenders.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Tenders Applied</p>
            {tenders.map((t) => {
              const meta = METHOD_META[t.method];
              return (
                <div
                  key={t.id}
                  className="mb-2 flex items-center gap-3 rounded-xl border border-[#0f3460] bg-[#16213e] p-3"
                >
                  <span
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold"
                    style={{ color: meta.color, backgroundColor: `${meta.color}22` }}
                  >
                    {meta.emoji} {meta.label}
                  </span>
                  {t.cardLast4 && (
                    <span className="text-xs text-gray-400">
                      {t.cardBrand ?? 'Card'} ••••{t.cardLast4}
                    </span>
                  )}
                  <span className="ml-auto text-base font-bold text-white">${t.amount.toFixed(2)}</span>
                  {t.surchargeAmount && t.surchargeAmount > 0 && (
                    <span className="text-xs text-yellow-400">surcharge ${t.surchargeAmount.toFixed(2)}</span>
                  )}
                  {t.tipAmount && t.tipAmount > 0 && (
                    <span className="text-xs text-purple-400">tip ${t.tipAmount.toFixed(2)}</span>
                  )}
                  {t.change && t.change > 0 && (
                    <span className="text-xs text-green-400">change ${t.change.toFixed(2)}</span>
                  )}
                  <button
                    onClick={() => setTenders((prev) => prev.filter((x) => x.id !== t.id))}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Order summary */}
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Order Summary</p>
          {items.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className="flex items-center gap-2 border-b border-[#0f3460] py-2 text-sm"
            >
              <span className="text-gray-500">{item.qty}×</span>
              <span className="flex-1 text-gray-200">{item.name}</span>
              <span className="font-medium text-gray-400">${(item.price * item.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#0f3460] px-4 pb-6 pt-3 space-y-2">
        {!isFullyCovered && (
          <button
            onClick={() => setShowAddTender(true)}
            className="w-full rounded-xl border border-[#1e40af] bg-[#0f3460] py-3.5 text-sm font-semibold text-blue-300 hover:bg-[#1e3a70]"
          >
            + Add Tender{remaining > 0 ? ` ($${remaining.toFixed(2)} remaining)` : ''}
          </button>
        )}
        <button
          onClick={handleCompleteSale}
          disabled={!isFullyCovered || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-400 py-4 text-base font-extrabold text-green-950 disabled:opacity-40 hover:bg-green-300"
        >
          {submitting ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-900 border-t-transparent" />
          ) : isFullyCovered ? (
            'Complete Sale ✓'
          ) : (
            `Complete Sale ($${remaining.toFixed(2)} remaining)`
          )}
        </button>
      </div>

      {showAddTender && (
        <AddTenderDialog
          remaining={remaining}
          orderId={orderIdRef.current}
          onClose={() => setShowAddTender(false)}
          onAdd={handleAddTender}
          onPaymentProcessing={() => cfdPost({ type: 'payment_processing' })}
        />
      )}
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#1a1a2e] text-white">Loading…</div>}>
      <PaymentContent />
    </Suspense>
  );
}
