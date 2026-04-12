/**
 * PaymentStateMachine
 *
 * Governs all 15 payment states with idempotent transitions.
 * Every transition is persisted to the server so that if the browser
 * crashes between authorization and commit, the unknown_outcome is
 * surfaced to the operator on next load.
 *
 * Rules:
 *  - Only one active transaction at a time per machine instance.
 *  - autoCommit=false: after approval, machine waits in approved_pending_commit
 *    until commitAsync() is confirmed before moving to approved.
 *  - Cancel during commit is blocked (CANCEL_BLOCKED error).
 *  - Any error after authorization that prevents commit moves to unknown_outcome.
 *  - unknown_outcome is NEVER auto-retried.
 */

import type {
  PaymentState,
  PaymentIntent,
  StateHistoryEntry,
  PaymentResult,
  PaymentLogEntry,
  TimConfig,
} from './domain';
import {
  TERMINAL_STATES,
  CANCELLABLE_STATES,
  CANCEL_BLOCKED_STATES,
} from './domain';
import { TerminalSessionManager } from './session-manager';
import { PaymentLogger } from './logger';
import { PaymentProviderError } from './provider';
import type { AdapterTransactionResult } from './tim-adapter';

// ─── Persistence interface ────────────────────────────────────────────────────
// The state machine calls these after every transition. The implementation
// (see lib/payments/index.ts) posts to /api/proxy/eftpos/intents.

export interface PaymentPersistence {
  createIntent(intent: Omit<PaymentIntent, 'id'>): Promise<string>;
  updateState(intentId: string, state: PaymentState, details?: string, result?: Partial<PaymentResult>): Promise<void>;
  appendSupportLog(intentId: string, entries: PaymentLogEntry[]): Promise<void>;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface StateMachineOptions {
  sessionManager: TerminalSessionManager;
  persistence: PaymentPersistence;
  logger: PaymentLogger;
  config: TimConfig;
  /** ms to wait for terminal response before marking unknown_outcome (default: 120_000) */
  transactionTimeoutMs?: number;
  /** ms to wait for commit response before marking failed_terminal (default: 30_000) */
  commitTimeoutMs?: number;
}

export interface StartPurchaseOptions {
  posOrderId:   string;
  amount:       number;
  currency?:    string;
  referenceId?: string;
  onStateChange?: (intent: PaymentIntent) => void;
  onStatusMessage?: (msg: string) => void;
}

// ─── Machine ──────────────────────────────────────────────────────────────────

export class PaymentStateMachine {
  private _opts: Required<StateMachineOptions>;
  private _intent: PaymentIntent | null = null;
  private _cancelRequested = false;

  constructor(opts: StateMachineOptions) {
    this._opts = {
      transactionTimeoutMs: 120_000,
      commitTimeoutMs:      30_000,
      ...opts,
    };
  }

  get currentIntent(): PaymentIntent | null { return this._intent; }
  get isIdle(): boolean { return this._intent === null || TERMINAL_STATES.includes(this._intent.state); }

  // ── Start purchase ──────────────────────────────────────────────────────────

  async startPurchase(opts: StartPurchaseOptions): Promise<PaymentResult> {
    if (!this.isIdle) {
      throw new PaymentProviderError('INVALID_STATE', 'A transaction is already in progress');
    }

    const { sessionManager, persistence, logger, config } = this._opts;

    this._cancelRequested = false;

    // --- Phase 1: Create intent on server ---
    await this._transition(opts.posOrderId, opts.amount, opts.currency ?? 'AUD', opts.onStateChange);

    opts.onStatusMessage?.('Loading terminal SDK…');
    await this._setState('initializing_terminal', 'Loading TIM API SDK', opts.onStateChange);

    // --- Phase 2: Ensure adapter is initialized ---
    if (!sessionManager.hasAdapter()) {
      await sessionManager.initialize(config);
    }
    const adapter = sessionManager.getAdapter();
    await this._setState('awaiting_terminal_ready', 'Connecting to terminal…', opts.onStateChange);

    // --- Phase 3: Acquire terminal lock ---
    const releaseLock = await sessionManager.acquireLock();
    sessionManager.markBusy();

    try {
      await this._setState('sent_to_terminal', 'Presenting transaction…', opts.onStateChange);
      opts.onStatusMessage?.('Presenting transaction…');

      // --- Phase 4: Send to terminal with timeout ---
      const amountCents = Math.round(opts.amount * 100);
      let txResult: AdapterTransactionResult;

      const txPromise = adapter.purchase(amountCents, opts.referenceId, (msg) => {
        opts.onStatusMessage?.(msg);
        if (msg.toLowerCase().includes('card')) {
          void this._setState('awaiting_cardholder', msg, opts.onStateChange);
        } else if (msg.toLowerCase().includes('process') || msg.toLowerCase().includes('authoriz')) {
          void this._setState('authorizing', msg, opts.onStateChange);
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Transaction timed out — no response from terminal')), this._opts.transactionTimeoutMs)
      );

      try {
        txResult = await Promise.race([txPromise, timeoutPromise]);
      } catch (err) {
        // If cancel was requested and we got an error, it's the cancel response
        if (this._cancelRequested) {
          await this._setState('cancelled', 'Transaction cancelled', opts.onStateChange);
          return this._buildResult(false, { state: 'cancelled' });
        }
        // Timeout or pre-auth error — safe to mark as failed_retryable
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('transaction_error', { error: msg });
        await this._setState('failed_retryable', msg, opts.onStateChange);
        return this._buildResult(false, { state: 'failed_retryable', errorMessage: msg });
      }

      if (!txResult.approved) {
        await this._setState('declined', txResult.declineReason ?? 'Declined', opts.onStateChange);
        return this._buildResult(false, {
          state: 'declined',
          resultCode: txResult.resultCode,
          declineReason: txResult.declineReason,
        });
      }

      // --- Phase 5: Handle approved ---
      if (config.autoCommit) {
        // autoCommit=true: terminal commits automatically, we just record it
        await this._setState('approved', 'Payment approved', opts.onStateChange);
        await this._recordResult(txResult);
        return this._buildResult(true, { state: 'approved', txResult });
      }

      // autoCommit=false: must explicitly commit
      await this._setState('approved_pending_commit', 'Finalizing payment…', opts.onStateChange);
      opts.onStatusMessage?.('Finalizing payment…');

      // Store transaction data so if we crash, recovery can use it
      if (this._intent) {
        this._intent = {
          ...this._intent,
          timCorrelationId: txResult.transactionRef,
        };
      }

      // --- Phase 6: Commit ---
      let commitResult: Awaited<ReturnType<typeof adapter.commit>>;
      const commitPromise = adapter.commit();
      const commitTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Commit timed out — payment state unknown')), this._opts.commitTimeoutMs)
      );

      try {
        commitResult = await Promise.race([commitPromise, commitTimeout]);
      } catch (err) {
        // Commit timeout or error — move to failed_terminal
        // DO NOT move to unknown_outcome yet; commit may have succeeded on terminal side
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('commit_error', { error: msg });
        await this._setState('failed_terminal', msg, opts.onStateChange);
        return this._buildResult(false, {
          state:        'failed_terminal',
          errorMessage: `Commit failed: ${msg}. Operator review required.`,
          txResult,
        });
      }

      if (!commitResult.success) {
        await this._setState('failed_terminal', commitResult.errorMessage ?? 'Commit failed', opts.onStateChange);
        return this._buildResult(false, {
          state: 'failed_terminal',
          errorMessage: `Commit failed (${commitResult.resultCode}). Operator review required.`,
          txResult,
        });
      }

      await this._setState('approved', 'Payment complete', opts.onStateChange);
      await this._recordResult(txResult);
      return this._buildResult(true, { state: 'approved', txResult });

    } catch (err) {
      // Unexpected error after we may have reached authorization — unknown_outcome
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('unexpected_error', { error: msg, state: this._intent?.state });

      const currentState = this._intent?.state ?? 'created';
      const postAuthStates: PaymentState[] = ['authorizing', 'approved_pending_commit'];
      const finalState: PaymentState = postAuthStates.includes(currentState) ? 'unknown_outcome' : 'failed_retryable';

      await this._setState(finalState, msg, opts.onStateChange);
      return this._buildResult(false, { state: finalState, errorMessage: msg });
    } finally {
      releaseLock();
      sessionManager.markActivated();
    }
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────

  async cancelCurrentOperation(onStateChange?: (intent: PaymentIntent) => void): Promise<void> {
    if (!this._intent) return;

    const state = this._intent.state;

    if (CANCEL_BLOCKED_STATES.includes(state)) {
      throw new PaymentProviderError('CANCEL_BLOCKED', 'Cannot cancel during commit — please wait for the transaction to finalize');
    }

    if (!CANCELLABLE_STATES.includes(state)) {
      return; // Nothing to cancel
    }

    this._cancelRequested = true;
    await this._setState('cancel_requested', 'Cancel requested', onStateChange);

    // Tell the adapter to abort
    try {
      this._opts.sessionManager.getAdapter().cancel();
    } catch {
      // Adapter might not be initialized yet
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async _transition(
    posOrderId: string,
    amount: number,
    currency: string,
    onStateChange?: (i: PaymentIntent) => void,
  ): Promise<void> {
    const now = Date.now();
    const historyEntry: StateHistoryEntry = {
      state: 'created',
      at:    new Date(now).toISOString(),
    };

    const partial: Omit<PaymentIntent, 'id'> = {
      posOrderId,
      amount,
      currency,
      state:        'created',
      stateHistory: [historyEntry],
      terminalIp:   this._opts.config.terminalIp,
      terminalPort: this._opts.config.terminalPort,
      terminalLabel: this._opts.config.terminalLabel,
      createdAt:    now,
      updatedAt:    now,
    };

    const id = await this._opts.persistence.createIntent(partial);

    this._intent = { ...partial, id };
    this._opts.logger.setIntentId(id);
    onStateChange?.(this._intent);
  }

  private async _setState(
    state: PaymentState,
    details?: string,
    onStateChange?: (i: PaymentIntent) => void,
  ): Promise<void> {
    if (!this._intent) return;
    if (this._intent.state === state) return; // idempotent

    const entry: StateHistoryEntry = {
      state,
      at: new Date().toISOString(),
      details,
    };

    this._intent = {
      ...this._intent,
      state,
      stateHistory: [...this._intent.stateHistory, entry],
      updatedAt:    Date.now(),
    };

    this._opts.logger.info('state_transition', { from: entry.state, to: state, details });

    try {
      await this._opts.persistence.updateState(this._intent.id, state, details);
    } catch {
      // Non-fatal — payment flow continues even if persistence fails
      this._opts.logger.warn('persistence_update_failed', { state });
    }

    onStateChange?.(this._intent);
  }

  private async _recordResult(txResult: AdapterTransactionResult): Promise<void> {
    if (!this._intent) return;
    try {
      await this._opts.persistence.updateState(this._intent.id, 'approved', undefined, {
        intentId:       this._intent.id,
        posOrderId:     this._intent.posOrderId,
        approved:       true,
        state:          'approved',
        authCode:       txResult.authCode,
        transactionRef: txResult.transactionRef,
        cardLast4:      txResult.cardLast4,
        cardScheme:     txResult.cardScheme,
        rrn:            txResult.rrn,
        stan:           txResult.stan,
        merchantReceipt: txResult.merchantReceipt,
        customerReceipt: txResult.customerReceipt,
      });
    } catch {
      this._opts.logger.warn('result_record_failed', {});
    }
  }

  private _buildResult(
    approved: boolean,
    opts: {
      state:          PaymentState;
      txResult?:      AdapterTransactionResult;
      resultCode?:    string;
      declineReason?: string;
      errorMessage?:  string;
    },
  ): PaymentResult {
    return {
      intentId:        this._intent?.id ?? '',
      posOrderId:      this._intent?.posOrderId ?? '',
      approved,
      state:           opts.state,
      authCode:        opts.txResult?.authCode,
      transactionRef:  opts.txResult?.transactionRef,
      cardLast4:       opts.txResult?.cardLast4,
      cardScheme:      opts.txResult?.cardScheme,
      rrn:             opts.txResult?.rrn,
      stan:            opts.txResult?.stan,
      merchantReceipt: opts.txResult?.merchantReceipt,
      customerReceipt: opts.txResult?.customerReceipt,
      resultCode:      opts.resultCode ?? opts.txResult?.resultCode,
      declineReason:   opts.declineReason ?? opts.txResult?.declineReason,
      errorMessage:    opts.errorMessage,
    };
  }
}
