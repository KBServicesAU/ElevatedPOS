/**
 * ANZ Worldline TIM API — Payment domain model
 *
 * All types used across the browser-side payment integration.
 * The browser owns the terminal connection (local network via timapi.js WebSocket)
 * and reports state transitions to the server for persistence / crash recovery.
 */

// ─── Terminal Configuration ───────────────────────────────────────────────────

export interface TimConfig {
  /** IPv4 address of the terminal on the LAN, e.g. "192.168.1.100" */
  terminalIp: string;
  /** WebSocket port — ANZ TIM API default is 80 */
  terminalPort: number;
  /** Integrator ID issued by ANZ Worldline to ElevatedPOS */
  integratorId: string;
  /** POS identifier sent to terminal (e.g. "POS-01") */
  posId?: string;
  /** Operator identifier (optional, sent via EcrInfo) */
  operatorId?: string;
  /** Human-readable terminal label for UI and logs */
  terminalLabel?: string;
  /**
   * When false (recommended), POS must call commitAsync() after approval.
   * Prevents duplicate charges if POS crashes between auth and commit.
   */
  autoCommit: boolean;
  /** Print merchant receipt on terminal — default false (POS prints) */
  printMerchantReceipt: boolean;
  /** Print customer receipt on terminal — default false (POS prints) */
  printCustomerReceipt: boolean;
}

// ─── Terminal Connection State ────────────────────────────────────────────────

export type TerminalConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'logging_in'
  | 'logged_in'
  | 'activating'
  | 'activated'        // Ready for transactions
  | 'busy'             // Transaction in progress
  | 'error';

export interface TerminalStatus {
  state: TerminalConnectionState;
  terminalIp: string;
  terminalLabel?: string;
  lastConnectedAt?: Date;
  lastErrorMessage?: string;
  softwareVersion?: string;
  terminalModel?: string;
  supportedBrands?: string[];
}

// ─── Payment States ───────────────────────────────────────────────────────────

/**
 * Complete state machine for a single EFTPOS payment attempt.
 * States are persisted to the server on every transition for crash recovery.
 */
export type PaymentState =
  | 'created'                // Payment intent created; terminal not yet contacted
  | 'initializing_terminal'  // Loading SDK + creating adapter
  | 'awaiting_terminal_ready'// Adapter initialized; waiting for terminal login/activate
  | 'sent_to_terminal'       // transactionAsync() called; terminal acknowledged
  | 'awaiting_cardholder'    // Terminal is prompting customer to present card
  | 'authorizing'            // Card presented; awaiting bank auth
  | 'approved_pending_commit'// Bank approved; waiting for commitAsync() (autoCommit=false)
  | 'approved'               // Payment finalized (commit complete or autoCommit=true)
  | 'declined'               // Bank declined
  | 'cancel_requested'       // Operator pressed Cancel; awaiting terminal response
  | 'cancelled'              // Cancellation confirmed by terminal
  | 'failed_retryable'       // Pre-auth error (network, config); safe to retry
  | 'failed_terminal'        // Terminal-side error; may or may not be safe to retry
  | 'unknown_outcome'        // Terminal authorized but POS lost state — DO NOT retry
  | 'recovery_required';     // Manual operator/admin reconciliation needed

/** States where the payment is definitively finished */
export const TERMINAL_STATES: PaymentState[] = [
  'approved', 'declined', 'cancelled', 'failed_retryable', 'failed_terminal',
];

/** States where a retry is safe */
export const RETRYABLE_STATES: PaymentState[] = ['failed_retryable'];

/** States where cancellation is allowed */
export const CANCELLABLE_STATES: PaymentState[] = [
  'sent_to_terminal', 'awaiting_cardholder', 'cancel_requested',
];

/** States where cancellation is BLOCKED (e.g. commit in progress) */
export const CANCEL_BLOCKED_STATES: PaymentState[] = ['approved_pending_commit', 'authorizing'];

// ─── Payment Intent ───────────────────────────────────────────────────────────

export interface StateHistoryEntry {
  state: PaymentState;
  at: string; // ISO timestamp
  details?: string;
}

export interface PaymentIntent {
  /** Server-assigned UUID — used for persistence and recovery */
  id: string;
  /** POS sale / order reference */
  posOrderId: string;
  /** Amount in dollars */
  amount: number;
  currency: string;
  state: PaymentState;
  stateHistory: StateHistoryEntry[];
  terminalIp: string;
  terminalPort: number;
  terminalLabel?: string;
  /** TIM API correlation / transaction reference */
  timCorrelationId?: string;
  /** Unix timestamp (ms) */
  createdAt: number;
  updatedAt: number;
}

// ─── Payment Result ───────────────────────────────────────────────────────────

export type PaymentErrorCategory =
  | 'configuration'
  | 'network'
  | 'terminal_busy'
  | 'operator_cancel'
  | 'customer_cancel'
  | 'customer_decline'
  | 'commit_failure'
  | 'unknown_outcome'
  | 'unsupported_operation'
  | 'provisioning';

export interface PaymentResult {
  intentId: string;
  posOrderId: string;
  approved: boolean;
  state: PaymentState;
  // Card details (masked only)
  authCode?: string;
  transactionRef?: string;
  cardLast4?: string;
  cardScheme?: string;
  rrn?: string;
  stan?: string;
  // Receipts
  merchantReceipt?: string;
  customerReceipt?: string;
  // Decline / error
  resultCode?: string;
  declineReason?: string;
  errorCategory?: PaymentErrorCategory;
  errorMessage?: string;
  // Diagnostics
  terminalSoftwareVersion?: string;
}

// ─── Structured Support Log ───────────────────────────────────────────────────

export type PaymentLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface PaymentLogEntry {
  at: string;        // ISO timestamp
  level: PaymentLogLevel;
  event: string;     // e.g. 'connect_attempt', 'transaction_completed'
  details?: Record<string, unknown>;
}

// ─── Application Information ──────────────────────────────────────────────────

export interface TerminalApplicationInfo {
  posId?: string;
  terminalModel?: string;
  softwareVersion?: string;
  supportedBrands?: string[];
  merchantId?: string;
  terminalId?: string;
  activationState?: string;
}

// ─── Terminal Health ──────────────────────────────────────────────────────────

export interface TerminalHealth {
  reachable: boolean;
  terminalIp: string;
  terminalPort: number;
  latencyMs?: number;
  checkedAt: Date;
  applicationInfo?: TerminalApplicationInfo;
  error?: string;
}
