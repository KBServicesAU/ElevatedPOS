/**
 * TimApiAdapter — the ONLY module that directly uses the ANZ TIM API SDK.
 *
 * Implements the mandatory TIM API initialization sequence:
 *   1. create TerminalSettings (IP, port, autoCommit, integratorId)
 *   2. create Terminal instance
 *   3. set POS ID
 *   4. create EcrInfo and add it (mandatory metadata)
 *   5. configure PrintOptions
 *   6. register event listeners
 *   7. connect / login / activate via TIM pre-automatisms or manual calls
 *   8. call terminal operations
 *
 * The adapter translates raw SDK events into internal PaymentLogEntry domain
 * events — no UI or business logic lives here.
 *
 * ─── SDK setup ────────────────────────────────────────────────────────────────
 * Place timapi.js + timapi.wasm in /public/timapi/ before this adapter can run.
 * Obtain from: https://start.portal.anzworldline-solutions.com.au/
 */

import type { TimConfig, TerminalApplicationInfo } from './domain';
import type { PaymentLogger } from './logger';

// ─── TIM API TypeScript declarations ─────────────────────────────────────────
// These cover the full known surface of the TIM API JS SDK.
// Adjust method names / property access when actual SDK is received.

declare global {
  interface Window {
    onTimApiReady?: () => void;
    timapi?: TimApiNamespace;
  }
}

interface TimApiNamespace {
  TerminalSettings: new () => TimApiTerminalSettings;
  Terminal:         new (settings: TimApiTerminalSettings) => TimApiTerminal;
  Amount:           new (amountCents: number, currency: string) => TimApiAmount;
  EcrInfo:          new () => TimApiEcrInfo;
  PrintOptions:     new () => TimApiPrintOptions;
  constants: {
    TransactionType: {
      purchase:  string;
      refund:    string;
      reversal:  string;
    };
    Currency: { AUD: string };
    TerminalStatus: Record<string, string>;
    PrintMode: Record<string, string>;
  };
}

interface TimApiTerminalSettings {
  connectionIPString: string;
  connectionIPPort:   number;
  autoCommit:         boolean;
  integratorId:       string;
}

interface TimApiEcrInfo {
  /** POS station identifier */
  posId?: string;
  /** Operator/cashier identifier */
  operatorId?: string;
  /** Current shift number */
  shiftNumber?: number;
  // Some SDK versions use setters instead of properties:
  setPosId?(id: string): void;
  setOperatorId?(id: string): void;
  setShiftNumber?(n: number): void;
}

interface TimApiPrintOptions {
  merchantReceiptEnabled?:  boolean;
  customerReceiptEnabled?:  boolean;
  printerMode?:             string;
  setMerchantReceiptEnabled?(v: boolean): void;
  setCustomerReceiptEnabled?(v: boolean): void;
  setPrinterMode?(mode: string): void;
}

export interface TimApiTerminal {
  setPosId(id: string): void;
  /** Add mandatory ECR metadata (POS ID, operator, shift) */
  addEcrData(ecrInfo: TimApiEcrInfo): void;
  /** Alternatively named in some SDK versions */
  setEcrInfo?(ecrInfo: TimApiEcrInfo): void;
  /** Configure receipt printing behaviour */
  setPrintOptions(options: TimApiPrintOptions): void;
  /** Alternatively named */
  addPrintOptions?(options: TimApiPrintOptions): void;
  addListener(listener: TimApiListener): void;
  removeListener(listener: TimApiListener): void;
  /** Initiate purchase / refund */
  transactionAsync(type: string, amount: TimApiAmount, referenceId?: string): void;
  /** Finalise an approved transaction (required when autoCommit=false) */
  commitAsync(): void;
  /** Abort an in-flight operation (not allowed during commit/rollback) */
  cancelAsync(): void;
  /** Manual connect (TIM pre-automatisms do this automatically) */
  connectAsync?(): void;
  /** Manual login */
  loginAsync?(): void;
  /** Manual activate/open shift */
  activateAsync?(): void;
  /** Query terminal application / brand information */
  applicationInformationAsync?(): void;
  /** Query hardware information */
  hardwareInformationAsync?(): void;
  /** Request settlement / balance */
  balanceAsync?(): void;
}

interface TimApiAmount {}

// ─── Listener event shapes ────────────────────────────────────────────────────

export interface TimTransactionEvent {
  exception?: { resultCode: string; message?: string; category?: string };
}

export interface TimTransactionData {
  transactionReference?: string;
  authorisationCode?:    string;
  maskedPan?:            string;
  cardType?:             string;
  merchantReceiptText?:  string;
  customerReceiptText?:  string;
  receiptText?:          string;
  rrn?:                  string;
  stan?:                 string;
  amount?:               number;
}

export interface TimConnectionEvent {
  data?: { state?: string; message?: string };
}

export interface TimDisplayEvent {
  data?: { text?: string };
}

export interface TimApplicationInfoData {
  posId?:              string;
  terminalModel?:      string;
  softwareVersion?:    string;
  supportedBrands?:    string[];
  merchantId?:         string;
  terminalId?:         string;
  activationState?:    string;
}

interface TimApiListener {
  transactionCompleted(event: TimTransactionEvent, data: TimTransactionData): void;
  commitCompleted?(event: TimTransactionEvent, data: TimTransactionData): void;
  connectionStateChanged?(event: TimConnectionEvent, data: unknown): void;
  displayTextChanged?(event: TimDisplayEvent, data: unknown): void;
  receiptGenerated?(event: unknown, data: unknown): void;
  loginCompleted?(event: TimTransactionEvent, data: unknown): void;
  activateCompleted?(event: TimTransactionEvent, data: unknown): void;
  applicationInformationCompleted?(event: TimTransactionEvent, data: TimApplicationInfoData): void;
  hardwareInformationCompleted?(event: unknown, data: unknown): void;
  balanceCompleted?(event: TimTransactionEvent, data: unknown): void;
}

// ─── SDK loader ───────────────────────────────────────────────────────────────

let _sdkLoadPromise: Promise<void> | null = null;
let _sdkReady = false;

export function loadTimApiSdk(): Promise<void> {
  if (_sdkReady && typeof window !== 'undefined' && window.timapi) return Promise.resolve();
  if (_sdkLoadPromise) return _sdkLoadPromise;

  _sdkLoadPromise = new Promise((resolve, reject) => {
    window.onTimApiReady = () => {
      _sdkReady = true;
      resolve();
    };
    const script = document.createElement('script');
    script.src = '/timapi/timapi.js';
    script.onerror = () => {
      _sdkLoadPromise = null;
      reject(new Error(
        'ANZ TIM API SDK not found at /timapi/timapi.js.\n' +
        'Place timapi.js + timapi.wasm in /public/timapi/ and redeploy.\n' +
        'Obtain from: https://start.portal.anzworldline-solutions.com.au/'
      ));
    };
    document.head.appendChild(script);
  });

  return _sdkLoadPromise;
}

// ─── Adapter result types ─────────────────────────────────────────────────────

export interface AdapterTransactionResult {
  approved:       boolean;
  transactionRef?: string;
  authCode?:       string;
  cardLast4?:      string;
  cardScheme?:     string;
  rrn?:            string;
  stan?:           string;
  merchantReceipt?: string;
  customerReceipt?: string;
  resultCode?:     string;
  declineReason?:  string;
  applicationInfo?: TerminalApplicationInfo;
}

export interface AdapterCommitResult {
  success: boolean;
  transactionRef?: string;
  resultCode?: string;
  errorMessage?: string;
}

// ─── TimApiAdapter ────────────────────────────────────────────────────────────

export class TimApiAdapter {
  private _config: TimConfig | null = null;
  private _terminal: TimApiTerminal | null = null;
  private _listener: TimApiListener | null = null;
  private _logger: PaymentLogger;

  // Pending promise resolvers for async operations
  private _pendingTransaction: {
    resolve: (r: AdapterTransactionResult) => void;
    reject:  (e: Error) => void;
    onStatus?: (msg: string) => void;
  } | null = null;

  private _pendingCommit: {
    resolve: (r: AdapterCommitResult) => void;
    reject:  (e: Error) => void;
  } | null = null;

  private _pendingApplicationInfo: {
    resolve: (data: TerminalApplicationInfo) => void;
    reject:  (e: Error) => void;
  } | null = null;

  private _pendingBalance: {
    resolve: (data: Record<string, unknown>) => void;
    reject:  (e: Error) => void;
  } | null = null;

  constructor(logger: PaymentLogger) {
    this._logger = logger;
  }

  get isInitialized(): boolean {
    return this._terminal !== null;
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  async initialize(config: TimConfig): Promise<void> {
    this._config = config;
    this._logger.info('adapter_init_start', { terminalIp: config.terminalIp, terminalPort: config.terminalPort });

    await loadTimApiSdk();

    const timapi = window.timapi!;

    // 1. Terminal settings
    const settings = new timapi.TerminalSettings();
    settings.connectionIPString = config.terminalIp.trim();
    settings.connectionIPPort   = config.terminalPort;
    settings.autoCommit         = config.autoCommit;
    settings.integratorId       = config.integratorId;

    // 2. Terminal instance
    const terminal = new timapi.Terminal(settings);

    // 3. POS ID (kept for backward compat; EcrInfo is the primary method)
    terminal.setPosId(config.posId ?? 'POS-01');

    // 4. EcrInfo — MANDATORY metadata the terminal requires
    const ecrInfo = new timapi.EcrInfo();
    // Support both property-access and setter-method SDK styles
    if (typeof ecrInfo.setPosId === 'function') {
      ecrInfo.setPosId(config.posId ?? 'POS-01');
      if (config.operatorId) ecrInfo.setOperatorId!(config.operatorId);
    } else {
      ecrInfo.posId = config.posId ?? 'POS-01';
      if (config.operatorId) ecrInfo.operatorId = config.operatorId;
    }
    if (typeof terminal.addEcrData === 'function') {
      terminal.addEcrData(ecrInfo);
    } else if (typeof terminal.setEcrInfo === 'function') {
      terminal.setEcrInfo(ecrInfo);
    }

    // 5. Print options — terminal prints nothing by default (POS handles receipts)
    const printOpts = new timapi.PrintOptions();
    if (typeof printOpts.setMerchantReceiptEnabled === 'function') {
      printOpts.setMerchantReceiptEnabled(config.printMerchantReceipt);
      printOpts.setCustomerReceiptEnabled?.(config.printCustomerReceipt);
    } else {
      printOpts.merchantReceiptEnabled = config.printMerchantReceipt;
      printOpts.customerReceiptEnabled = config.printCustomerReceipt;
    }
    if (typeof terminal.setPrintOptions === 'function') {
      terminal.setPrintOptions(printOpts);
    } else if (typeof terminal.addPrintOptions === 'function') {
      terminal.addPrintOptions!(printOpts);
    }

    // 6. Listeners — bridge SDK callbacks into internal domain events
    const listener = this._buildListener();
    this._listener = listener;
    terminal.addListener(listener);

    this._terminal = terminal;

    this._logger.info('adapter_init_complete', {
      terminalIp: config.terminalIp,
      autoCommit: config.autoCommit,
      posId: config.posId,
    });
  }

  // ── Listener builder ────────────────────────────────────────────────────────

  private _buildListener(): TimApiListener {
    const self = this;

    return {
      transactionCompleted(event: TimTransactionEvent, data: TimTransactionData) {
        self._logger.info('transaction_completed', {
          approved: event.exception === undefined,
          resultCode: event.exception?.resultCode,
          cardType: data.cardType,
          rrn: data.rrn,
        });

        const pending = self._pendingTransaction;
        if (!pending) {
          self._logger.warn('transaction_completed_no_pending', {});
          return;
        }
        self._pendingTransaction = null;

        if (event.exception === undefined) {
          pending.resolve({
            approved:        true,
            transactionRef:  data.transactionReference,
            authCode:        data.authorisationCode,
            cardLast4:       data.maskedPan?.slice(-4),
            cardScheme:      data.cardType,
            rrn:             data.rrn,
            stan:            data.stan,
            merchantReceipt: data.merchantReceiptText ?? data.receiptText,
            customerReceipt: data.customerReceiptText,
          });
        } else {
          pending.resolve({
            approved:      false,
            resultCode:    event.exception.resultCode,
            declineReason: event.exception.message ?? `Declined (${event.exception.resultCode})`,
          });
        }
      },

      commitCompleted(event: TimTransactionEvent, data: TimTransactionData) {
        self._logger.info('commit_completed', {
          success: event.exception === undefined,
          resultCode: event.exception?.resultCode,
          transactionRef: data.transactionReference,
        });

        const pending = self._pendingCommit;
        if (!pending) {
          self._logger.warn('commit_completed_no_pending', {});
          return;
        }
        self._pendingCommit = null;

        if (event.exception === undefined) {
          pending.resolve({ success: true, transactionRef: data.transactionReference });
        } else {
          pending.resolve({
            success:      false,
            resultCode:   event.exception.resultCode,
            errorMessage: event.exception.message,
          });
        }
      },

      connectionStateChanged(event: TimConnectionEvent, _data: unknown) {
        const state = event?.data?.state ?? 'unknown';
        self._logger.info('connection_state_changed', { state });
        self._pendingTransaction?.onStatus?.(`Terminal: ${state}`);
      },

      displayTextChanged(_event: TimDisplayEvent, data: unknown) {
        const text = ((data as Record<string, unknown>)?.['text'] as string | undefined)?.trim();
        if (text) {
          self._logger.debug('display_text_changed', { text });
          self._pendingTransaction?.onStatus?.(text);
        }
      },

      loginCompleted(event: TimTransactionEvent, _data: unknown) {
        self._logger.info('login_completed', { success: event.exception === undefined });
      },

      activateCompleted(event: TimTransactionEvent, _data: unknown) {
        self._logger.info('activate_completed', { success: event.exception === undefined });
      },

      applicationInformationCompleted(event: TimTransactionEvent, data: TimApplicationInfoData) {
        self._logger.info('application_information_completed', { data });
        const pending = self._pendingApplicationInfo;
        if (!pending) return;
        self._pendingApplicationInfo = null;
        if (event.exception === undefined) {
          pending.resolve({
            posId:           data.posId,
            terminalModel:   data.terminalModel,
            softwareVersion: data.softwareVersion,
            supportedBrands: data.supportedBrands,
            merchantId:      data.merchantId,
            terminalId:      data.terminalId,
            activationState: data.activationState,
          });
        } else {
          pending.reject(new Error(event.exception.message ?? 'applicationInformation failed'));
        }
      },

      balanceCompleted(event: TimTransactionEvent, data: unknown) {
        self._logger.info('balance_completed', { success: event.exception === undefined });
        const pending = self._pendingBalance;
        if (!pending) return;
        self._pendingBalance = null;
        if (event.exception === undefined) {
          pending.resolve(data as Record<string, unknown>);
        } else {
          pending.reject(new Error(event.exception.message ?? 'balance failed'));
        }
      },

      receiptGenerated(_event: unknown, data: unknown) {
        // Receipt text is delivered in transactionCompleted; this is informational
        self._logger.debug('receipt_generated', { data });
      },
    };
  }

  // ── Purchase ────────────────────────────────────────────────────────────────

  purchase(
    amountCents: number,
    referenceId?: string,
    onStatus?: (msg: string) => void,
  ): Promise<AdapterTransactionResult> {
    if (!this._terminal) throw new Error('Adapter not initialized — call initialize() first');
    if (this._pendingTransaction) throw new Error('A transaction is already in progress');

    this._logger.info('purchase_start', { amountCents, referenceId });

    return new Promise((resolve, reject) => {
      this._pendingTransaction = { resolve, reject, onStatus };

      const timapi = window.timapi!;
      try {
        this._terminal!.transactionAsync(
          timapi.constants.TransactionType.purchase,
          new timapi.Amount(amountCents, timapi.constants.Currency.AUD),
          referenceId,
        );
      } catch (err) {
        this._pendingTransaction = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Commit ──────────────────────────────────────────────────────────────────

  commit(): Promise<AdapterCommitResult> {
    if (!this._terminal) throw new Error('Adapter not initialized');
    if (this._pendingCommit) throw new Error('A commit is already in progress');

    this._logger.info('commit_start', {});

    return new Promise((resolve, reject) => {
      this._pendingCommit = { resolve, reject };
      try {
        this._terminal!.commitAsync();
      } catch (err) {
        this._pendingCommit = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────

  cancel(): void {
    if (!this._terminal) return;
    this._logger.info('cancel_requested', {});
    try {
      this._terminal.cancelAsync();
    } catch (err) {
      this._logger.warn('cancel_failed', { error: String(err) });
    }
  }

  // ── Application information ─────────────────────────────────────────────────

  getApplicationInformation(timeoutMs = 10_000): Promise<TerminalApplicationInfo> {
    if (!this._terminal) throw new Error('Adapter not initialized');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingApplicationInfo = null;
        reject(new Error('applicationInformation timed out'));
      }, timeoutMs);

      this._pendingApplicationInfo = {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject:  (err)  => { clearTimeout(timer); reject(err);   },
      };

      try {
        this._terminal!.applicationInformationAsync?.();
      } catch (err) {
        clearTimeout(timer);
        this._pendingApplicationInfo = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Balance ─────────────────────────────────────────────────────────────────

  balance(timeoutMs = 30_000): Promise<Record<string, unknown>> {
    if (!this._terminal) throw new Error('Adapter not initialized');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingBalance = null;
        reject(new Error('balance timed out'));
      }, timeoutMs);

      this._pendingBalance = {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject:  (err)  => { clearTimeout(timer); reject(err);   },
      };

      try {
        this._terminal!.balanceAsync?.();
      } catch (err) {
        clearTimeout(timer);
        this._pendingBalance = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Teardown ────────────────────────────────────────────────────────────────

  dispose(): void {
    if (this._terminal && this._listener) {
      try { this._terminal.removeListener(this._listener); } catch { /* ignore */ }
    }
    this._terminal  = null;
    this._listener  = null;
    this._config    = null;
    this._pendingTransaction = null;
    this._pendingCommit      = null;
    this._logger.info('adapter_disposed', {});
  }
}
