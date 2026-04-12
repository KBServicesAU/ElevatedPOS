/**
 * PaymentProvider interface
 *
 * The POS never directly calls TIM API — it only talks to this interface.
 * This allows the adapter to be swapped (e.g. Tyro, Stripe Terminal)
 * without touching POS business logic.
 */

import type {
  TimConfig,
  PaymentIntent,
  PaymentResult,
  TerminalHealth,
  TerminalApplicationInfo,
  TerminalStatus,
} from './domain';

// ─── Request types ────────────────────────────────────────────────────────────

export interface StartPurchaseRequest {
  posOrderId: string;
  /** Amount in dollars */
  amount: number;
  currency?: string;
  referenceId?: string;
  onStateChange?: (state: PaymentIntent) => void;
  onStatusMessage?: (msg: string) => void;
}

export interface RefundRequest {
  intentId: string;
  posOrderId: string;
  amount: number;
  originalTransactionRef: string;
  reason?: string;
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface PaymentProvider {
  /**
   * Initialise the provider with terminal configuration.
   * Must be called before any terminal operations.
   */
  initialize(config: TimConfig): Promise<void>;

  /**
   * Check whether the terminal is reachable and the SDK is loaded.
   * Does NOT perform a financial operation.
   */
  healthCheck(): Promise<TerminalHealth>;

  /**
   * Query terminal for application / brand / version information.
   * Used for diagnostics and certification logging.
   */
  getApplicationInformation(): Promise<TerminalApplicationInfo>;

  /** Get current terminal connection state. */
  getTerminalStatus(): TerminalStatus;

  /**
   * Start a purchase transaction.
   * Returns a PaymentResult once the terminal flow is complete (approved/declined/error).
   *
   * With autoCommit=false, the provider automatically calls commitAsync() after
   * approval and returns only after commit is confirmed.
   */
  startPurchase(request: StartPurchaseRequest): Promise<PaymentResult>;

  /**
   * Cancel the currently in-progress terminal operation.
   * No-op if there is no in-progress operation or the current state does not allow cancel
   * (e.g. during commit — in that case throws PaymentProviderError with code CANCEL_BLOCKED).
   */
  cancelCurrentOperation(): Promise<void>;

  /**
   * Request balance / settlement summary (admin-only).
   * Returns raw terminal response for display.
   */
  balance(): Promise<Record<string, unknown>>;

  /**
   * Process a refund (behind feature flag — only if enabled in config).
   * Placeholder implementation until merchant facility is confirmed.
   */
  refund(request: RefundRequest): Promise<PaymentResult>;

  /**
   * Gracefully disconnect the terminal and clean up resources.
   */
  shutdown(): Promise<void>;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type PaymentProviderErrorCode =
  | 'NOT_INITIALIZED'
  | 'SDK_NOT_LOADED'
  | 'TERMINAL_UNREACHABLE'
  | 'TERMINAL_BUSY'
  | 'CANCEL_BLOCKED'
  | 'COMMIT_FAILED'
  | 'UNKNOWN_OUTCOME'
  | 'REFUND_DISABLED'
  | 'INVALID_STATE'
  | 'CONFIGURATION_ERROR';

export class PaymentProviderError extends Error {
  constructor(
    public readonly code: PaymentProviderErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}
