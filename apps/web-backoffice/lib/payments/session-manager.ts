/**
 * TerminalSessionManager
 *
 * Owns the terminal lifecycle independent of individual transactions:
 *  - tracks connection state (disconnected → connecting → logged_in → activated)
 *  - provides a mutex so only one operation runs at a time
 *  - exposes health check / connectivity status to the POS UI
 *  - coordinates with TimApiAdapter initialization
 *
 * TIM pre-automatisms (auto-connect, auto-login, auto-activate before a transaction)
 * are relied on for the happy path, but this manager still tracks state explicitly
 * so the POS can render accurate UX and recover cleanly.
 */

import type { TimConfig, TerminalStatus, TerminalConnectionState, TerminalHealth, TerminalApplicationInfo } from './domain';
import { TimApiAdapter, loadTimApiSdk } from './tim-adapter';
import { PaymentLogger } from './logger';

/**
 * Config equality check for session reuse — returns true when the two
 * configs describe the same logical terminal session (same IP/port/
 * integrator/shift-management flags). Display-only fields like `terminalLabel`
 * are ignored so renaming a saved terminal doesn't force a tear-down.
 */
function sameConfig(a: TimConfig, b: TimConfig): boolean {
  return (
    a.terminalIp?.trim()       === b.terminalIp?.trim() &&
    a.terminalPort             === b.terminalPort       &&
    (a.integratorId ?? '')     === (b.integratorId ?? '') &&
    !!a.autoCommit             === !!b.autoCommit       &&
    !!a.fetchBrands            === !!b.fetchBrands      &&
    !!a.dcc                    === !!b.dcc              &&
    !!a.partialApproval        === !!b.partialApproval  &&
    !!a.tipAllowed             === !!b.tipAllowed       &&
    (a.posId ?? '')            === (b.posId ?? '')      &&
    (a.operatorId ?? '')       === (b.operatorId ?? '')
  );
}

// ─── Mutex ────────────────────────────────────────────────────────────────────

class AsyncMutex {
  private _queue: Array<() => void> = [];
  private _locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this._locked) {
          this._locked = true;
          resolve(() => this._release());
        } else {
          this._queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private _release() {
    const next = this._queue.shift();
    if (next) {
      next();
    } else {
      this._locked = false;
    }
  }

  get isLocked() { return this._locked; }
}

// ─── Session manager ──────────────────────────────────────────────────────────

export class TerminalSessionManager {
  private _config: TimConfig | null = null;
  private _adapter: TimApiAdapter | null = null;
  private _logger: PaymentLogger;
  private _mutex = new AsyncMutex();
  private _connectionState: TerminalConnectionState = 'disconnected';
  private _lastConnectedAt?: Date;
  private _lastErrorMessage?: string;
  private _applicationInfo?: TerminalApplicationInfo;
  private _onStateChange?: (status: TerminalStatus) => void;

  constructor(logger: PaymentLogger) {
    this._logger = logger;
  }

  // ── Configuration ───────────────────────────────────────────────────────────

  getConfig(): TimConfig | null { return this._config; }

  isConfigured(): boolean {
    return !!(
      this._config?.terminalIp?.trim() &&
      this._config?.integratorId?.trim()
    );
  }

  setStateChangeCallback(fn: (s: TerminalStatus) => void) {
    this._onStateChange = fn;
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  async initialize(config: TimConfig): Promise<void> {
    // Reuse existing adapter if the config hasn't changed — keeps the TIM
    // session connected/logged-in/activated between transactions.
    //
    // Per ANZ §1.2/§1.3 the ECR↔terminal session is meant to persist; only
    // end-of-day (§3.10) or graceful shutdown (§3.13) should close it. The
    // WASM state machine can serve multiple transactions from the `open`
    // state without any re-initialisation — the pre-automatisms cover
    // disconnects (e.g. nightly PCI reboot 2AM-5AM) transparently.
    if (this._adapter && this._adapter.isInitialized && this._config &&
        sameConfig(this._config, config)) {
      this._logger.info('session_reuse', {
        terminalIp:   config.terminalIp,
        terminalPort: config.terminalPort,
      });
      return;
    }

    // Config changed (different IP/port/integrator) — tear down the stale
    // adapter before initialising the new one.
    if (this._adapter) {
      this._adapter.dispose();
      this._adapter = null;
    }

    this._config = config;
    this._setConnectionState('connecting');
    this._logger.info('session_init', {
      terminalIp:   config.terminalIp,
      terminalPort: config.terminalPort,
      autoCommit:   config.autoCommit,
    });

    const adapter = new TimApiAdapter(this._logger);

    // Section 1.3: Handle unexpected terminal disconnects (nightly PCI reboot 2AM-5AM).
    // Mark state as disconnected so the POS UI reflects the real status.
    // The SDK pre-automatisms will auto-reconnect on the next transactionAsync() call.
    adapter.onDisconnect = () => {
      this._setConnectionState('disconnected');
      this._logger.warn('session_terminal_disconnected', {
        note: 'Terminal may be rebooting for PCI maintenance. Will auto-reconnect on next transaction via SDK pre-automatisms.',
      });
    };

    await adapter.initialize(config);
    this._adapter = adapter;

    // Explicit Connect → Login → Activate.
    //
    // The TIM SDK offers "pre-automatism" shortcuts that let you fire a
    // transactionAsync() in a disconnected state and have the SDK wrap Connect
    // + Login + Activate around it transparently. That pattern works cleanly
    // against the ANZ EftSimulator but fails against real Castles S1F2
    // firmware — the terminal ignores the FeatureRequest the pre-automatisms
    // prepend to Login, and the SDK state machine stalls at
    // sms_sl_login_request_features. The ANZ-supplied simple ECR example works
    // against the same hardware by calling the three lifecycle steps
    // explicitly. We mirror that here so the very first transaction on a
    // freshly-initialised session has a fully-paired terminal ready to serve.
    try {
      if (typeof adapter.connect === 'function') {
        await adapter.connect(15_000);
      }
      await adapter.login(30_000);
      await adapter.activate(30_000);
      this._setConnectionState('activated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastErrorMessage = msg;
      this._logger.error('session_pair_failed', { error: msg });
      this._setConnectionState('error');
      throw err;
    }

    this._lastConnectedAt = new Date();
    this._logger.info('session_ready', {});
  }

  // ── Accessors ───────────────────────────────────────────────────────────────

  getAdapter(): TimApiAdapter {
    if (!this._adapter) throw new Error('Terminal session not initialized');
    return this._adapter;
  }

  hasAdapter(): boolean { return this._adapter !== null && this._adapter.isInitialized; }

  getStatus(): TerminalStatus {
    return {
      state:            this._connectionState,
      terminalIp:       this._config?.terminalIp     ?? '',
      terminalLabel:    this._config?.terminalLabel,
      lastConnectedAt:  this._lastConnectedAt,
      lastErrorMessage: this._lastErrorMessage,
      softwareVersion:  this._applicationInfo?.softwareVersion,
      terminalModel:    this._applicationInfo?.terminalModel,
      supportedBrands:  this._applicationInfo?.supportedBrands,
    };
  }

  // ── Mutex (one operation at a time per terminal) ────────────────────────────

  async acquireLock(): Promise<() => void> {
    return this._mutex.acquire();
  }

  get isBusy(): boolean { return this._mutex.isLocked; }

  // ── Health check ────────────────────────────────────────────────────────────

  async healthCheck(): Promise<TerminalHealth> {
    if (!this._config) {
      // 7784 is the ANZ SIXml WebSocket port (validation doc v26-01).
      // Only used as a placeholder when no config is present.
      return { reachable: false, terminalIp: '', terminalPort: 7784, checkedAt: new Date(), error: 'Not configured' };
    }

    const start = Date.now();
    try {
      // Verify SDK is loadable
      await loadTimApiSdk();

      // If we have an initialized adapter, query application information
      if (this._adapter?.isInitialized) {
        try {
          const info = await Promise.race([
            this._adapter.getApplicationInformation(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8_000)),
          ]);
          this._applicationInfo = info as TerminalApplicationInfo;
          this._setConnectionState('activated');
          return {
            reachable:       true,
            terminalIp:      this._config.terminalIp,
            terminalPort:    this._config.terminalPort,
            latencyMs:       Date.now() - start,
            checkedAt:       new Date(),
            applicationInfo: info as TerminalApplicationInfo,
          };
        } catch {
          // App info failed but terminal might still work
        }
      }

      return {
        reachable:    true,
        terminalIp:   this._config.terminalIp,
        terminalPort: this._config.terminalPort,
        latencyMs:    Date.now() - start,
        checkedAt:    new Date(),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this._lastErrorMessage = error;
      this._setConnectionState('error');
      return {
        reachable:    false,
        terminalIp:   this._config.terminalIp,
        terminalPort: this._config.terminalPort,
        latencyMs:    Date.now() - start,
        checkedAt:    new Date(),
        error,
      };
    }
  }

  // ── Application information ─────────────────────────────────────────────────

  async fetchApplicationInformation(): Promise<TerminalApplicationInfo> {
    const info = await this.getAdapter().getApplicationInformation();
    this._applicationInfo = info;
    return info;
  }

  // ── State ───────────────────────────────────────────────────────────────────

  markBusy()    { this._setConnectionState('busy'); }
  markActivated() { this._setConnectionState('activated'); }
  markError(msg: string) {
    this._lastErrorMessage = msg;
    this._setConnectionState('error');
  }

  private _setConnectionState(state: TerminalConnectionState) {
    if (this._connectionState === state) return;
    this._connectionState = state;
    this._logger.debug('terminal_state_changed', { state });
    this._onStateChange?.(this.getStatus());
  }

  // ── Terminal lifecycle (ANZ Validation Section 3) ──────────────────────────

  /**
   * Pairing — Connect → Login → Activate
   * Per ANZ Validation Section 3.1: "Ideally the terminal should pair with the
   * terminal prior to performing any transactions as the pairing can take up to
   * 10 seconds, and only needs to be done once after a terminal restarts."
   *
   * The SDK pre-automatisms cover this automatically during transactionAsync(),
   * but explicit pairing up-front avoids any delay on the first transaction.
   */
  async pairTerminal(): Promise<void> {
    if (!this._config) throw new Error('Terminal not configured — call initialize() first');

    if (!this._adapter?.isInitialized) {
      await this.initialize(this._config);
    }

    const adapter = this._adapter!;
    this._setConnectionState('logging_in');
    this._logger.info('pair_terminal_start', {});

    try {
      // Login: activates the communication session, fetches brands
      await adapter.login();
      this._logger.info('pair_terminal_logged_in', {});

      // Activate: opens the user shift
      await adapter.activate();
      this._setConnectionState('activated');
      this._lastConnectedAt = new Date();
      this._logger.info('pair_terminal_activated', {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastErrorMessage = msg;
      this._setConnectionState('error');
      this._logger.error('pair_terminal_failed', { error: msg });
      throw err;
    }
  }

  /**
   * Deactivate — closes the user shift and delivers transaction counters.
   * Per Section 3.10: "Before calling the balance function, POS/ECR should
   * be in the deactivate state."
   */
  async deactivate(): Promise<unknown> {
    if (!this._adapter?.isInitialized) return undefined;

    this._logger.info('session_deactivate_start', {});
    try {
      const result = await this._adapter.deactivate();
      this._setConnectionState('connected');
      this._logger.info('session_deactivated', {});
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._logger.warn('session_deactivate_failed', { error: msg });
      // Non-fatal — proceed with balance even if deactivate failed
      return undefined;
    }
  }

  /**
   * End of Day (Daily Closing) — Deactivate → Balance
   * Per Section 3.10: Balance transmits all transactions to the host for
   * settlement and resets counters. Settlement cutover is 21:30 each day.
   * Balance may be called multiple times during the day.
   */
  async endOfDay(): Promise<Record<string, unknown>> {
    if (!this._adapter?.isInitialized) {
      throw new Error('Terminal not connected — connect first before running end of day');
    }

    this._logger.info('end_of_day_start', {});

    // Step 1: Deactivate (closes shift, required before balance)
    await this.deactivate();

    // Step 2: Balance (daily closing — sends all transactions to host)
    const result = await this._adapter.balance();
    this._logger.info('end_of_day_complete', {});
    return result;
  }

  /**
   * Graceful shutdown — Deactivate → Logout → Disconnect → Dispose
   * Per Section 3.13: "In order to close the POS/ECR, ensure the TIM API
   * instance is disposed of correctly and memory is released to the OS."
   */
  async gracefulShutdown(): Promise<void> {
    if (!this._adapter) {
      this._setConnectionState('disconnected');
      return;
    }

    this._logger.info('graceful_shutdown_start', {});
    const adapter = this._adapter;

    try {
      // Step 1: Deactivate (close user shift)
      try { await adapter.deactivate(15_000); } catch { /* non-fatal */ }

      // Step 2: Logout (terminate ECR-terminal session)
      try { await adapter.logout(15_000); } catch { /* non-fatal */ }

      // Step 3: Disconnect (close TCP/WebSocket connection)
      try { await adapter.disconnect(10_000); } catch { /* non-fatal */ }
    } finally {
      // Step 4: Dispose (release WASM memory)
      adapter.dispose();
      this._adapter = null;
      this._setConnectionState('disconnected');
      this._logger.info('graceful_shutdown_complete', {});
    }
  }

  // ── Teardown ────────────────────────────────────────────────────────────────

  dispose() {
    this._adapter?.dispose();
    this._adapter = null;
    this._setConnectionState('disconnected');
    this._logger.info('session_disposed', {});
  }
}
