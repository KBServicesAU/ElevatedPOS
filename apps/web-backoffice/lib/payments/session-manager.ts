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
    // Dispose any previous adapter
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
    await adapter.initialize(config);
    this._adapter = adapter;

    // TIM pre-automatisms handle connect/login/activate before each transaction,
    // so we mark state as 'connected' here — the adapter is ready to accept requests.
    this._setConnectionState('connected');
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
      return { reachable: false, terminalIp: '', terminalPort: 80, checkedAt: new Date(), error: 'Not configured' };
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

  // ── Teardown ────────────────────────────────────────────────────────────────

  dispose() {
    this._adapter?.dispose();
    this._adapter = null;
    this._setConnectionState('disconnected');
    this._logger.info('session_disposed', {});
  }
}
