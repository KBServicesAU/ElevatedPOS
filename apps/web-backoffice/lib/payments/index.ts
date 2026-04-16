/**
 * ElevatedPOS ANZ Worldline TIM Payment — main entry point
 *
 * Wires together TimApiAdapter, TerminalSessionManager, PaymentStateMachine,
 * PaymentLogger, and server-side persistence into a single PaymentProvider
 * implementation that the browser POS uses.
 *
 * Usage:
 *   import { createAnzPaymentProvider, checkForUnresolvedPayments } from '@/lib/payments';
 *
 * The POS calls checkForUnresolvedPayments() on startup to surface any
 * crashed transactions to the operator.
 */

export { type PaymentProvider, PaymentProviderError, type RefundRequest, type ReversalRequest } from './provider';
export type {
  TimConfig,
  PaymentIntent,
  PaymentResult,
  PaymentState,
  TerminalStatus,
  TerminalHealth,
  PaymentLogEntry,
  TerminalApplicationInfo,
} from './domain';
export { TERMINAL_STATES, RETRYABLE_STATES, CANCELLABLE_STATES, CANCEL_BLOCKED_STATES } from './domain';

import type { TimConfig, PaymentIntent, PaymentResult, PaymentState, TerminalHealth, TerminalApplicationInfo } from './domain';
import type { StartPurchaseRequest, RefundRequest, ReversalRequest, PaymentProvider } from './provider';
import { PaymentProviderError } from './provider';
import { TerminalSessionManager } from './session-manager';
import { PaymentLogger } from './logger';
import { PaymentStateMachine } from './state-machine';
import type { PaymentPersistence } from './state-machine';
import { TimApiAdapter } from './tim-adapter';

// ─── Server-side persistence (via web POS proxy API) ─────────────────────────

function createServerPersistence(): PaymentPersistence {
  return {
    async createIntent(intent) {
      const res = await fetch('/api/proxy/eftpos/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posOrderId:    intent.posOrderId,
          amountCents:   Math.round(intent.amount * 100),
          currency:      intent.currency,
          terminalIp:    intent.terminalIp,
          terminalPort:  intent.terminalPort,
          terminalLabel: intent.terminalLabel,
        }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create payment intent on server');
      const data = await res.json() as { data: { id: string } };
      return data.data.id;
    },

    async updateState(intentId, state, details, result) {
      await fetch(`/api/proxy/eftpos/intents/${intentId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state,
          details,
          ...(result?.transactionRef  ? { timCorrelationId: result.transactionRef }       : {}),
          ...(result?.approved        !== undefined ? { resultApproved: result.approved }  : {}),
          ...(result?.authCode        ? { authCode: result.authCode }                      : {}),
          ...(result?.cardLast4       ? { cardLast4: result.cardLast4 }                    : {}),
          ...(result?.cardScheme      ? { cardScheme: result.cardScheme }                  : {}),
          ...(result?.rrn             ? { rrn: result.rrn }                                : {}),
          ...(result?.merchantReceipt ? { merchantReceipt: result.merchantReceipt }        : {}),
          ...(result?.customerReceipt ? { customerReceipt: result.customerReceipt }        : {}),
        }),
        credentials: 'include',
      }).catch(() => {/* non-fatal */});
    },

    async appendSupportLog(intentId, entries) {
      await fetch(`/api/proxy/eftpos/intents/${intentId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
        credentials: 'include',
      }).catch(() => {/* non-fatal */});
    },
  };
}

// ─── Simulator persistence (dev/test — no server required) ───────────────────

function createSimulatorPersistence(): PaymentPersistence {
  let seq = 1;
  return {
    createIntent: async () => `sim-${Date.now()}-${seq++}`,
    updateState:  async () => {},
    appendSupportLog: async () => {},
  };
}

// ─── Module-level persistent log store ────────────────────────────────────────
// Survives individual provider instances so logs can be downloaded at any time
// via the Settings modal (Section 4 submission checklist: "TIM API log files").

const _persistentLogger = new PaymentLogger();

/**
 * Download all payment logs captured in this browser session as a plain-text file.
 * Filename: ANZ-PAY-LOG-YYYYMMDD.txt
 * Section 4: "TIM API log files (TimApiYYYYMMDD.log) — Ensure logging is set to ALL"
 */
export function downloadPaymentLogs(): void {
  _persistentLogger.downloadLog();
}

/**
 * Return all log entries captured in this session (for diagnostics / server upload).
 */
export function getPaymentLogEntries() {
  return _persistentLogger.getEntries();
}

// ─── Provider factory ─────────────────────────────────────────────────────────

export interface AnzProviderOptions {
  config: TimConfig;
  /** Use simulated terminal (dev mode — no SDK required) */
  simulate?: boolean;
  onTerminalStatusChange?: (status: import('./domain').TerminalStatus) => void;
}

export function createAnzPaymentProvider(opts: AnzProviderOptions): PaymentProvider {
  // Use the module-level logger so log entries persist across provider instances
  const logger = _persistentLogger;

  const sessionManager = new TerminalSessionManager(logger);
  if (opts.onTerminalStatusChange) {
    sessionManager.setStateChangeCallback(opts.onTerminalStatusChange);
  }

  const persistence = opts.simulate
    ? createSimulatorPersistence()
    : createServerPersistence();

  const stateMachine = new PaymentStateMachine({
    sessionManager,
    persistence,
    logger,
    config: opts.config,
  });

  return {
    async initialize(config) {
      await sessionManager.initialize(config);
    },

    async pairTerminal() {
      await sessionManager.pairTerminal();
    },

    async endOfDay() {
      return sessionManager.endOfDay();
    },

    async healthCheck() {
      return sessionManager.healthCheck();
    },

    async getApplicationInformation() {
      return sessionManager.fetchApplicationInformation();
    },

    getTerminalStatus() {
      return sessionManager.getStatus();
    },

    async startPurchase(request) {
      if (!sessionManager.hasAdapter()) {
        await sessionManager.initialize(opts.config);
      }
      return stateMachine.startPurchase({
        posOrderId:      request.posOrderId,
        amount:          request.amount,
        currency:        request.currency,
        referenceId:     request.referenceId,
        onStateChange:   request.onStateChange ? (intent: PaymentIntent) => request.onStateChange!(intent) : undefined,
        onStatusMessage: request.onStatusMessage,
      });
    },

    async cancelCurrentOperation() {
      return stateMachine.cancelCurrentOperation();
    },

    async balance() {
      const adapter = sessionManager.getAdapter();
      return adapter.balance();
    },

    /**
     * Section 3.6: Credit / Refund transaction.
     * Section 1.4: "A Credit/Refund needs a Commit" — handled by state machine.
     */
    async refund(request: RefundRequest) {
      if (!sessionManager.hasAdapter()) {
        await sessionManager.initialize(opts.config);
      }
      return stateMachine.startCredit({
        posOrderId:      request.posOrderId,
        amount:          request.amount,
        currency:        'AUD',
        onStateChange:   request.onStateChange,
        onStatusMessage: request.onStatusMessage,
      });
    },

    /**
     * Section 3.9: Reversal / VOID — voids last terminal transaction.
     * Section 1.4: "A Reversal/Void does not require a Commit".
     */
    async reversal(request: ReversalRequest) {
      if (!sessionManager.hasAdapter()) {
        await sessionManager.initialize(opts.config);
      }
      return stateMachine.startReversal({
        posOrderId:      request.posOrderId,
        amount:          request.amount,
        currency:        'AUD',
        onStateChange:   request.onStateChange,
        onStatusMessage: request.onStatusMessage,
      });
    },

    async shutdown() {
      await sessionManager.gracefulShutdown();
    },
  };
}

// ─── Simulator provider (dev / demo without terminal) ────────────────────────

export interface SimulatorOptions {
  /** Simulated result: 'approved' | 'declined' | 'timeout' | 'error' (default: 'approved') */
  simulateResult?: 'approved' | 'declined' | 'timeout' | 'error';
  /** ms delay before result (default: 3000) */
  delayMs?: number;
}

export function createSimulatorProvider(opts: SimulatorOptions = {}): PaymentProvider {
  const { simulateResult = 'approved', delayMs = 3000 } = opts;

  const noop = async () => {};
  let currentCancel: (() => void) | null = null;

  return {
    initialize: noop,
    pairTerminal: noop,
    endOfDay: async () => ({ simulated: true, currency: 'AUD' }),
    async healthCheck() {
      // 7784 is the ANZ SIXml WebSocket port (validation doc v26-01).
      return { reachable: true, terminalIp: '127.0.0.1', terminalPort: 7784, checkedAt: new Date() };
    },
    async getApplicationInformation() {
      return { terminalModel: 'Worldline Edge (Simulated)', softwareVersion: '1.0.0-sim', supportedBrands: ['VISA','MC','AMEX','EFTPOS'] };
    },
    getTerminalStatus() {
      return { state: 'activated', terminalIp: '127.0.0.1' };
    },
    async startPurchase(request) {
      return new Promise((resolve) => {
        let cancelled = false;
        currentCancel = () => { cancelled = true; };

        setTimeout(async () => {
          currentCancel = null;
          if (cancelled) {
            resolve({
              intentId: 'sim', posOrderId: request.posOrderId,
              approved: false, state: 'cancelled',
            });
            return;
          }

          request.onStatusMessage?.('Tap, Insert or Swipe card…');
          await new Promise((r) => setTimeout(r, 500));
          if (cancelled) { resolve({ intentId: 'sim', posOrderId: request.posOrderId, approved: false, state: 'cancelled' }); return; }

          request.onStatusMessage?.('Authorizing…');
          await new Promise((r) => setTimeout(r, 800));
          if (cancelled) { resolve({ intentId: 'sim', posOrderId: request.posOrderId, approved: false, state: 'cancelled' }); return; }

          if (simulateResult === 'approved') {
            resolve({
              intentId: 'sim', posOrderId: request.posOrderId,
              approved: true, state: 'approved',
              authCode: 'SIM123', transactionRef: `SIM-${Date.now()}`,
              cardLast4: '4242', cardScheme: 'VISA',
            });
          } else if (simulateResult === 'declined') {
            resolve({ intentId: 'sim', posOrderId: request.posOrderId, approved: false, state: 'declined', declineReason: 'Insufficient funds' });
          } else if (simulateResult === 'error') {
            resolve({ intentId: 'sim', posOrderId: request.posOrderId, approved: false, state: 'failed_retryable', errorMessage: 'Simulated terminal error' });
          }
        }, delayMs);
      });
    },
    async cancelCurrentOperation() {
      currentCancel?.();
    },
    async balance() { return { balance: 0, currency: 'AUD' }; },
    /** Simulated refund (credit) — always approved in simulator */
    async refund(request: RefundRequest) {
      await new Promise((r) => setTimeout(r, 1500));
      request.onStatusMessage?.('Tap, Insert or Swipe card for refund…');
      await new Promise((r) => setTimeout(r, 500));
      request.onStatusMessage?.('Authorizing refund…');
      await new Promise((r) => setTimeout(r, 800));
      return {
        intentId: 'sim', posOrderId: request.posOrderId,
        approved: true, state: 'approved' as const,
        authCode: 'SIMRFND', transactionRef: `SIM-REFUND-${Date.now()}`,
      };
    },
    /** Simulated reversal (void) — always approved in simulator */
    async reversal(request: ReversalRequest) {
      await new Promise((r) => setTimeout(r, 1200));
      request.onStatusMessage?.('Voiding last transaction…');
      await new Promise((r) => setTimeout(r, 600));
      return {
        intentId: 'sim', posOrderId: request.posOrderId,
        approved: true, state: 'approved' as const,
        authCode: 'SIMVOID', transactionRef: `SIM-VOID-${Date.now()}`,
      };
    },
    shutdown: noop,
  };
}

// ─── Crash recovery ───────────────────────────────────────────────────────────

export interface UnresolvedPayment {
  id: string;
  posOrderId: string;
  amountCents: number;
  state: PaymentState;
  terminalIp: string;
  terminalLabel?: string;
  createdAt: string;
  stateHistory: Array<{ state: string; at: string; details?: string }>;
}

/**
 * Query the server for any in-flight payment intents that need operator attention.
 * Call this on POS startup / page load.
 */
export async function checkForUnresolvedPayments(): Promise<UnresolvedPayment[]> {
  try {
    const res = await fetch('/api/proxy/eftpos/recovery', { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json() as { data: UnresolvedPayment[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Mark an unresolved payment as reconciled after operator review.
 */
export async function resolvePayment(
  intentId: string,
  resolution: 'approved' | 'declined' | 'cancelled',
  note?: string,
): Promise<void> {
  await fetch(`/api/proxy/eftpos/intents/${intentId}/mark-recovery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution, note }),
    credentials: 'include',
  });
}
