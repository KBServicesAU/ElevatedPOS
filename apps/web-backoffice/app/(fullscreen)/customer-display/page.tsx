'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CartLineItem {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

type DisplayState =
  | { mode: 'idle' }
  | { mode: 'cart'; items: CartLineItem[]; subtotal: number; tax: number; total: number }
  | { mode: 'payment_processing' }
  | { mode: 'payment_complete'; loyaltyPoints?: number; message?: string };

type CFDMessage =
  | { type: 'cart_update'; items: CartLineItem[]; subtotal: number; tax: number; total: number }
  | { type: 'payment_processing' }
  | { type: 'payment_complete'; loyaltyPoints?: number; message?: string }
  | { type: 'idle' };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function padTwo(n: number) {
  return String(n).padStart(2, '0');
}

// ─── Clock ──────────────────────────────────────────────────────────────────────

function Clock() {
  const now = useNow();
  const h = padTwo(now.getHours());
  const m = padTwo(now.getMinutes());
  const s = padTwo(now.getSeconds());
  const dateStr = now.toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div className="text-center">
      <div className="font-mono text-7xl font-black tracking-tight text-white tabular-nums">
        {h}:{m}
        <span className="animate-pulse text-gray-500">:{s}</span>
      </div>
      <div className="mt-2 text-lg text-gray-400">{dateStr}</div>
    </div>
  );
}

// ─── Marquee ticker ──────────────────────────────────────────────────────────

function Ticker({ message }: { message: string }) {
  if (!message) return null;
  // Duplicate the message so the marquee loops seamlessly
  const text = `${message}   •   ${message}   •   `;
  return (
    <div className="overflow-hidden border-t border-gray-800 bg-gray-900 py-3">
      <div
        className="whitespace-nowrap text-sm font-medium text-indigo-300"
        style={{ animation: 'ticker-scroll 30s linear infinite' }}
      >
        {text.repeat(3)}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0%); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
}

// ─── Branding block ──────────────────────────────────────────────────────────

function BrandBlock({ orgName }: { orgName: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Logo placeholder — swap for <Image> if a logoUrl is available */}
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 shadow-2xl shadow-indigo-900/50">
        <span className="text-4xl font-black text-white">E</span>
      </div>
      <div className="text-center">
        <p className="text-4xl font-black tracking-tight text-white">{orgName}</p>
        <p className="mt-1 text-sm uppercase tracking-[0.3em] text-indigo-400">Powered by ElevatedPOS</p>
      </div>
    </div>
  );
}

// ─── Idle screen ─────────────────────────────────────────────────────────────

function IdleScreen({
  orgName,
  idleMessage,
}: {
  orgName: string;
  idleMessage: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-12">
        <BrandBlock orgName={orgName} />

        {/* Animated welcome */}
        <div
          className="text-center"
          style={{ animation: 'welcome-pulse 3s ease-in-out infinite' }}
        >
          <p className="text-6xl font-extrabold tracking-tight text-white">
            Welcome
          </p>
          <p className="mt-3 text-xl text-gray-400">
            Please place your order with our staff
          </p>
        </div>

        <style>{`
          @keyframes welcome-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.85; transform: scale(0.98); }
          }
        `}</style>
      </div>

      <Clock />
      <div className="mt-8" />

      <Ticker message={idleMessage} />
    </div>
  );
}

// ─── Cart screen ─────────────────────────────────────────────────────────────

function CartScreen({
  items,
  subtotal,
  tax,
  total,
}: {
  items: CartLineItem[];
  subtotal: number;
  tax: number;
  total: number;
}) {
  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-10 py-6">
        <p className="text-xs uppercase tracking-[0.25em] text-indigo-400">Your Order</p>
        <p className="mt-1 text-2xl font-bold text-white">
          {items.reduce((s, i) => s + i.qty, 0)} item{items.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Line items — scrollable */}
      <div className="flex-1 overflow-y-auto px-10 py-4">
        <div className="divide-y divide-gray-800">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-4 py-4"
              style={{
                animation: `slide-in 0.25s ease-out ${idx * 40}ms both`,
              }}
            >
              {/* Qty badge */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-900/60 text-base font-black text-indigo-300">
                {item.qty}×
              </div>

              {/* Name */}
              <div className="flex-1">
                <p className="text-xl font-semibold text-white">{item.name}</p>
                <p className="text-sm text-gray-500">{fmt(item.unitPrice)} each</p>
              </div>

              {/* Line total */}
              <p className="text-2xl font-bold text-white tabular-nums">{fmt(item.lineTotal)}</p>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes slide-in {
            from { opacity: 0; transform: translateX(24px); }
            to   { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </div>

      {/* Totals panel */}
      <div className="border-t border-gray-800 bg-gray-900/60 px-10 py-6">
        <div className="mb-3 flex justify-between text-base text-gray-400">
          <span>Subtotal (ex-GST)</span>
          <span className="tabular-nums">{fmt(subtotal)}</span>
        </div>
        <div className="mb-4 flex justify-between text-base text-gray-400">
          <span>GST (10%)</span>
          <span className="tabular-nums">{fmt(tax)}</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-bold text-white">Total</span>
          <span
            className="font-black tabular-nums text-white"
            style={{ fontSize: '3.5rem', lineHeight: 1 }}
          >
            {fmt(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Payment processing screen ────────────────────────────────────────────────

function PaymentProcessingScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-12">
      {/* Spinner ring */}
      <div className="relative flex h-32 w-32 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        <div className="h-20 w-20 rounded-full bg-indigo-900/40" />
        <svg
          className="absolute h-10 w-10 text-indigo-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      </div>

      <div className="text-center">
        <p className="text-5xl font-extrabold text-white">Processing Payment</p>
        <p className="mt-3 text-xl text-gray-400">Please follow the prompts on the terminal…</p>
      </div>
    </div>
  );
}

// ─── Payment complete screen ──────────────────────────────────────────────────

function PaymentCompleteScreen({
  loyaltyPoints,
  message,
}: {
  loyaltyPoints?: number;
  message?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-12">
      {/* Checkmark */}
      <div
        className="flex h-32 w-32 items-center justify-center rounded-full bg-green-500/20"
        style={{ animation: 'pop-in 0.4s cubic-bezier(0.175,0.885,0.32,1.275) both' }}
      >
        <svg
          className="h-16 w-16 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div className="text-center">
        <p
          className="text-6xl font-black text-green-400"
          style={{ animation: 'pop-in 0.4s 0.1s cubic-bezier(0.175,0.885,0.32,1.275) both' }}
        >
          Payment Approved
        </p>
        <p
          className="mt-3 text-2xl text-white"
          style={{ animation: 'pop-in 0.4s 0.2s cubic-bezier(0.175,0.885,0.32,1.275) both' }}
        >
          {message ?? 'Thank you for your purchase!'}
        </p>
      </div>

      {loyaltyPoints != null && loyaltyPoints > 0 && (
        <div
          className="flex items-center gap-3 rounded-2xl border border-yellow-700/50 bg-yellow-900/20 px-8 py-4"
          style={{ animation: 'pop-in 0.4s 0.35s cubic-bezier(0.175,0.885,0.32,1.275) both' }}
        >
          <span className="text-3xl">⭐</span>
          <div>
            <p className="text-xl font-bold text-yellow-300">
              You earned {loyaltyPoints} loyalty point{loyaltyPoints !== 1 ? 's' : ''}!
            </p>
            <p className="text-sm text-yellow-500">Keep collecting for rewards</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pop-in {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CustomerDisplayPage() {
  const [displayState, setDisplayState] = useState<DisplayState>({ mode: 'idle' });
  const [idleMessage, setIdleMessage] = useState('');
  const [orgName, setOrgName] = useState('Welcome');
  const channelRef = useRef<BroadcastChannel | null>(null);

  // ── Fetch idle message from receipt settings ──────────────────────────────
  useEffect(() => {
    void fetch('/api/proxy/settings/receipt')
      .then((r) => r.ok ? r.json() : null)
      .then((data: { idleMessage?: string } | null) => {
        if (data?.idleMessage) setIdleMessage(data.idleMessage);
      })
      .catch(() => {/* best-effort */});
  }, []);

  // ── Read org name from localStorage ──────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('elevatedpos_org_name');
      if (stored) setOrgName(stored);
    } catch { /* ignore */ }
  }, []);

  // ── Apply a CFD message to state ──────────────────────────────────────────
  const applyMessage = useCallback((msg: CFDMessage) => {
    switch (msg.type) {
      case 'cart_update':
        setDisplayState({
          mode: 'cart',
          items: msg.items,
          subtotal: msg.subtotal,
          tax: msg.tax,
          total: msg.total,
        });
        break;
      case 'payment_processing':
        setDisplayState({ mode: 'payment_processing' });
        break;
      case 'payment_complete':
        setDisplayState({
          mode: 'payment_complete',
          loyaltyPoints: msg.loyaltyPoints,
          message: msg.message,
        });
        break;
      case 'idle':
        setDisplayState({ mode: 'idle' });
        break;
    }
  }, []);

  // ── BroadcastChannel listener ──────────────────────────────────────────────
  useEffect(() => {
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel('pos_display');
      channelRef.current = channel;
      channel.onmessage = (e: MessageEvent<CFDMessage>) => {
        applyMessage(e.data);
      };
    } catch {
      // BroadcastChannel not available (e.g. some private windows)
    }
    return () => {
      try { channel?.close(); } catch { /* ignore */ }
    };
  }, [applyMessage]);

  // ── localStorage fallback (storage event from same origin, other tab) ──────
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'pos_cfd_state' || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as CFDMessage;
        applyMessage(msg);
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [applyMessage]);

  // ── Auto-return to idle after payment complete ─────────────────────────────
  useEffect(() => {
    if (displayState.mode !== 'payment_complete') return;
    const id = setTimeout(() => setDisplayState({ mode: 'idle' }), 6000);
    return () => clearTimeout(id);
  }, [displayState.mode]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-950 text-white">
      {/* ── Top status bar ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900/80 px-8 py-2">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Customer Display
          </span>
        </div>
        <span className="text-[11px] text-gray-700">ElevatedPOS</span>
      </div>

      {/* ── Main content ── */}
      <div
        className="flex flex-1 flex-col overflow-hidden transition-all duration-500"
        style={{
          opacity: 1,
        }}
      >
        {displayState.mode === 'idle' && (
          <IdleScreen orgName={orgName} idleMessage={idleMessage} />
        )}

        {displayState.mode === 'cart' && (
          <CartScreen
            items={displayState.items}
            subtotal={displayState.subtotal}
            tax={displayState.tax}
            total={displayState.total}
          />
        )}

        {displayState.mode === 'payment_processing' && <PaymentProcessingScreen />}

        {displayState.mode === 'payment_complete' && (
          <PaymentCompleteScreen
            loyaltyPoints={displayState.loyaltyPoints}
            message={displayState.message}
          />
        )}
      </div>
    </div>
  );
}
