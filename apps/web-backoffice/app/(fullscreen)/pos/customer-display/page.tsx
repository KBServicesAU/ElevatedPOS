'use client';

import { useState, useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  name: string;
  qty: number;
  price: number;
}

type DisplayState =
  | { type: 'idle'; storeName: string; message: string }
  | { type: 'cart'; items: CartItem[]; total: number; gst: number; currency: string; customerName?: string }
  | { type: 'payment'; amount: number; method: string }
  | { type: 'thankyou'; total: number; change?: number; message?: string };

const INITIAL_STATE: DisplayState = {
  type: 'idle',
  storeName: 'ElevatedPOS',
  message: 'Welcome',
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
  }).format(amount);
}

// ─── Screens ──────────────────────────────────────────────────────────────────

function IdleScreen({ state }: { state: Extract<DisplayState, { type: 'idle' }> }) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 select-none">
      {/* Logo ring */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 30,
          background: '#6366f1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 60px rgba(99,102,241,0.4)',
        }}
      >
        <span
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: '#fff',
            fontFamily: 'Georgia, serif',
            lineHeight: 1,
          }}
        >
          E
        </span>
      </div>

      {/* Store name */}
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontSize: 18,
            color: '#6366f1',
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: 'uppercase',
            marginBottom: 16,
          }}
        >
          {state.storeName}
        </p>
        <h1
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: -1,
            lineHeight: 1.1,
          }}
        >
          {state.message}
          <span style={{ color: '#4f46e5' }}>{'.'.repeat(dots)}</span>
        </h1>
      </div>
    </div>
  );
}

function CartScreen({ state }: { state: Extract<DisplayState, { type: 'cart' }> }) {
  const subtotal = state.total - (state.gst ?? 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '48px 64px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#a5b4fc', marginBottom: 4 }}>
          {state.customerName ? `Hi, ${state.customerName}` : 'Your order'}
        </h2>
        <div
          style={{
            width: 48,
            height: 3,
            background: '#6366f1',
            borderRadius: 2,
          }}
        />
      </div>

      {/* Line items */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 32 }}>
        {state.items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 0',
              borderBottom: '1px solid #1e1e2e',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#1e1e2e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#6366f1',
                  flexShrink: 0,
                }}
              >
                {item.qty}
              </span>
              <span style={{ fontSize: 20, color: '#e2e8f0', fontWeight: 500 }}>{item.name}</span>
            </div>
            <span style={{ fontSize: 20, color: '#ffffff', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {fmt(item.price * item.qty, state.currency)}
            </span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div
        style={{
          background: '#0d0d1a',
          borderRadius: 16,
          padding: '24px 32px',
          border: '1px solid #2a2a3e',
        }}
      >
        {state.gst > 0 && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span style={{ color: '#64748b', fontSize: 16 }}>Subtotal (ex. GST)</span>
              <span style={{ color: '#94a3b8', fontSize: 16 }}>{fmt(subtotal, state.currency)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span style={{ color: '#64748b', fontSize: 16 }}>GST (10%)</span>
              <span style={{ color: '#94a3b8', fontSize: 16 }}>
                {fmt(state.gst, state.currency)}
              </span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#e2e8f0', fontSize: 22, fontWeight: 700 }}>Total</span>
          <span style={{ color: '#ffffff', fontSize: 48, fontWeight: 900 }}>
            {fmt(state.total, state.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PaymentScreen({ state }: { state: Extract<DisplayState, { type: 'payment' }> }) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 1200);
    return () => clearInterval(id);
  }, []);

  const methodIcons: Record<string, string> = {
    card: '💳',
    tap: '📱',
    cash: '💵',
    eftpos: '💳',
  };
  const icon = methodIcons[state.method.toLowerCase()] ?? '💳';

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 select-none">
      {/* Animated payment icon */}
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: pulse ? '#312e81' : '#1e1b4b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.6s ease',
          boxShadow: pulse ? '0 0 80px rgba(99,102,241,0.6)' : '0 0 20px rgba(99,102,241,0.15)',
        }}
      >
        <span style={{ fontSize: 64 }}>{icon}</span>
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 22, color: '#a5b4fc', fontWeight: 600, marginBottom: 8 }}>
          {state.method === 'cash' ? 'Tendering cash' : `Please ${state.method === 'tap' ? 'tap' : 'insert'} your card`}
        </p>
        <h1
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: -2,
          }}
        >
          {fmt(state.amount)}
        </h1>
      </div>
    </div>
  );
}

function ThankYouScreen({ state }: { state: Extract<DisplayState, { type: 'thankyou' }> }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 select-none">
      {/* Checkmark */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: '#064e3b',
          border: '4px solid #10b981',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 60px rgba(16,185,129,0.35)',
        }}
      >
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: '#ffffff',
            marginBottom: 8,
          }}
        >
          {state.message ?? 'Thank you!'}
        </h1>
        <p style={{ fontSize: 26, color: '#6ee7b7', fontWeight: 600 }}>
          {fmt(state.total)} paid
        </p>
        {state.change !== undefined && state.change > 0 && (
          <p style={{ fontSize: 20, color: '#94a3b8', marginTop: 8 }}>
            Change: {fmt(state.change)}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function CustomerDisplayPage() {
  const [displayState, setDisplayState] = useState<DisplayState>(INITIAL_STATE);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    // Listen on BroadcastChannel for state pushed by the POS tab
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('customer-display');
      channelRef.current = bc;

      bc.onmessage = (event: MessageEvent<DisplayState>) => {
        if (event.data?.type) {
          setDisplayState(event.data);
        }
      };

      // Announce readiness so the POS can push current state
      bc.postMessage({ type: 'display.ready' });
    } catch {
      // BroadcastChannel not supported — fall back to polling
      console.warn('[customer-display] BroadcastChannel not supported');
    }

    return () => {
      bc?.close();
    };
  }, []);

  // Prevent accidental navigation
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#09090b',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Subtle gradient backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Screen content */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {displayState.type === 'idle' && <IdleScreen state={displayState} />}
        {displayState.type === 'cart' && <CartScreen state={displayState} />}
        {displayState.type === 'payment' && <PaymentScreen state={displayState} />}
        {displayState.type === 'thankyou' && <ThankYouScreen state={displayState} />}
      </div>

      {/* Powered-by badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          right: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: 0.3,
        }}
      >
        <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
          Powered by ElevatedPOS
        </span>
      </div>
    </div>
  );
}
