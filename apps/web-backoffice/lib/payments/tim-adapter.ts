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
  hardwareInformationCompleted?(event: TimTransactionEvent, data: unknown): void;
  balanceCompleted?(event: TimTransactionEvent, data: unknown): void;
  /** Receipts ready for printing — called automatically by DefaultTerminalListener */
  printReceipts?(terminal: TimApiTerminal, printData: TimPrintData): void;
  requestCompleted?(event: TimTransactionEvent, data: unknown): void;
  errorNotification?(terminal: TimApiTerminal, response: unknown): void;
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
  /** Standard transaction (purchase, credit, reversal) */
  transactionAsync(type: TimApiEnumValue, amount: TimApiAmount): void;
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

  // Pending resolvers for explicit lifecycle calls
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

    // ── Mixed-content bridge routing ────────────────────────────────────────
    // Browsers block ws:// from https:// pages to non-loopback addresses.
    // When this condition is met, route through the local Hardware Bridge
    // (ws://127.0.0.1:9999/SIXml) which proxies to the real terminal.
    const isHttps    = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isLoopback = /^(127\.|localhost|::1)/.test(config.terminalIp.trim());

    if (isHttps && !isLoopback) {
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
          'Cannot reach the ANZ terminal from this browser (HTTPS blocks ws:// to LAN addresses). ' +
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

    // Fail fast on misconfiguration — empty integratorId causes the SDK to
    // throw `invalidArgument` with no actionable message, which has surfaced
    // for operators as a silently-failing Pair button.
    if (!config.integratorId?.trim()) {
      throw new Error(
        'ANZ integrator ID missing. This is the ElevatedPOS vendor ID issued by ANZ Worldline. ' +
        'Reload POS Settings or contact support — the /api/tyro/config endpoint should provide it.',
      );
    }
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

    // integratorId: only set if non-empty — an empty string causes invalidArgument.
    // The value is the ANZ Worldline-issued vendor ID for ElevatedPOS.
    if (config.integratorId) {
      settings.integratorId = config.integratorId;
    }

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

        if (event.exception === undefined) {
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
          pending.resolve({
            approved:       false,
            resultCode:     this._resultCodeString(event.exception.resultCode),
            declineReason:  event.exception.message
                          ?? `Declined (${this._resultCodeString(event.exception.resultCode)})`,
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
          pending.resolve({
            success:      false,
            resultCode:   this._resultCodeString(event.exception.resultCode),
            errorMessage: event.exception.message,
          });
        }
      },

      // ── Connect completed ──────────────────────────────────────────────────
      connectCompleted: (event: TimConnectionEvent) => {
        const ok = event.exception === undefined;
        this._logger.info('connect_completed', {
          success:    ok,
          resultCode: ok ? undefined : this._resultCodeString(event.exception!.resultCode),
          message:    ok ? undefined : event.exception!.message,
        });
        if (ok) {
          this._pendingTransaction?.onStatus?.('Terminal connected');
          return;
        }
        // WebSocket / TCP connect failure — fail pending login/activate
        // immediately so the operator sees the error in seconds instead of
        // waiting 30 s for the login() timeout. Common causes: wrong IP/port,
        // simulator not running, firewall blocking the port.
        const errMsg = event.exception!.message
          ?? `connect failed (${this._resultCodeString(event.exception!.resultCode)})`;
        const err = new Error(errMsg);
        const pendingLogin = this._pendingLogin;
        if (pendingLogin) {
          this._pendingLogin = null;
          pendingLogin.reject(err);
        }
        const pendingActivate = this._pendingActivate;
        if (pendingActivate) {
          this._pendingActivate = null;
          pendingActivate.reject(err);
        }
        const pendingTx = this._pendingTransaction;
        if (pendingTx) {
          this._pendingTransaction = null;
          pendingTx.reject(err);
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
          pending.resolve(data as Record<string, unknown>);
        } else {
          pending.reject(new Error(
            event.exception.message ?? `balance failed (${this._resultCodeString(event.exception.resultCode)})`
          ));
        }
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
      },

      // ── Error notification ─────────────────────────────────────────────────
      errorNotification: (_terminal: TimApiTerminal, response: unknown) => {
        this._logger.warn('error_notification', { response: String(response) });
      },
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
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Credit (Refund) ──────────────────────────────────────────────────────────
  // NOTE: In TIM API v26-01 the refund transaction type is "credit", not "refund"

  refund(
    amountCents: number,
    onStatus?: (msg: string) => void,
  ): Promise<AdapterTransactionResult> {
    if (!this._terminal) throw new Error('Adapter not initialized');
    if (this._pendingTransaction) throw new Error('A transaction is already in progress');

    this._logger.info('refund_start', { amountCents });

    return new Promise((resolve, reject) => {
      this._pendingTransaction = { resolve, reject, onStatus };

      const timapi = window.timapi!;
      try {
        this._terminal!.transactionAsync(
          timapi.constants.TransactionType.credit,
          new timapi.Amount(amountCents, timapi.constants.Currency.AUD),
        );
      } catch (err) {
        this._pendingTransaction = null;
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

      const timapi = window.timapi!;
      try {
        this._terminal!.transactionAsync(
          timapi.constants.TransactionType.reversal,
          new timapi.Amount(amountCents, timapi.constants.Currency.AUD),
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
    this._pendingApplicationInfo = null;
    this._pendingBalance     = null;
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
