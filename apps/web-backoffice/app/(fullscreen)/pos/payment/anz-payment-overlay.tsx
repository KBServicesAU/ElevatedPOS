'use client';

/**
 * ANZ Worldline TIM API Payment Overlay
 *
 * Drives the full 15-state payment lifecycle via createAnzPaymentProvider.
 * Replaces the old AnzTerminalOverlay which used the stripped-down timapi-client.
 *
 * This component owns a provider instance for the duration of one transaction.
 * The provider is shut down on unmount.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, Clock, XCircle, ShieldAlert } from 'lucide-react';
import {
  createAnzPaymentProvider,
  createSimulatorProvider,
  type AnzProviderOptions,
  type SimulatorOptions,
} from '@/lib/payments';
import type { PaymentResult, PaymentState, TimConfig } from '@/lib/payments';
import { CANCEL_BLOCKED_STATES, CANCELLABLE_STATES } from '@/lib/payments';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AnzPaymentOverlayProps {
  /** Dollar amount to charge (including any surcharge) */
  amount: number;
  /** POS order reference — stored on the server intent */
  posOrderId: string;
  /** Full TIM config (IP, port, integratorId, autoCommit, etc.) */
  config: TimConfig;
  /** Called when the payment is fully approved and committed */
  onApproved: (result: PaymentResult) => void;
  /** Called when the payment is declined or failed (retryable) */
  onFailed: (msg: string, result?: PaymentResult) => void;
  /** Called after the operator cancels and the terminal confirms */
  onCancel: () => void;
  /**
   * Dev-mode: run a simulated terminal instead of the real TIM SDK.
   * Accepts the same SimulatorOptions as createSimulatorProvider.
   */
  simulate?: SimulatorOptions;
}

// ─── Phase config ─────────────────────────────────────────────────────────────

interface PhaseConfig {
  icon: 'spinner' | 'tap' | 'check' | 'alert' | 'cancelled' | 'shield' | 'clock';
  label: string;
  sub?: string;
  color: string;
  showCancel: boolean;
  cancelBlocked?: boolean; // shows "please wait" instead of cancel button
}

function getPhaseConfig(state: PaymentState, statusMsg: string): PhaseConfig {
  switch (state) {
    case 'created':
      return { icon: 'spinner', label: 'Preparing…', color: '#6366f1', showCancel: true };

    case 'initializing_terminal':
      return { icon: 'spinner', label: 'Loading terminal SDK…', color: '#6366f1', showCancel: true };

    case 'awaiting_terminal_ready':
      return { icon: 'spinner', label: 'Connecting to terminal…', sub: 'Establishing secure WebSocket', color: '#6366f1', showCancel: true };

    case 'sent_to_terminal':
      return { icon: 'spinner', label: statusMsg || 'Transaction sent…', color: '#6366f1', showCancel: true };

    case 'awaiting_cardholder':
      return { icon: 'tap', label: 'Present Card', sub: 'Tap, Insert or Swipe', color: '#f59e0b', showCancel: true };

    case 'authorizing':
      return { icon: 'spinner', label: 'Authorizing…', sub: 'Contacting bank — please wait', color: '#818cf8', showCancel: true, cancelBlocked: true };

    case 'approved_pending_commit':
      return { icon: 'clock', label: 'Finalizing payment…', sub: 'Do not remove card or navigate away', color: '#818cf8', showCancel: true, cancelBlocked: true };

    case 'cancel_requested':
      return { icon: 'spinner', label: 'Cancelling…', sub: 'Waiting for terminal confirmation', color: '#94a3b8', showCancel: false };

    case 'approved':
      return { icon: 'check', label: 'Payment Approved', color: '#4ade80', showCancel: false };

    case 'declined':
      return { icon: 'alert', label: 'Payment Declined', sub: statusMsg || undefined, color: '#f87171', showCancel: false };

    case 'cancelled':
      return { icon: 'cancelled', label: 'Transaction Cancelled', color: '#94a3b8', showCancel: false };

    case 'failed_retryable':
      return { icon: 'alert', label: 'Transaction Error', sub: statusMsg || 'Please try again', color: '#f87171', showCancel: false };

    case 'failed_terminal':
      return { icon: 'alert', label: 'Terminal Error', sub: statusMsg || 'Contact support if this persists', color: '#f87171', showCancel: false };

    case 'unknown_outcome':
      return { icon: 'shield', label: 'Unknown Outcome', sub: 'Operator reconciliation required', color: '#f59e0b', showCancel: false };

    case 'recovery_required':
      return { icon: 'shield', label: 'Recovery Required', sub: 'Manual reconciliation needed', color: '#f59e0b', showCancel: false };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ color }: { color: string }) {
  return (
    <div
      className="h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
      style={{ borderColor: color, borderTopColor: 'transparent' }}
    />
  );
}

function TapIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 40" className="h-12 w-12 fill-none" style={{ stroke: color }} strokeWidth={2}>
      <circle cx="20" cy="20" r="8" />
      <circle cx="20" cy="20" r="14" strokeOpacity={0.4} />
      <circle cx="20" cy="20" r="19" strokeOpacity={0.15} />
    </svg>
  );
}

function PhaseIcon({ type, color }: { type: PhaseConfig['icon']; color: string }) {
  if (type === 'spinner')   return <Spinner color={color} />;
  if (type === 'tap')       return <TapIcon color={color} />;
  if (type === 'check')     return <CheckCircle className="h-12 w-12" style={{ color }} />;
  if (type === 'alert')     return <AlertCircle className="h-12 w-12" style={{ color }} />;
  if (type === 'cancelled') return <XCircle className="h-12 w-12 opacity-60" style={{ color }} />;
  if (type === 'shield')    return <ShieldAlert className="h-12 w-12" style={{ color }} />;
  if (type === 'clock')     return <Clock className="h-12 w-12" style={{ color }} />;
  return null;
}

// ─── Step progress dots ───────────────────────────────────────────────────────

const STEPS: PaymentState[] = [
  'awaiting_terminal_ready',
  'awaiting_cardholder',
  'authorizing',
  'approved',
];

function StepDots({ currentState }: { currentState: PaymentState }) {
  const currentIdx = STEPS.findIndex((s) => s === currentState);
  const progressIdx = currentIdx === -1 ? 0 : currentIdx;

  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {STEPS.map((step, i) => {
        const done = i < progressIdx || currentState === 'approved';
        const active = i === progressIdx && currentState !== 'approved';
        const color = done || active ? '#6366f1' : '#334155';
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className="rounded-full transition-all duration-300"
              style={{
                width: active ? 10 : 8,
                height: active ? 10 : 8,
                backgroundColor: color,
                transform: active ? 'scale(1.2)' : 'scale(1)',
              }}
            />
            {i < STEPS.length - 1 && (
              <div className="h-px w-6" style={{ backgroundColor: done ? '#6366f1' : '#334155' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────

export function AnzPaymentOverlay({
  amount,
  posOrderId,
  config,
  onApproved,
  onFailed,
  onCancel,
  simulate,
}: AnzPaymentOverlayProps) {
  const [currentState, setCurrentState] = useState<PaymentState>('created');
  const [statusMsg, setStatusMsg] = useState('');
  const [lastResult, setLastResult] = useState<PaymentResult | null>(null);

  const providerRef = useRef<ReturnType<typeof createAnzPaymentProvider> | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const provider = simulate
      ? createSimulatorProvider(simulate)
      : createAnzPaymentProvider({
          config,
          onTerminalStatusChange: (status) => {
            // Map terminal connection state to payment state for early feedback
            if (status.state === 'connecting' || status.state === 'logging_in') {
              setCurrentState('awaiting_terminal_ready');
            }
          },
        } satisfies AnzProviderOptions);

    providerRef.current = provider;

    // ANZ Section 3.1: Pair terminal (Connect → Login → Activate) before first transaction.
    // Wrapped in an async IIFE — useEffect callbacks cannot be async directly.
    // pairTerminal() is non-fatal: SDK pre-automatisms pair implicitly if this fails.
    void (async () => {
      if (!simulate) {
        try {
          setCurrentState('awaiting_terminal_ready');
          await provider.pairTerminal();
        } catch {
          // Non-fatal — proceed; SDK pairs implicitly during transactionAsync()
        }
      }

      const result = await provider.startPurchase({
        posOrderId,
        amount,
        currency: 'AUD',
        onStateChange: (intent) => {
          setCurrentState(intent.state);
        },
        onStatusMessage: (msg) => {
          setStatusMsg(msg);
        },
      }).catch((err: Error) => {
        setStatusMsg(err.message);
        setCurrentState('failed_retryable');
        setTimeout(() => onFailed(err.message), 1500);
        return null;
      });

      if (!result) return;

      setLastResult(result);
      setCurrentState(result.state);

      if (result.approved && result.state === 'approved') {
        setTimeout(() => onApproved(result), 800);
      } else if (result.state === 'cancelled') {
        setTimeout(() => onCancel(), 500);
      } else if (result.state === 'unknown_outcome' || result.state === 'recovery_required') {
        // Stay on screen — operator must acknowledge
      } else {
        const msg = result.declineReason ?? result.errorMessage ?? 'Transaction failed';
        setTimeout(() => onFailed(msg, result), 1500);
      }
    })();

    return () => {
      void provider.shutdown();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = getPhaseConfig(currentState, statusMsg);

  const handleCancel = () => {
    if (phase.cancelBlocked) return;
    void providerRef.current?.cancelCurrentOperation();
  };

  const isUnknownOutcome =
    currentState === 'unknown_outcome' || currentState === 'recovery_required';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-2xl border bg-[#0d0f1f] p-8 shadow-2xl"
        style={{ borderColor: phase.color + '44' }}
      >
        {/* Terminal display */}
        <div
          className="mb-5 flex flex-col items-center justify-center rounded-2xl border-2 py-10 transition-all duration-500"
          style={{ borderColor: phase.color, backgroundColor: phase.color + '12' }}
        >
          <PhaseIcon type={phase.icon} color={phase.color} />

          {currentState === 'awaiting_cardholder' && (
            <div className="mt-4 flex gap-2">
              {['Tap', 'Insert', 'Swipe'].map((m) => (
                <span
                  key={m}
                  className="rounded-lg border px-2 py-1 text-xs font-semibold"
                  style={{ borderColor: phase.color + '55', color: phase.color, backgroundColor: phase.color + '18' }}
                >
                  {m}
                </span>
              ))}
            </div>
          )}

          <p className="mt-4 text-lg font-bold" style={{ color: phase.color }}>
            {phase.label}
          </p>
          {phase.sub && (
            <p className="mt-1 max-w-[220px] text-center text-xs" style={{ color: phase.color + 'aa' }}>
              {phase.sub}
            </p>
          )}
          <p className="mt-3 text-2xl font-extrabold text-white">${amount.toFixed(2)}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: phase.color + '77' }}>
            ANZ Worldline
          </p>
        </div>

        {/* Step progress */}
        <StepDots currentState={currentState} />

        {/* Unknown outcome — operator incident notice */}
        {isUnknownOutcome && (
          <div className="mb-4 rounded-xl border border-yellow-700/40 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
            <p className="font-bold">Operator action required</p>
            <p className="mt-1 opacity-80">
              The bank may have authorized this payment but the terminal result is unknown. Do NOT retry.
              Check the ANZ Worldline portal or contact support to reconcile this transaction.
            </p>
            {lastResult?.intentId && (
              <p className="mt-2 font-mono text-[10px] opacity-60">Intent: {lastResult.intentId}</p>
            )}
          </div>
        )}

        {/* Cancel / cancel-blocked UI */}
        {phase.showCancel && (
          phase.cancelBlocked ? (
            <div className="w-full rounded-xl border border-[#1e2a40] bg-[#141830] py-3 text-center text-xs text-gray-500">
              {currentState === 'approved_pending_commit'
                ? 'Finalizing — please do not navigate away'
                : 'Please wait — cannot cancel during authorization'}
            </div>
          ) : (
            <button
              onClick={handleCancel}
              className="w-full rounded-xl border border-[#1e2a40] bg-[#141830] py-3 text-sm font-semibold text-gray-400 transition hover:bg-[#1e2a50] hover:text-white active:scale-95"
            >
              Cancel Transaction
            </button>
          )
        )}

        {/* Dismiss for unknown outcome */}
        {isUnknownOutcome && (
          <button
            onClick={() => onFailed('Unknown outcome — manual reconciliation required', lastResult ?? undefined)}
            className="mt-2 w-full rounded-xl border border-yellow-700/40 bg-yellow-900/20 py-3 text-sm font-semibold text-yellow-300 transition hover:bg-yellow-900/40"
          >
            Acknowledge & Close
          </button>
        )}

        {/* Retry for retryable failures */}
        {(currentState === 'failed_retryable') && (
          <button
            onClick={() => {
              setCurrentState('created');
              setStatusMsg('');
              setLastResult(null);
              startedRef.current = false;
              // Re-trigger the effect by forcing a new provider
              void providerRef.current?.shutdown().then(() => {
                providerRef.current = null;
                startedRef.current = false;
                // Note: the effect won't re-run after this — caller must remount
                // this component (by toggling showTerminal) to retry.
              });
              onFailed('failed_retryable — retry', undefined);
            }}
            className="mt-2 w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 active:scale-95"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
