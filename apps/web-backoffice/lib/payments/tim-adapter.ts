/**
 * TimApiAdapter — the ONLY module that directly calls the ANZ TIM API SDK.
 *
 * Aligned with SDK v26-01 (timapi.js + timapi.wasm).
 * Documentation: https://six-tim.github.io/timapi/doc/js/guide.html
 *
 * Implements the mandatory TIM API initialization sequence:
 *   1. Create TerminalSettings (IP, port, integratorId, autoCommit, fetchBrands, dcc, tipAllowed)
 *   2. Create Terminal instance — settings are IMMUTABLE after construction
 *   3. Set POS ID (max 6 digits, EP2 requirement)
 *   4. Set User ID
 *   5. Add EcrInfo — software identification (name, version, manufacturer)
 *   6. Set PrintOptions
 *   7. Register listener (extend DefaultTerminalListener pattern)
 *
 * Pre-Automatisms (cannot be disabled):
 *   Calling transactionAsync() in disconnected state automatically triggers
 *   connect → login → activate before the transaction is sent.
 *
 * ─── SDK setup ───────────────────────────────────────────────────────────────
 * Place timapi.js + timapi.wasm in /public/timapi/ before this adapter can run.
 * Both files are obtained from: https://start.portal.anzworldline-solutions.com.au/
 * SDK version: 26-01
 */

import type { TimConfig, TerminalApplicationInfo } from './domain';
import type { PaymentLogger } from './logger';
import { isBridgeProxyReady, getBridgePort } from '../bridge-health';
import { getAnzLogSink } from './anz-log-sink';
import { translateResultCode, type ResultCodeLike } from './result-code';

// ─── TIM API v26-01 TypeScript declarations ────────────────────────────────────
// Covers the full known surface of the TIM API JavaScript SDK v26-01.

declare global {
  interface Window {
    /** Set this callback BEFORE inserting the timapi.js script tag. */
    onTimApiReady?: () => void;
    timapi?: TimApiNamespace;
  }
}

// ── Enumerations ──────────────────────────────────────────────────────────────

interface TimApiEnumValue {
  readonly name: string;
  readonly _value: number;
}

interface TimApiEnumeration {
  readonly [key: string]: TimApiEnumValue;
}

/** Currency constant — has .code (ISO string) and .exponent (minor unit exponent, e.g. 2 for AUD/cents) */
interface TimApiCurrencyValue {
  readonly code:     string;
  readonly exponent: number;
}

// ── SDK namespace ─────────────────────────────────────────────────────────────

interface TimApiNamespace {
  TerminalSettings: new () => TimApiTerminalSettings;
  Terminal:         new (settings: TimApiTerminalSettings) => TimApiTerminal;
  /**
   * Amount constructor — value in minor units (e.g. 450 cents = $4.50 AUD).
   * currency: pass timapi.constants.Currency.AUD (a TimApiCurrencyValue object, NOT a string).
   * The currency object already carries the exponent (2 for AUD), so no separate exponent arg needed.
   */
  Amount: new (valueMinorUnits: number, currency: TimApiCurrencyValue) => TimApiAmount;
  /** Static factory: create Amount from major units (dollars) — e.g. fromMajorUnits(4.50, Currency.AUD) */
  'Amount.fromMajorUnits'?: (valueMajorUnits: number, currency: TimApiCurrencyValue) => TimApiAmount;
  EcrInfo:          new () => TimApiEcrInfo;
  /**
   * PrintOption constructor — all arguments required.
   * @param recipient   timapi.constants.Recipient (merchant | cardholder | both)
   * @param printFormat timapi.constants.PrintFormat (normal | noPrint | onDevice | …)
   * @param printWidth  line width in characters (default 40)
   * @param printFlags  Array of timapi.constants.PrintFlag values (empty [] for none)
   */
  PrintOption: new (
    recipient:   TimApiEnumValue,
    printFormat: TimApiEnumValue,
    printWidth:  number,
    printFlags:  TimApiEnumValue[],
  ) => TimApiPrintOption;
  TransactionData:  new () => TimApiTransactionDataObj;
  DefaultTerminalListener: new () => TimApiListener;

  constants: {
    TransactionType: {
      purchase:  TimApiEnumValue;
      credit:    TimApiEnumValue;  // refund/credit — NOT "refund"
      reversal:  TimApiEnumValue;
    };
    Currency: {
      /** Australian Dollar — exponent 2 (cents) */
      AUD: TimApiCurrencyValue;
    } & { values(): TimApiCurrencyValue[] } & { [code: string]: TimApiCurrencyValue };
    EcrInfoType: {
      os:             TimApiEnumValue;
      ecrApplication: TimApiEnumValue;
      eftApi:         TimApiEnumValue;
      eftModule:      TimApiEnumValue;
    };
    Guides: {
      retail:         TimApiEnumValue;
      unattended:     TimApiEnumValue;
      advancedRetail: TimApiEnumValue;
      hospitality:    TimApiEnumValue;
    };
    Recipient: {
      merchant:   TimApiEnumValue;
      cardholder: TimApiEnumValue;
      both:       TimApiEnumValue;
    };
    PrintFormat: {
      /** Receipts generated, formatted, sent to ECR (default) */
      normal:              TimApiEnumValue;
      /** Do not generate any receipts */
      noPrint:             TimApiEnumValue;
      /** Only raw fields returned — no formatted receipt */
      fieldsOnly:          TimApiEnumValue;
      /** Printed on terminal printer, not returned to ECR */
      onDevice:            TimApiEnumValue;
      /** Printed on terminal; raw fields also returned to ECR */
      onDeviceWithFields:  TimApiEnumValue;
      /** Printed on terminal; formatted receipt also returned to ECR */
      onDeviceWithReceipt: TimApiEnumValue;
    } & TimApiEnumeration;
    PrintMode:   TimApiEnumeration;
  };
}

// ── TerminalSettings ──────────────────────────────────────────────────────────
// All properties are set BEFORE passing to new timapi.Terminal(settings).
// Settings are immutable after Terminal construction — changes to the settings
// object are ignored.

interface TimApiTerminalSettings {
  /** IPv4 address of the terminal */
  connectionIPString: string;
  /** WebSocket port (default: 80) */
  connectionIPPort:   number;
  /** Integrator ID issued by ANZ Worldline */
  integratorId:       string;
  /**
   * Guides (use cases) required. Retail guide is included by default.
   * Type: Set<TimApiEnumValue>
   */
  guides:             Set<TimApiEnumValue>;
  /**
   * If true, terminal commits automatically after a successful transaction.
   * If false (or undefined), ECR must call commitAsync() after every approval.
   */
  autoCommit:         boolean | undefined;
  /**
   * If true, terminal retrieves brand/application info automatically after login.
   * Required: true for ANZ Worldline validation.
   */
  fetchBrands:        boolean;
  /**
   * DCC (Dynamic Currency Conversion) support.
   * Default: true per SDK. Set false for ANZ Australia.
   */
  dcc:                boolean;
  /**
   * Partial approval support.
   * Default: false.
   */
  partialApproval:    boolean;
  /**
   * Tip allowed — gastro guide only. Default: true per SDK.
   * Set false for ANZ retail validation.
   */
  tipAllowed:         boolean;
  /** Keep-alive handling — default: true */
  enableKeepAlive:    boolean;
}

// ── EcrInfo ───────────────────────────────────────────────────────────────────
// Software identification sent to the terminal. Used with addEcrData().
// Multiple EcrInfo objects can be added (one per type — os, ecrApplication, etc.)

interface TimApiEcrInfo {
  /** Information type (mandatory) — timapi.constants.EcrInfoType */
  type:              TimApiEnumValue;
  /** ECR application/software name */
  name?:             string;
  /** Manufacturer of the ECR software */
  manufacturerName?: string;
  /** Software version */
  version?:          string;
  /** Hardware architecture */
  architecture?:     string;
  /** ECR configuration */
  configuration?:    string;
  /** Integrator solution name */
  integratorSolution?: string;
  /** Serial number */
  serialNumber?:     string;
  /** Remote IP (for server-based ECR setups) */
  remoteIp?:         string;
}

// ── PrintOption ───────────────────────────────────────────────────────────────
// Instances are created via the 4-argument constructor — settings are fixed
// at construction time and cannot be changed via property setters afterwards.

interface TimApiPrintOption {
  // Opaque instance — all options are specified via the constructor.
  // See: new timapi.PrintOption(recipient, printFormat, printWidth, printFlags)
}

// ── TransactionData (request) ─────────────────────────────────────────────────
// Used for:
//  - Reversal / VOID (§3.9) — identifies the transaction to void by trmTransRef
//  - Credit / Reference Refund (§3.6 row 2) — identifies the original purchase
//    by originalTrmTransRef + originalAcqTransRef + originalAcqId + originalTrxDate

interface TimApiTransactionDataObj {
  /** ECR transaction reference (optional) */
  transRef?:      number;
  /** Terminal transaction reference (for reversals) */
  trmTransRef?:   string;
  /** Acquirer transaction reference (for reversals/credits) */
  acqTransRef?:   string;
  /** Acquirer ID */
  acqId?:         number;
  /** Allow DCC override per transaction */
  dccAllowed?:    boolean;
  /** Partial approval per transaction */
  partialApprovalAllowed?: boolean;

  // ── Reference-refund fields (§3.6 row 2) ─────────────────────────────────
  /** Original terminal transaction reference of the purchase being refunded */
  originalTrmTransRef?: string;
  /** Original acquirer transaction reference */
  originalAcqTransRef?: string;
  /** Original acquirer ID */
  originalAcqId?: number;
  /** Original transaction date (YYYY-MM-DD or ISO) */
  originalTrxDate?: string;
}

/**
 * Inputs accepted by TimApiAdapter.refund() for a reference refund.
 * Typically read out of a prior approved purchase's AdapterTransactionResult
 * (transactionRef → originalTrmTransRef, acqTransRef → originalAcqTransRef).
 */
export interface ReferenceRefundData {
  originalTrmTransRef?: string;
  originalAcqTransRef?: string;
  originalAcqId?:       number;
  /** ISO date string of the original purchase */
  originalTrxDate?:     string;
}

// ── TransactionResponse (returned in transactionCompleted callback) ────────────

export interface TimTransactionResponse {
  /** Transaction type performed */
  transactionType?: TimApiEnumValue;
  /** Transaction information (auth code, references, etc.) */
  transactionInformation?: TimTransactionInformation;
  /** Card data */
  cardData?: TimCardData;
  /** Print data (receipts) */
  printData?: TimPrintData;
}

export interface TimTransactionInformation {
  /** Authorization/approval code from the bank */
  authCode?:      string;
  /** Terminal transaction reference — use for reversals */
  trmTransRef?:   string;
  /** Acquirer transaction reference */
  acqTransRef?:   string;
  /** Acquirer ID */
  acqId?:         number;
  /** SIX transaction reference number — use for cross-system tracing */
  sixTrxRefNum?:  string;
  /** ECR sequence counter */
  transRef?:      number;
  /** Terminal sequence number */
  transSeq?:      number;
  /** Cardholder name */
  cardholderName?: string;
}

export interface TimCardData {
  /** Payment brand name (e.g. "VISA", "MasterCard", "eftpos") */
  brandName?:                  string;
  /** Tender name */
  tenderName?:                 string;
  /** Masked card number */
  cardNumber?:                 string;
  /** Printable card number for merchant receipt (e.g. "XXXXXXXXXXXX4242") */
  cardNumberPrintable?:        string;
  /** Printable card number for cardholder receipt */
  cardNumberPrintableCardholder?: string;
  /** Card type integer */
  cardType?:                   number;
}

export interface TimReceipt {
  /** timapi.constants.Recipient.merchant or .cardholder */
  recipient: TimApiEnumValue;
  /** Receipt text */
  value?: string;
}

export interface TimPrintData {
  receipts?: TimReceipt[];
}

// ── Event shapes ──────────────────────────────────────────────────────────────

export interface TimTransactionEvent {
  /** Undefined means success; defined means failure/decline */
  exception?: {
    resultCode: string | TimApiEnumValue;
    message?:   string;
    category?:  string;
    printData?: TimPrintData; // decline receipts may be in exception
  };
}

export interface TimConnectionEvent {
  exception?: { resultCode: string | TimApiEnumValue; message?: string };
}

// ── Listener interface ────────────────────────────────────────────────────────
// Subclass timapi.DefaultTerminalListener and override needed methods.

interface TimApiListener {
  transactionCompleted(event: TimTransactionEvent, data: TimTransactionResponse): void;
  commitCompleted?(event: TimTransactionEvent, data: TimTransactionResponse): void;
  rollbackCompleted?(event: TimTransactionEvent, data: unknown): void;
  connectCompleted?(event: TimConnectionEvent): void;
  loginCompleted?(event: TimTransactionEvent): void;
  activateCompleted?(event: TimTransactionEvent, data: unknown): void;
  deactivateCompleted?(event: TimTransactionEvent, data: unknown): void;
  logoutCompleted?(event: TimTransactionEvent): void;
  disconnected?(terminal: TimApiTerminal, exception?: unknown): void;
  /** Terminal state changed — use terminal.getTerminalStatus() for details */
  terminalStatusChanged?(terminal: TimApiTerminal): void;
  applicationInformationCompleted?(event: TimTransactionEvent): void;
  /**
   * §3.11: fires after transactionInformationAsync(). `data` carries the
   * last transaction's transactionInformation (auth code, trmTransRef, ...)
   * plus any printData receipts the terminal has on file.
   */
  transactionInformationCompleted?(event: TimTransactionEvent, data: TimTransactionResponse): void;
  hardwareInformationCompleted?(event: TimTransactionEvent, data: unknown): void;
  balanceCompleted?(event: TimTransactionEvent, data: unknown): void;
  /** Receipts ready for printing — called automatically by DefaultTerminalListener */
  printReceipts?(terminal: TimApiTerminal, printData: TimPrintData): void;
  requestCompleted?(event: TimTransactionEvent, data: unknown): void;
  errorNotification?(terminal: TimApiTerminal, response: unknown): void;
  /** Cancel completed callback */
  cancelCompleted?(event: TimTransactionEvent): void;
  /** Disconnect completed (after explicit disconnectAsync) */
  disconnectCompleted?(event: TimConnectionEvent): void;
  /** Application information notification (during login, brand info) */
  applicationInformation?(...args: unknown[]): void;
  /** System information completed */
  systemInformationCompleted?(...args: unknown[]): void;
  /** Reconciliation (daily settlement) completed */
  reconciliationCompleted?(...args: unknown[]): void;
  /** Reservation completed */
  reservationCompleted?(...args: unknown[]): void;
  /** Terminal reconfiguration completed */
  reconfigCompleted?(...args: unknown[]): void;
  /** Counter request completed */
  counterRequestCompleted?(...args: unknown[]): void;
  /** Software update completed */
  softwareUpdateCompleted?(...args: unknown[]): void;
  /** Terminal hardware key pressed */
  keyPressed?(...args: unknown[]): void;
  /** Reference number request from terminal */
  referenceNumberRequest?(...args: unknown[]): void;
}

// ── Terminal ──────────────────────────────────────────────────────────────────

export interface TimApiTerminal {
  /** Set POS identifier — max 6 digits per EP2 standard */
  setPosId(id: string): void;
  /** Set user/operator identifier */
  setUserId(id: number): void;
  /** Add ECR software identification */
  addEcrData(ecrInfo: TimApiEcrInfo): void;
  /** Set ECR data list (replaces all) */
  setEcrData(ecrData: TimApiEcrInfo[]): void;
  /** Set print options */
  setPrintOptions(options: TimApiPrintOption[]): void;
  /** Register event listener */
  addListener(listener: TimApiListener): void;
  /** Unregister event listener */
  removeListener(listener: TimApiListener): void;

  // ── Financial transactions ─────────────────────────────────────────────────
  /**
   * Standard transaction (purchase, credit, reversal).
   * Optional `data` is a `timapi.TransactionData()` instance — required for:
   *  - reversal by reference (populate trmTransRef / acqTransRef)
   *  - credit against original purchase, §3.6 row 2 (populate
   *    originalTrmTransRef / originalAcqTransRef / originalAcqId / originalTrxDate)
   */
  transactionAsync(type: TimApiEnumValue, amount: TimApiAmount, data?: TimApiTransactionDataObj): void;
  /** Commit an approved transaction (required when autoCommit=false) */
  commitAsync(): void;
  /** Rollback (prevent commit, generate technical reversal) */
  rollbackAsync(): void;
  /**
   * Cancel an in-progress transaction (best-effort).
   * NOT async — does not have a callback.
   * Cannot cancel commit or rollback.
   */
  cancel(): void;

  // ── Session management ─────────────────────────────────────────────────────
  connectAsync?(): void;
  loginAsync?(): void;
  activateAsync?(): void;
  deactivateAsync?(): void;
  logoutAsync?(): void;
  disconnectAsync?(): void;

  // ── Queries ────────────────────────────────────────────────────────────────
  applicationInformationAsync(): void;
  hardwareInformationAsync?(): void;
  balanceAsync?(): void;
  /**
   * §3.11 exception recovery: fetch information about the last transaction
   * the terminal has on file. Useful when the ECR crashed after the terminal
   * authorised but before commit (unknown_outcome) — the operator can see
   * whether the terminal actually committed.
   */
  transactionInformationAsync?(): void;
  /** Returns list of brands (populated after login or applicationInformation) */
  getBrands(): Array<{ name?: string; brandId?: string; acqId?: number }>;
  /** Returns terminal ID (populated after login) */
  getTerminalId(): string;
  /** Returns terminal connection status */
  getTerminalStatus(): unknown;
  /** Returns terminal features (populated after login) */
  getFeatures(): unknown;

  /** Dispose terminal and release WASM resources */
  dispose(): void;
}

interface TimApiAmount {}

// ─── SDK loader ───────────────────────────────────────────────────────────────

let _sdkLoadPromise: Promise<void> | null = null;
let _sdkReady = false;

export function loadTimApiSdk(): Promise<void> {
  if (_sdkReady && typeof window !== 'undefined' && window.timapi) return Promise.resolve();
  if (_sdkLoadPromise) return _sdkLoadPromise;

  _sdkLoadPromise = new Promise((resolve, reject) => {
    // GAP-3 / §4: wire FINEST log capture BEFORE the script loads so every
    // SDK log record (including startup records) is persisted for §4
    // submission as TimApiYYYYMMDD.log. Installed only once per page.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (typeof w.onTimApiPublishLogRecord !== 'function') {
        const sink = getAnzLogSink();
        w.onTimApiPublishLogRecord = (record: unknown) => {
          try { sink.append(record); } catch { /* non-fatal */ }
        };
      }
    } catch { /* non-fatal — log sink is best-effort */ }

    // MUST set onTimApiReady BEFORE the script tag is inserted —
    // the callback fires as soon as the WASM module finishes compiling.
    window.onTimApiReady = () => {
      _sdkReady = true;
      resolve();
    };
    const script = document.createElement('script');
    script.src = '/timapi/timapi.js';
    script.onerror = () => {
      _sdkLoadPromise = null;
      reject(new Error(
        'ANZ TIM API SDK (v26-01) not found at /timapi/timapi.js.\n' +
        'Place timapi.js + timapi.wasm in /public/timapi/ and redeploy.\n' +
        'Integrator ID: d23f66c0-546b-482f-b8b6-cb351f94fd31'
      ));
    };
    document.head.appendChild(script);
  });

  return _sdkLoadPromise;
}

// ─── Adapter result types ─────────────────────────────────────────────────────

export interface AdapterTransactionResult {
  approved:        boolean;
  transactionRef?: string;   // trmTransRef from terminal
  acqTransRef?:    string;   // acquirer transaction reference
  sixTrxRefNum?:   string;   // SIX transaction reference number
  authCode?:       string;
  cardLast4?:      string;
  cardScheme?:     string;   // e.g. "VISA", "MasterCard", "eftpos"
  /**
   * RRN (Retrieval Reference Number) — not directly available in SDK v26-01 TransactionResponse.
   * May be present in receipt text or acquirer reference fields.
   * Kept for backward compatibility with state-machine.ts.
   */
  rrn?:            string;
  /**
   * STAN (System Trace Audit Number) — not directly available in SDK v26-01 TransactionResponse.
   * Kept for backward compatibility with state-machine.ts.
   */
  stan?:           string;
  merchantReceipt?: string;
  customerReceipt?: string;
  resultCode?:     string;
  declineReason?:  string;
  /**
   * §3.11 / validation: coarse-grained category derived from the SIX TIM
   * ResultCode. Populated for approved=false results. See
   * `lib/payments/result-code.ts` for the mapping table.
   */
  errorCategory?: import('./domain').PaymentErrorCategory;
  /**
   * Whether re-issuing the same request may succeed. The state machine
   * layers additional business rules on top of this (e.g. unknown_outcome
   * is never retried).
   */
  retryable?: boolean;
  applicationInfo?: TerminalApplicationInfo;
}

export interface AdapterCommitResult {
  success: boolean;
  transactionRef?: string;
  resultCode?: string;
  errorMessage?: string;
  errorCategory?: import('./domain').PaymentErrorCategory;
}

/**
 * §1.4 / SDK rollbackAsync(): result of operator-initiated rollback before
 * commit. Per the SDK guide rollback triggers a technical reversal on the
 * terminal and does not require a subsequent commit.
 */
export interface AdapterRollbackResult {
  success: boolean;
  resultCode?: string;
  errorMessage?: string;
  errorCategory?: import('./domain').PaymentErrorCategory;
}

/**
 * §3.11: the information returned by transactionInformationAsync() — the
 * terminal's view of the last transaction on file. Use this during
 * unknown_outcome recovery to decide whether to treat the pending intent
 * as committed.
 */
export interface LastTransactionInformation {
  transactionRef?: string;
  acqTransRef?:    string;
  authCode?:       string;
  sixTrxRefNum?:   string;
  cardScheme?:     string;
  cardLast4?:      string;
  merchantReceipt?: string;
  customerReceipt?: string;
  transactionType?: string;
}

// ─── TimApiAdapter ────────────────────────────────────────────────────────────

export class TimApiAdapter {
  private _config: TimConfig | null = null;
  private _terminal: TimApiTerminal | null = null;
  private _listener: TimApiListener | null = null;
  private _logger: PaymentLogger;

  /**
   * Section 1.3: Reconnection callback.
   * Fired when the terminal disconnects (e.g. nightly 2AM-5AM PCI reboot).
   * The session manager sets this to update its connection state and trigger
   * re-pairing before the next transaction.
   */
  onDisconnect?: () => void;

  // Pending promise resolvers for async SDK callbacks
  private _pendingTransaction: {
    resolve:  (r: AdapterTransactionResult) => void;
    reject:   (e: Error) => void;
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

  private _pendingTransactionInfo: {
    resolve: (data: LastTransactionInformation) => void;
    reject:  (e: Error) => void;
  } | null = null;

  /**
   * Tracks which transaction type completed most recently. Used to enforce
   * ANZ Validation §1.4: "A Reversal/Void does not require a Commit".
   * If a caller attempts to commit() after a reversal, the adapter refuses
   * to pass the call to the SDK — this prevents accidental double-commits
   * when a future refactor wires commit() into a reversal's approved path.
   */
  private _lastApprovedTxType: 'purchase' | 'credit' | 'reversal' | null = null;

  /**
   * Transaction type currently in-flight (between transactionAsync() and
   * transactionCompleted). Set by purchase/refund/reversal; cleared in the
   * transactionCompleted listener. Used to tag `_lastApprovedTxType` on
   * success.
   */
  private _inFlightTxType: 'purchase' | 'credit' | 'reversal' | null = null;

  private _pendingRollback: {
    resolve: (r: AdapterRollbackResult) => void;
    reject:  (e: Error) => void;
  } | null = null;

  // Pending resolvers for explicit lifecycle calls
  private _pendingConnect: {
    resolve: () => void;
    reject:  (e: Error) => void;
  } | null = null;

  private _pendingLogin: {
    resolve: () => void;
    reject:  (e: Error) => void;
  } | null = null;

  private _pendingActivate: {
    resolve: () => void;
    reject:  (e: Error) => void;
  } | null = null;

  private _pendingDeactivate: {
    resolve: (data: unknown) => void;
    reject:  (e: Error) => void;
  } | null = null;

  private _pendingLogout: {
    resolve: () => void;
    reject:  (e: Error) => void;
  } | null = null;

  private _pendingDisconnect: {
    resolve: () => void;
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
    this._logger.info('adapter_init_start', {
      terminalIp:   config.terminalIp,
      terminalPort: config.terminalPort,
      autoCommit:   config.autoCommit,
      fetchBrands:  config.fetchBrands,
      dcc:          config.dcc,
    });

    await loadTimApiSdk();

    const timapi = window.timapi!;

    // ── 1. TerminalSettings ──────────────────────────────────────────────────
    // All settings MUST be configured before passing to Terminal constructor.
    // Settings are immutable after construction.
    const settings = new timapi.TerminalSettings();

    // ── Bridge routing ─────────────────────────────────────────────────────
    // The Hardware Bridge (ws://127.0.0.1:9999) translates WebSocket ↔ TCP
    // so the browser SDK can reach terminals (and the EftSimulator) that
    // speak raw TCP SIXml. This is needed even for loopback addresses —
    // mixed-content is only ONE reason; transport translation is the other.
    //
    // On HTTPS: ALWAYS route through the bridge when it is available,
    // regardless of whether the terminal IP is loopback or LAN. This
    // matches the pair lifecycle's routing logic and avoids the adapter
    // trying to connect directly to port 80 (nothing listens there).
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

    if (isHttps) {
      const bridgeReady = await isBridgeProxyReady();
      if (bridgeReady) {
        this._logger.info('bridge_proxy_routing', {
          realTarget: `${config.terminalIp}:${config.terminalPort}`,
          bridgePort: getBridgePort(),
        });
        settings.connectionIPString = '127.0.0.1';
        settings.connectionIPPort   = getBridgePort();
      } else {
        throw new Error(
          'Cannot reach the ANZ terminal from this browser — the Hardware Bridge is ' +
          'required to translate WebSocket ↔ TCP for the terminal/simulator. ' +
          'Install the ElevatedPOS Hardware Bridge on this machine, ' +
          'or use the POS app on the tablet to process payments.',
        );
      }
    } else {
      settings.connectionIPString = config.terminalIp.trim();
      settings.connectionIPPort   = config.terminalPort;
    }
    // Surface the effective WebSocket target so operators and support can see
    // exactly what the SDK is about to open (ANZ validation §3.1 requires the
    // URL to match the simulator / terminal configuration).
    const effectiveWsUrl = `ws://${settings.connectionIPString}:${settings.connectionIPPort}/SIXml`;
    this._logger.info('adapter_ws_target', { url: effectiveWsUrl });

    // Substitute the known ElevatedPOS vendor integrator ID if the config did
    // not carry one (e.g. picker-driven flow where the device is not yet
    // assigned a saved credential). Throwing here previously caused the POS
    // Pair button to fail silently when the config fallback hadn't propagated.
    const ANZ_DEFAULT_INTEGRATOR_ID = 'd23f66c0-546b-482f-b8b6-cb351f94fd31';
    const resolvedIntegratorId = config.integratorId?.trim() || ANZ_DEFAULT_INTEGRATOR_ID;
    if (!config.integratorId?.trim()) {
      this._logger.warn('integrator_id_fallback', { using: ANZ_DEFAULT_INTEGRATOR_ID });
    }
    settings.integratorId       = resolvedIntegratorId;
    settings.autoCommit         = config.autoCommit;

    // fetchBrands: automatically retrieve brands during login
    // Required true for ANZ Worldline validation
    settings.fetchBrands        = config.fetchBrands ?? true;

    // DCC: must be false for ANZ Australia
    settings.dcc                = config.dcc ?? false;

    // Partial approval: false for ANZ Australia
    settings.partialApproval    = config.partialApproval ?? false;

    // tipAllowed: false for ANZ retail (gastro guide only)
    settings.tipAllowed         = config.tipAllowed ?? false;

    // enableKeepAlive: true (default, keep alive)
    settings.enableKeepAlive    = true;

    // guides: must be an explicit Set — SDK does NOT default guides internally.
    // Retail is the only guide required for standard POS. SDK throws invalidArgument
    // if guides is undefined/empty.
    settings.guides = new Set([timapi.constants.Guides.retail]);

    // integratorId is set earlier (line ~589) with the vendor-ID fallback.

    // ── 2. Terminal ──────────────────────────────────────────────────────────
    const terminal = new timapi.Terminal(settings);

    // ── 3. POS ID (max 6 digits per EP2 requirement) ─────────────────────────
    const posId = (config.posId ?? '1').substring(0, 6);
    terminal.setPosId(posId);
    if (config.operatorId !== undefined) {
      terminal.setUserId(Number(config.operatorId) || 1);
    }

    // ── 4. EcrInfo — ECR software identification (mandatory for systemInfo) ──
    // ecrApplication type: identifies the POS application to the terminal.
    const ecrInfo = new timapi.EcrInfo();
    ecrInfo.type            = timapi.constants.EcrInfoType.ecrApplication;
    ecrInfo.name            = 'ElevatedPOS';
    ecrInfo.manufacturerName = 'ElevatedPOS Pty Ltd';
    ecrInfo.version         = '1.0';
    ecrInfo.integratorSolution = 'ElevatedPOS-ANZ-v26-01';
    terminal.addEcrData(ecrInfo);

    // ── 5. PrintOptions ──────────────────────────────────────────────────────
    // PrintOption constructor: new PrintOption(recipient, printFormat, width, flags)
    //   printFormat.normal  → receipts generated and sent to ECR (POS prints them)
    //   printFormat.noPrint → no receipts generated (suppress for that recipient)
    // printWidth 40 is the standard character width.
    // printFlags [] → no receipt formatting flags (no suppress header/footer etc.)
    const fmtNormal  = timapi.constants.PrintFormat.normal;
    const fmtNoPrint = timapi.constants.PrintFormat.noPrint;

    terminal.setPrintOptions([
      new timapi.PrintOption(
        timapi.constants.Recipient.merchant,
        config.printMerchantReceipt ? fmtNormal : fmtNoPrint,
        40,
        [],
      ),
      new timapi.PrintOption(
        timapi.constants.Recipient.cardholder,
        config.printCustomerReceipt ? fmtNormal : fmtNoPrint,
        40,
        [],
      ),
    ]);

    // ── 6. Register listener ─────────────────────────────────────────────────
    const listener = this._buildListener();
    this._listener = listener;
    terminal.addListener(listener);

    this._terminal = terminal;

    this._logger.info('adapter_init_complete', {
      terminalIp:  config.terminalIp,
      autoCommit:  config.autoCommit,
      fetchBrands: config.fetchBrands,
      dcc:         config.dcc,
      posId,
    });
  }

  // ── Listener ────────────────────────────────────────────────────────────────

  private _buildListener(): TimApiListener {
    return {
      // ── Transaction completed ──────────────────────────────────────────────
      transactionCompleted: (event: TimTransactionEvent, data: TimTransactionResponse) => {
        this._logger.info('transaction_completed', {
          approved:   event.exception === undefined,
          resultCode: this._resultCodeString(event.exception?.resultCode),
          brandName:  data.cardData?.brandName,
          trmTransRef: data.transactionInformation?.trmTransRef,
        });

        const pending = this._pendingTransaction;
        if (!pending) {
          this._logger.warn('transaction_completed_no_pending', {});
          return;
        }
        this._pendingTransaction = null;
        const inFlightType = this._inFlightTxType;
        this._inFlightTxType = null;

        if (event.exception === undefined) {
          // §1.4: remember which type approved so commit() can enforce the
          // "reversal does not require commit" invariant.
          this._lastApprovedTxType = inFlightType;

          // Approved — extract receipt data from printData.receipts
          const { merchant: mRcpt, cardholder: chRcpt } = this._extractReceipts(data.printData);

          pending.resolve({
            approved:       true,
            transactionRef: data.transactionInformation?.trmTransRef,
            acqTransRef:    data.transactionInformation?.acqTransRef,
            sixTrxRefNum:   data.transactionInformation?.sixTrxRefNum,
            authCode:       data.transactionInformation?.authCode,
            cardLast4:      data.cardData?.cardNumberPrintable?.slice(-4)
                         ?? data.cardData?.cardNumberPrintableCardholder?.slice(-4),
            cardScheme:     data.cardData?.brandName,
            merchantReceipt: mRcpt,
            customerReceipt: chRcpt,
          });
        } else {
          // Declined / error — receipts may be in exception.printData
          const { merchant: mRcpt, cardholder: chRcpt } = this._extractReceipts(event.exception.printData);
          const translated = translateResultCode(
            event.exception.resultCode as ResultCodeLike,
            event.exception.message,
          );
          pending.resolve({
            approved:       false,
            resultCode:     translated.code || this._resultCodeString(event.exception.resultCode),
            declineReason:  translated.message,
            errorCategory:  translated.category,
            retryable:      translated.retryable,
            merchantReceipt: mRcpt,
            customerReceipt: chRcpt,
          });
        }
      },

      // ── Commit completed ───────────────────────────────────────────────────
      commitCompleted: (event: TimTransactionEvent, data: TimTransactionResponse) => {
        this._logger.info('commit_completed', {
          success:     event.exception === undefined,
          resultCode:  this._resultCodeString(event.exception?.resultCode),
          trmTransRef: data.transactionInformation?.trmTransRef,
        });

        const pending = this._pendingCommit;
        if (!pending) {
          this._logger.warn('commit_completed_no_pending', {});
          return;
        }
        this._pendingCommit = null;

        if (event.exception === undefined) {
          pending.resolve({
            success:       true,
            transactionRef: data.transactionInformation?.trmTransRef,
          });
        } else {
          const translated = translateResultCode(
            event.exception.resultCode as ResultCodeLike,
            event.exception.message,
          );
          pending.resolve({
            success:       false,
            resultCode:    translated.code || this._resultCodeString(event.exception.resultCode),
            errorMessage:  translated.message,
            errorCategory: translated.category,
          });
        }
      },

      // ── Connect completed ──────────────────────────────────────────────────
      // NOTE: we deliberately do NOT reject pending login/activate/transaction
      // here, even on exception. The TIM SDK fires `connectCompleted` for
      // transient events (keepalive-triggered reconnects, mid-session
      // disconnect/reconnect cycles) that it recovers from automatically. If
      // an in-flight operation truly cannot complete, the SDK will fire the
      // corresponding *Completed callback with an exception — that's where we
      // reject. (Previously we rejected aggressively here and it regressed
      // previously-working flows.) The 30 s timeout in login()/activate()
      // remains the fall-back for genuinely unreachable terminals.
      connectCompleted: (event: TimConnectionEvent) => {
        const ok = event.exception === undefined;
        this._logger.info('connect_completed', {
          success:    ok,
          resultCode: ok ? undefined : this._resultCodeString(event.exception!.resultCode),
          message:    ok ? undefined : event.exception!.message,
        });
        if (ok) {
          this._pendingTransaction?.onStatus?.('Terminal connected');
        }
        // Resolve explicit connect() caller if pending
        const pendingConnect = this._pendingConnect;
        if (pendingConnect) {
          this._pendingConnect = null;
          if (ok) {
            pendingConnect.resolve();
          } else {
            pendingConnect.reject(new Error(
              event.exception!.message ?? `connect failed (${this._resultCodeString(event.exception!.resultCode)})`
            ));
          }
        }
      },

      // ── Login completed ────────────────────────────────────────────────────
      loginCompleted: (event: TimTransactionEvent) => {
        const ok = event.exception === undefined;
        this._logger.info('login_completed', { success: ok });
        if (ok) {
          this._pendingTransaction?.onStatus?.('Terminal logged in');
          // After login, brands and terminalId are available
          if (this._terminal) {
            try {
              const brands = this._terminal.getBrands().map(b => b.name ?? b.brandId ?? '').filter(Boolean);
              const terminalId = this._terminal.getTerminalId();
              if (brands.length || terminalId) {
                this._logger.info('terminal_info_after_login', { brands, terminalId });
              }
            } catch { /* non-fatal */ }
          }
        }
        // Resolve explicit login() call if pending
        const pendingLogin = this._pendingLogin;
        if (pendingLogin) {
          this._pendingLogin = null;
          if (ok) {
            pendingLogin.resolve();
          } else {
            pendingLogin.reject(new Error(
              event.exception!.message ?? `login failed (${this._resultCodeString(event.exception!.resultCode)})`
            ));
          }
        }
      },

      // ── Activate completed ─────────────────────────────────────────────────
      activateCompleted: (event: TimTransactionEvent, _data: unknown) => {
        const ok = event.exception === undefined;
        this._logger.info('activate_completed', { success: ok });
        if (ok) {
          this._pendingTransaction?.onStatus?.('Terminal ready');
        }
        // Resolve explicit activate() call if pending
        const pendingActivate = this._pendingActivate;
        if (pendingActivate) {
          this._pendingActivate = null;
          if (ok) {
            pendingActivate.resolve();
          } else {
            pendingActivate.reject(new Error(
              event.exception!.message ?? `activate failed (${this._resultCodeString(event.exception!.resultCode)})`
            ));
          }
        }
      },

      // ── Terminal status changed ────────────────────────────────────────────
      terminalStatusChanged: (terminal: TimApiTerminal) => {
        try {
          const status = terminal.getTerminalStatus();
          this._logger.debug('terminal_status_changed', { status: String(status) });
          // Forward meaningful status to the pending transaction's UI callback
          if (status) {
            const statusStr = String(status);
            if (statusStr && statusStr !== 'undefined') {
              this._pendingTransaction?.onStatus?.(statusStr);
            }
          }
        } catch { /* non-fatal */ }
      },

      // ── Application information completed ──────────────────────────────────
      // NOTE: v26-01 only passes (event) — data is accessed via terminal.getBrands()
      applicationInformationCompleted: (event: TimTransactionEvent) => {
        this._logger.info('application_information_completed', {
          success: event.exception === undefined,
        });

        const pending = this._pendingApplicationInfo;
        if (!pending) return;
        this._pendingApplicationInfo = null;

        if (event.exception !== undefined) {
          pending.reject(new Error(
            event.exception.message ?? `applicationInformation failed (${this._resultCodeString(event.exception.resultCode)})`
          ));
          return;
        }

        // Gather info from terminal instance
        if (!this._terminal) {
          pending.reject(new Error('Terminal disposed before applicationInformation completed'));
          return;
        }

        try {
          const brands = this._terminal.getBrands()
            .map(b => b.name ?? b.brandId ?? '')
            .filter(Boolean);
          const terminalId = this._terminal.getTerminalId();

          pending.resolve({
            terminalId,
            supportedBrands: brands,
          });
        } catch (err) {
          pending.reject(err instanceof Error ? err : new Error(String(err)));
        }
      },

      // ── Balance completed ──────────────────────────────────────────────────
      balanceCompleted: (event: TimTransactionEvent, data: unknown) => {
        this._logger.info('balance_completed', { success: event.exception === undefined });
        const pending = this._pendingBalance;
        if (!pending) return;
        this._pendingBalance = null;
        if (event.exception === undefined) {
          // GAP-04: surface the balance receipts so the operator can submit
          // them with §3.10 day-closure evidence. Attach under the standard
          // `_receipts` key so the provider/UI can pull them out.
          const asObj = (data ?? {}) as Record<string, unknown>;
          try {
            const { merchant, cardholder } = this._extractReceipts(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (asObj as any).printData,
            );
            if (merchant || cardholder) {
              asObj['_receipts'] = { merchant, cardholder };
            }
          } catch { /* non-fatal */ }
          pending.resolve(asObj);
        } else {
          pending.reject(new Error(
            event.exception.message ?? `balance failed (${this._resultCodeString(event.exception.resultCode)})`
          ));
        }
      },

      // ── Transaction information completed (§3.11 recovery) ─────────────────
      transactionInformationCompleted: (event: TimTransactionEvent, data: TimTransactionResponse) => {
        this._logger.info('transaction_information_completed', {
          success:     event.exception === undefined,
          resultCode:  this._resultCodeString(event.exception?.resultCode),
          trmTransRef: data?.transactionInformation?.trmTransRef,
        });
        const pending = this._pendingTransactionInfo;
        if (!pending) return;
        this._pendingTransactionInfo = null;
        if (event.exception !== undefined) {
          pending.reject(new Error(
            event.exception.message ?? `transactionInformation failed (${this._resultCodeString(event.exception.resultCode)})`
          ));
          return;
        }
        const { merchant, cardholder } = this._extractReceipts(data?.printData);
        pending.resolve({
          transactionRef: data?.transactionInformation?.trmTransRef,
          acqTransRef:    data?.transactionInformation?.acqTransRef,
          authCode:       data?.transactionInformation?.authCode,
          sixTrxRefNum:   data?.transactionInformation?.sixTrxRefNum,
          cardScheme:     data?.cardData?.brandName,
          cardLast4:      data?.cardData?.cardNumberPrintable?.slice(-4)
                       ?? data?.cardData?.cardNumberPrintableCardholder?.slice(-4),
          merchantReceipt: merchant,
          customerReceipt: cardholder,
          transactionType: data?.transactionType?.name,
        });
      },

      // ── Deactivate completed ───────────────────────────────────────────────
      deactivateCompleted: (event: TimTransactionEvent, data: unknown) => {
        const ok = event.exception === undefined;
        this._logger.info('deactivate_completed', { success: ok });
        const pending = this._pendingDeactivate;
        if (!pending) return;
        this._pendingDeactivate = null;
        if (ok) {
          pending.resolve(data);
        } else {
          pending.reject(new Error(
            event.exception!.message ?? `deactivate failed (${this._resultCodeString(event.exception!.resultCode)})`
          ));
        }
      },

      // ── Logout completed ───────────────────────────────────────────────────
      logoutCompleted: (event: TimTransactionEvent) => {
        const ok = event.exception === undefined;
        this._logger.info('logout_completed', { success: ok });
        const pending = this._pendingLogout;
        if (!pending) return;
        this._pendingLogout = null;
        if (ok) {
          pending.resolve();
        } else {
          pending.reject(new Error(
            event.exception!.message ?? `logout failed (${this._resultCodeString(event.exception!.resultCode)})`
          ));
        }
      },

      // ── Disconnected ───────────────────────────────────────────────────────
      // Section 1.3: Terminal may disconnect unexpectedly (nightly PCI reboot
      // 2AM-5AM). Notify session manager so it can mark state as disconnected
      // and re-pair before the next transaction.
      disconnected: (_terminal: TimApiTerminal, _exception?: unknown) => {
        this._logger.info('disconnected', {});
        const pending = this._pendingDisconnect;
        if (pending) {
          // Expected disconnect (we called disconnectAsync)
          this._pendingDisconnect = null;
          pending.resolve();
        } else {
          // Unexpected disconnect — likely nightly PCI terminal reboot
          this._logger.warn('unexpected_disconnect', {
            note: 'Terminal may be rebooting (PCI maintenance 2AM–5AM). Will auto-reconnect on next transaction.',
          });
          this.onDisconnect?.();
        }
      },

      // ── Rollback completed ─────────────────────────────────────────────────
      rollbackCompleted: (event: TimTransactionEvent, _data: unknown) => {
        this._logger.info('rollback_completed', {
          success: event.exception === undefined,
          resultCode: this._resultCodeString(event.exception?.resultCode),
        });

        const pending = this._pendingRollback;
        this._pendingRollback = null;
        if (!pending) return; // nobody is awaiting — fire-and-forget rollback

        if (event.exception === undefined) {
          // §1.4: rollback does not need a commit; clear the last-approved
          // state so a subsequent commit() is a no-op rather than leaking
          // through to the SDK.
          this._lastApprovedTxType = null;
          pending.resolve({ success: true });
        } else {
          const translated = translateResultCode(
            event.exception.resultCode as ResultCodeLike,
            event.exception.message,
          );
          pending.resolve({
            success:       false,
            resultCode:    translated.code || this._resultCodeString(event.exception.resultCode),
            errorMessage:  translated.message,
            errorCategory: translated.category,
          });
        }
      },

      // ── Error notification ─────────────────────────────────────────────────
      errorNotification: (_terminal: TimApiTerminal, response: unknown) => {
        this._logger.warn('error_notification', { response: String(response) });
      },

      // ── Cancel completed ──────────────────────────────────────────────────
      cancelCompleted: (event: TimTransactionEvent) => {
        this._logger.info('cancel_completed', {
          success: event.exception === undefined,
        });
      },

      // ── Disconnect completed ──────────────────────────────────────────────
      disconnectCompleted: (event: TimConnectionEvent) => {
        this._logger.info('disconnect_completed', {
          success: event.exception === undefined,
        });
      },

      // ── No-op callbacks ───────────────────────────────────────────────────
      // The WASM layer calls every listener callback unconditionally via
      // forEach(each => each.xxx(...)). Missing methods throw TypeError and
      // spam [SEVERE] in ANZ validation logs. These no-ops suppress those.
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      applicationInformation:       () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      systemInformationCompleted:   () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      reconciliationCompleted:      () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      reservationCompleted:         () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      reconfigCompleted:            () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      counterRequestCompleted:      () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      hardwareInformationCompleted: () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      softwareUpdateCompleted:      () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      printReceipts:                () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      referenceNumberRequest:       () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      keyPressed:                   () => {},
    };
  }

  // ── Purchase ────────────────────────────────────────────────────────────────

  purchase(
    amountCents: number,  // Amount in minor units (cents) — e.g. $4.50 = 450
    _referenceId?: string, // NOTE: referenceId is not passed via transactionAsync in SDK v26-01
    onStatus?: (msg: string) => void,
  ): Promise<AdapterTransactionResult> {
    if (!this._terminal) throw new Error('Adapter not initialized — call initialize() first');
    if (this._pendingTransaction) throw new Error('A transaction is already in progress');

    this._logger.info('purchase_start', { amountCents });

    return new Promise((resolve, reject) => {
      this._pendingTransaction = { resolve, reject, onStatus };
      this._inFlightTxType = 'purchase';

      const timapi = window.timapi!;
      try {
        // Amount: value in minor units (cents), AUD exponent=2 → default
        // transactionAsync(type, amount) — only 2 arguments in SDK v26-01
        this._terminal!.transactionAsync(
          timapi.constants.TransactionType.purchase,
          new timapi.Amount(amountCents, timapi.constants.Currency.AUD),
        );
      } catch (err) {
        this._pendingTransaction = null;
        this._inFlightTxType = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Credit (Refund) ──────────────────────────────────────────────────────────
  // NOTE: In TIM API v26-01 the refund transaction type is "credit", not "refund"
  //
  // TWO variants per ANZ Validation §3.6:
  //   Row 1 — standalone credit (no reference): customer presents card
  //   Row 2 — reference credit (refund against a prior purchase): identifies
  //           the original purchase via originalTrmTransRef / originalAcqTransRef
  //           / originalAcqId / originalTrxDate on the TransactionData object.
  //
  // The optional `reference` argument drives the §3.6 row 2 flow. When omitted
  // the terminal performs the standalone credit per row 1.

  refund(
    amountCents: number,
    onStatus?: (msg: string) => void,
    reference?: ReferenceRefundData,
  ): Promise<AdapterTransactionResult> {
    if (!this._terminal) throw new Error('Adapter not initialized');
    if (this._pendingTransaction) throw new Error('A transaction is already in progress');

    this._logger.info('refund_start', {
      amountCents,
      reference: reference
        ? { hasTrmRef: !!reference.originalTrmTransRef, hasAcqRef: !!reference.originalAcqTransRef }
        : undefined,
    });

    return new Promise((resolve, reject) => {
      this._pendingTransaction = { resolve, reject, onStatus };
      this._inFlightTxType = 'credit';

      const timapi = window.timapi!;
      try {
        // Build TransactionData only when reference fields are supplied — the
        // terminal interprets presence-of-object as "attempt referenced refund".
        let txData: TimApiTransactionDataObj | undefined;
        if (reference && (
          reference.originalTrmTransRef ||
          reference.originalAcqTransRef ||
          reference.originalAcqId !== undefined ||
          reference.originalTrxDate
        )) {
          txData = new timapi.TransactionData();
          if (reference.originalTrmTransRef) txData.originalTrmTransRef = reference.originalTrmTransRef;
          if (reference.originalAcqTransRef) txData.originalAcqTransRef = reference.originalAcqTransRef;
          if (reference.originalAcqId !== undefined) txData.originalAcqId = reference.originalAcqId;
          if (reference.originalTrxDate) txData.originalTrxDate = reference.originalTrxDate;
        }

        this._terminal!.transactionAsync(
          timapi.constants.TransactionType.credit,
          new timapi.Amount(amountCents, timapi.constants.Currency.AUD),
          txData,
        );
      } catch (err) {
        this._pendingTransaction = null;
        this._inFlightTxType = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Reversal ─────────────────────────────────────────────────────────────────

  reversal(
    amountCents: number,
    onStatus?: (msg: string) => void,
  ): Promise<AdapterTransactionResult> {
    if (!this._terminal) throw new Error('Adapter not initialized');
    if (this._pendingTransaction) throw new Error('A transaction is already in progress');

    this._logger.info('reversal_start', { amountCents });

    return new Promise((resolve, reject) => {
      this._pendingTransaction = { resolve, reject, onStatus };
      this._inFlightTxType = 'reversal';

      const timapi = window.timapi!;
      try {
        this._terminal!.transactionAsync(
          timapi.constants.TransactionType.reversal,
          new timapi.Amount(amountCents, timapi.constants.Currency.AUD),
        );
      } catch (err) {
        this._pendingTransaction = null;
        this._inFlightTxType = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Commit ──────────────────────────────────────────────────────────────────

  commit(): Promise<AdapterCommitResult> {
    if (!this._terminal) throw new Error('Adapter not initialized');
    if (this._pendingCommit) throw new Error('A commit is already in progress');

    // §1.4: "A Reversal/Void does not require a Commit". Refuse the call so
    // higher layers that accidentally fan-out a commit after a reversal
    // (e.g. a future autoCommit=false code path) are corrected at review
    // time rather than silently double-committing on the terminal.
    if (this._lastApprovedTxType === 'reversal') {
      this._logger.warn('commit_blocked_after_reversal', {
        reason: 'ANZ Validation §1.4 — reversal does not require commit',
      });
      return Promise.resolve({
        success:       false,
        errorMessage:  'Commit is not required after a reversal (ANZ Validation §1.4)',
        errorCategory: 'unsupported_operation',
      });
    }

    this._logger.info('commit_start', { lastApprovedType: this._lastApprovedTxType });

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

  // ── Rollback ────────────────────────────────────────────────────────────────
  // §1.4 / SDK guide: rollbackAsync() cancels a just-approved transaction
  // before commitAsync() is called. Only meaningful when autoCommit=false.
  // Like a reversal, rollback does not require a commit.
  //
  // When the last approved tx was a reversal there is nothing to rollback;
  // we surface a friendly error rather than passing the call to the SDK.

  rollback(): Promise<AdapterRollbackResult> {
    if (!this._terminal) throw new Error('Adapter not initialized');
    if (this._pendingRollback) throw new Error('A rollback is already in progress');
    if (this._pendingCommit) {
      return Promise.resolve({
        success:       false,
        errorMessage:  'Cannot rollback while a commit is in progress',
        errorCategory: 'commit_failure',
      });
    }
    if (this._lastApprovedTxType === null) {
      return Promise.resolve({
        success:       false,
        errorMessage:  'Nothing to rollback — no recent approved transaction',
        errorCategory: 'unsupported_operation',
      });
    }
    if (this._lastApprovedTxType === 'reversal') {
      return Promise.resolve({
        success:       false,
        errorMessage:  'Cannot rollback a reversal (ANZ Validation §1.4)',
        errorCategory: 'unsupported_operation',
      });
    }

    this._logger.info('rollback_start', { lastApprovedType: this._lastApprovedTxType });

    return new Promise((resolve, reject) => {
      this._pendingRollback = { resolve, reject };
      try {
        this._terminal!.rollbackAsync();
      } catch (err) {
        this._pendingRollback = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────
  // In SDK v26-01: cancel() is NOT async and has no callback.
  // Best-effort — the terminal may ignore it depending on state.
  // Cannot cancel commit or rollback.

  cancel(): void {
    if (!this._terminal) return;
    this._logger.info('cancel_requested', {});
    try {
      this._terminal.cancel();
    } catch (err) {
      this._logger.warn('cancel_failed', { error: String(err) });
    }
  }

  // ── Explicit lifecycle: Connect ─────────────────────────────────────────────
  // Section 1.2: Connect — establishes the underlying transport (WebSocket/TCP)
  // between the ECR and the terminal. Must succeed before login/activate.
  // Required for hardware that does not respond to the SDK's pre-automatism
  // chain triggered via transactionAsync (e.g. live Castles S1F2 firmware
  // ignores the FeatureRequest that pre-automatisms wrap Login in).

  connect(timeoutMs = 15_000): Promise<void> {
    if (!this._terminal) throw new Error('Adapter not initialized — call initialize() first');

    this._logger.info('connect_start', {});

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingConnect = null;
        reject(new Error('connect timed out'));
      }, timeoutMs);

      this._pendingConnect = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject:  (err) => { clearTimeout(timer); reject(err); },
      };

      try {
        if (typeof this._terminal!.connectAsync === 'function') {
          this._terminal!.connectAsync();
        } else {
          clearTimeout(timer);
          this._pendingConnect = null;
          reject(new Error('connectAsync not available on this SDK build'));
        }
      } catch (err) {
        clearTimeout(timer);
        this._pendingConnect = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Explicit lifecycle: Login ───────────────────────────────────────────────
  // Section 1.2: Login() — activates a communication session between ECR and terminal.
  // Sets print options, POS identifier and manufacturer flags in the terminal object.
  // After completing: updates features, brands and terminal identifier in terminal instance.

  login(timeoutMs = 30_000): Promise<void> {
    if (!this._terminal) throw new Error('Adapter not initialized — call initialize() first');

    this._logger.info('login_start', {});

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingLogin = null;
        reject(new Error('login timed out'));
      }, timeoutMs);

      this._pendingLogin = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject:  (err) => { clearTimeout(timer); reject(err); },
      };

      try {
        this._terminal!.loginAsync?.();
      } catch (err) {
        clearTimeout(timer);
        this._pendingLogin = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Explicit lifecycle: Activate ────────────────────────────────────────────
  // Section 1.2: Activate — opens a user shift.
  // Multiple transactions can be performed until deactivate() is called.

  activate(timeoutMs = 30_000): Promise<void> {
    if (!this._terminal) throw new Error('Adapter not initialized');

    this._logger.info('activate_start', {});

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingActivate = null;
        reject(new Error('activate timed out'));
      }, timeoutMs);

      this._pendingActivate = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject:  (err) => { clearTimeout(timer); reject(err); },
      };

      try {
        this._terminal!.activateAsync?.();
      } catch (err) {
        clearTimeout(timer);
        this._pendingActivate = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Explicit lifecycle: Deactivate ──────────────────────────────────────────
  // Section 1.2: Deactivate — closes the user shift and delivers transaction counters.
  // MUST be called before balance() (end of day).
  // Section 3.10: "Before calling the balance function, POS/ECR should be in deactivate state."

  deactivate(timeoutMs = 30_000): Promise<unknown> {
    if (!this._terminal) throw new Error('Adapter not initialized');

    this._logger.info('deactivate_start', {});

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingDeactivate = null;
        reject(new Error('deactivate timed out'));
      }, timeoutMs);

      this._pendingDeactivate = {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject:  (err)  => { clearTimeout(timer); reject(err); },
      };

      try {
        this._terminal!.deactivateAsync?.();
      } catch (err) {
        clearTimeout(timer);
        this._pendingDeactivate = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Explicit lifecycle: Logout ──────────────────────────────────────────────
  // Section 1.2: Logout — terminates the active communication session between ECR and terminal.

  logout(timeoutMs = 30_000): Promise<void> {
    if (!this._terminal) throw new Error('Adapter not initialized');

    this._logger.info('logout_start', {});

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingLogout = null;
        reject(new Error('logout timed out'));
      }, timeoutMs);

      this._pendingLogout = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject:  (err) => { clearTimeout(timer); reject(err); },
      };

      try {
        this._terminal!.logoutAsync?.();
      } catch (err) {
        clearTimeout(timer);
        this._pendingLogout = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Explicit lifecycle: Disconnect ──────────────────────────────────────────
  // Section 1.2: Disconnect — closes the connection to the EFT/Terminal.
  // Terminal will display "Disconnected / Connect ECR" after this.

  disconnect(timeoutMs = 15_000): Promise<void> {
    if (!this._terminal) return Promise.resolve();

    this._logger.info('disconnect_start', {});

    return new Promise((resolve, reject) => {
      // Timeout resolves rather than rejects — we always want to proceed with dispose
      const timer = setTimeout(() => {
        this._pendingDisconnect = null;
        this._logger.warn('disconnect_timeout', {});
        resolve(); // Best-effort — still resolve so dispose() can proceed
      }, timeoutMs);

      this._pendingDisconnect = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject:  (err) => { clearTimeout(timer); reject(err); },
      };

      try {
        this._terminal!.disconnectAsync?.();
      } catch (err) {
        clearTimeout(timer);
        this._pendingDisconnect = null;
        // Disconnect failures are non-fatal — resolve anyway
        this._logger.warn('disconnect_error', { error: String(err) });
        resolve();
      }
    });
  }

  // ── Application information ─────────────────────────────────────────────────

  getApplicationInformation(timeoutMs = 15_000): Promise<TerminalApplicationInfo> {
    if (!this._terminal) throw new Error('Adapter not initialized');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingApplicationInfo = null;
        reject(new Error('applicationInformation timed out'));
      }, timeoutMs);

      this._pendingApplicationInfo = {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject:  (err)  => { clearTimeout(timer); reject(err); },
      };

      try {
        this._terminal!.applicationInformationAsync();
      } catch (err) {
        clearTimeout(timer);
        this._pendingApplicationInfo = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Last transaction information (§3.11 exception recovery) ────────────────

  /**
   * Ask the terminal for its view of the last transaction. Used when the ECR
   * crashed between authorisation and commit (state=unknown_outcome) — the
   * returned auth code / trmTransRef lets the operator confirm whether the
   * terminal actually captured the sale.
   */
  getLastTransactionInformation(timeoutMs = 15_000): Promise<LastTransactionInformation> {
    if (!this._terminal) throw new Error('Adapter not initialized');
    if (!this._terminal.transactionInformationAsync) {
      return Promise.reject(new Error('transactionInformationAsync not supported by this SDK build'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingTransactionInfo = null;
        reject(new Error('transactionInformation timed out'));
      }, timeoutMs);

      this._pendingTransactionInfo = {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject:  (err)  => { clearTimeout(timer); reject(err); },
      };

      try {
        this._terminal!.transactionInformationAsync!();
      } catch (err) {
        clearTimeout(timer);
        this._pendingTransactionInfo = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Balance ─────────────────────────────────────────────────────────────────

  balance(timeoutMs = 60_000): Promise<Record<string, unknown>> {
    if (!this._terminal) throw new Error('Adapter not initialized');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingBalance = null;
        reject(new Error('balance timed out'));
      }, timeoutMs);

      this._pendingBalance = {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject:  (err)  => { clearTimeout(timer); reject(err); },
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
    if (this._terminal) {
      if (this._listener) {
        try { this._terminal.removeListener(this._listener); } catch { /* ignore */ }
      }
      try { this._terminal.dispose(); } catch { /* ignore */ }
    }
    this._terminal  = null;
    this._listener  = null;
    this._config    = null;
    this._pendingTransaction = null;
    this._pendingCommit      = null;
    this._pendingRollback    = null;
    this._pendingApplicationInfo = null;
    this._pendingBalance     = null;
    this._pendingTransactionInfo = null;
    this._lastApprovedTxType = null;
    this._inFlightTxType     = null;
    this._logger.info('adapter_disposed', {});
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Extract merchant and cardholder receipt text from SDK PrintData */
  private _extractReceipts(printData: TimPrintData | undefined): {
    merchant?: string;
    cardholder?: string;
  } {
    if (!printData?.receipts?.length) return {};
    const timapi = window.timapi;
    if (!timapi) return {};

    let merchant: string | undefined;
    let cardholder: string | undefined;

    for (const receipt of printData.receipts) {
      const recipientName = (receipt.recipient as TimApiEnumValue)?.name;
      if (recipientName === 'merchant') {
        merchant = receipt.value;
      } else if (recipientName === 'cardholder') {
        cardholder = receipt.value;
      }
    }

    return { merchant, cardholder };
  }

  /** Convert SDK ResultCode (enum value or string) to a plain string */
  private _resultCodeString(code: string | TimApiEnumValue | undefined): string | undefined {
    if (!code) return undefined;
    if (typeof code === 'string') return code;
    return (code as TimApiEnumValue).name ?? String(code);
  }
}
