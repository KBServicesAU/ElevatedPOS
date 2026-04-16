/**
 * ANZ Worldline TIM API – Browser POS client (legacy wrapper)
 *
 * Wraps the SDK v26-01 event-based API in a simple promise-based interface.
 * For new code, prefer the full state-machine provider in lib/payments/index.ts.
 *
 * ─── Setup ───────────────────────────────────────────────────────────────────
 * 1. Place `timapi.js` and `timapi.wasm` (v26-01) in:
 *    apps/web-backoffice/public/timapi/
 *
 * 2. Set ANZ_INTEGRATOR_ID env var: d23f66c0-546b-482f-b8b6-cb351f94fd31
 *
 * 3. Terminal must be in ECR/Integrated mode.
 *    WebSocket port default: 7784 (SIXml per ANZ validation doc v26-01).
 *
 * SDK reference: https://six-tim.github.io/timapi/doc/js/guide.html
 */

import { isBridgeProxyReady, getBridgePort } from './bridge-health';

// ─── TIM API v26-01 type declarations (scoped to this module) ─────────────────

interface _TimApiEnumValue {
  readonly name: string;
  readonly _value: number;
}

interface _TimApiNamespace {
  TerminalSettings: new () => _TimApiSettings;
  Terminal:         new (settings: _TimApiSettings) => _TimApiTerminal;
  Amount:           new (amountCents: number, currency: string) => object;
  EcrInfo:          new () => _TimApiEcrInfo;
  PrintOption: new (
    recipient: _TimApiEnumValue,
    printFormat: _TimApiEnumValue,
    printWidth: number,
    printFlags: _TimApiEnumValue[],
    receiptSuppressionFlag?: _TimApiEnumValue,
  ) => _TimApiPrintOption;
  constants: {
    TransactionType: {
      purchase:  _TimApiEnumValue;
      credit:    _TimApiEnumValue;  // refund — NOT "refund"
      reversal:  _TimApiEnumValue;
    };
    Currency:    { AUD: string };
    EcrInfoType: { ecrApplication: _TimApiEnumValue };
    Recipient:   { merchant: _TimApiEnumValue; cardholder: _TimApiEnumValue };
    PrintFormat: {
      normal:    _TimApiEnumValue;
      noPrint:   _TimApiEnumValue;
      onDevice?: _TimApiEnumValue;
    };
    Guides:      { retail: _TimApiEnumValue };
  };
}

interface _TimApiSettings {
  connectionIPString: string;
  connectionIPPort:   number;
  integratorId:       string;
  autoCommit:         boolean;
  fetchBrands:        boolean;
  dcc:                boolean;
  partialApproval:    boolean;
  tipAllowed:         boolean;
  enableKeepAlive:    boolean;
}

interface _TimApiEcrInfo {
  type?:              _TimApiEnumValue;
  name?:              string;
  manufacturerName?:  string;
  version?:           string;
  integratorSolution?: string;
}

// PrintOption is frozen after construction by the SDK. Treat it as opaque —
// all options must be passed to the constructor (see _TimApiNamespace.PrintOption).
type _TimApiPrintOption = Readonly<object>;

interface _TimApiTerminal {
  setPosId(id: string): void;
  setUserId(id: number): void;
  addEcrData(ecrInfo: _TimApiEcrInfo): void;
  setPrintOptions(options: _TimApiPrintOption[]): void;
  addListener(listener: _TimApiListener): void;
  /** cancel() is NOT async in SDK v26-01 */
  cancel(): void;
  transactionAsync(type: _TimApiEnumValue, amount: object): void;
  commitAsync(): void;
  getBrands(): Array<{ name?: string }>;
  getTerminalId(): string;
  dispose(): void;
}

interface _TimApiTransactionEvent {
  exception?: {
    resultCode: string | _TimApiEnumValue;
    message?:   string;
    printData?: _TimApiPrintData;
  };
}

interface _TimApiTransactionInformation {
  authCode?:     string;
  trmTransRef?:  string;
  acqTransRef?:  string;
}

interface _TimApiCardData {
  brandName?:                  string;
  cardNumberPrintable?:        string;
  cardNumberPrintableCardholder?: string;
}

interface _TimApiReceipt {
  recipient: _TimApiEnumValue;
  value?:    string;
}

interface _TimApiPrintData {
  receipts?: _TimApiReceipt[];
}

interface _TimApiTransactionResponse {
  transactionInformation?: _TimApiTransactionInformation;
  cardData?:               _TimApiCardData;
  printData?:              _TimApiPrintData;
}

interface _TimApiListener {
  transactionCompleted(event: _TimApiTransactionEvent, data: _TimApiTransactionResponse): void;
  connectCompleted?(event: _TimApiTransactionEvent): void;
  loginCompleted?(event: _TimApiTransactionEvent): void;
  terminalStatusChanged?(terminal: _TimApiTerminal): void;
}

// Global window types for timapi are declared in lib/payments/tim-adapter.ts.
// Use a typed local accessor to avoid duplicate-declaration conflicts.
function _getTimapi(): _TimApiNamespace {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).timapi as _TimApiNamespace;
}

// ─── SDK loader ───────────────────────────────────────────────────────────────

let _sdkLoadPromise: Promise<void> | null = null;
let _sdkReady = false;

export function loadTimApi(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (_sdkReady && typeof window !== 'undefined' && (window as any).timapi) return Promise.resolve();
  if (_sdkLoadPromise) return _sdkLoadPromise;

  _sdkLoadPromise = new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).onTimApiReady = () => {
      _sdkReady = true;
      resolve();
    };
    const script = document.createElement('script');
    script.src = '/timapi/timapi.js';
    script.onerror = () => {
      _sdkLoadPromise = null;
      reject(new Error(
        'ANZ TIM API SDK not found at /timapi/timapi.js.\n' +
        'Place timapi.js (v26-01) and timapi.wasm in /public/timapi/ and redeploy.'
      ));
    };
    document.head.appendChild(script);
  });

  return _sdkLoadPromise;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface AnzTIMResult {
  approved:        boolean;
  transactionRef?: string;  // trmTransRef
  authCode?:       string;
  cardLast4?:      string;
  cardScheme?:     string;  // brandName
  merchantReceipt?: string;
  customerReceipt?: string;
  declineCode?:    string;
  declineReason?:  string;
}

export interface AnzTIMConfig {
  terminalIp:    string;
  terminalPort?: number;
  integratorId:  string;
  posId?:        string;
}

// ─── Helper — extract receipts from v26-01 printData ─────────────────────────

function extractReceipts(printData: _TimApiPrintData | undefined): {
  merchant?: string;
  cardholder?: string;
} {
  if (!printData?.receipts?.length) return {};
  let merchant: string | undefined;
  let cardholder: string | undefined;
  for (const r of printData.receipts) {
    if (r.recipient?.name === 'merchant')   merchant   = r.value;
    if (r.recipient?.name === 'cardholder') cardholder = r.value;
  }
  return { merchant, cardholder };
}

function resultCodeStr(code: string | _TimApiEnumValue | undefined): string {
  if (!code) return '';
  if (typeof code === 'string') return code;
  return code.name ?? String(code);
}

// ─── Terminal session ─────────────────────────────────────────────────────────

export class AnzTerminalSession {
  private _terminal: _TimApiTerminal | null = null;
  private _cancelled = false;
  private _resolve: ((r: AnzTIMResult) => void) | null = null;
  private _reject:  ((e: Error) => void) | null = null;

  get cancelled() { return this._cancelled; }

  purchase(
    config: AnzTIMConfig,
    amountCents: number,
    onStatus?: (msg: string) => void,
  ): Promise<AnzTIMResult> {
    return new Promise(async (resolve, reject) => {
      this._resolve = resolve;
      this._reject  = reject;

      try {
        onStatus?.('Loading ANZ SDK…');
        await loadTimApi();

        if (this._cancelled) {
          resolve({ approved: false, declineReason: 'Cancelled before transaction started' });
          return;
        }

        const timapi = _getTimapi();
        onStatus?.('Connecting to terminal…');

        const settings = new timapi.TerminalSettings();

        // ── Mixed-content bridge routing ──────────────────────────
        // HTTPS pages can't open ws:// to LAN IPs.  Also, our ANZ
        // EftSimulator on 127.0.0.1:7784 speaks raw TCP not WebSocket —
        // the browser's WebSocket handshake against it fails
        // (ta_c_rc_api_connection_lost_terminal).  When a local Hardware
        // Bridge is running we ALWAYS route through it regardless of
        // loopback vs LAN, because the bridge:
        //   • terminates WebSocket from the browser
        //   • forwards bytes to the configured terminal (LAN Castles
        //     via WebSocket, or simulator via raw TCP)
        // so the page doesn't need to know which transport the terminal
        // actually speaks.
        const isHttps    = typeof window !== 'undefined' && window.location.protocol === 'https:';

        if (isHttps) {
          const bridgeReady = await isBridgeProxyReady();
          if (bridgeReady) {
            settings.connectionIPString = '127.0.0.1';
            settings.connectionIPPort   = getBridgePort();
          } else {
            reject(new Error(
              'Cannot reach the ANZ terminal from this browser (HTTPS blocks ws:// to LAN). ' +
              'Install the ElevatedPOS Hardware Bridge on this machine, or use the POS tablet.',
            ));
            return;
          }
        } else {
          settings.connectionIPString = config.terminalIp.trim();
          settings.connectionIPPort   = config.terminalPort ?? 7784;
        }
        settings.integratorId       = config.integratorId;
        settings.autoCommit         = true;   // ANZ validation requirement
        settings.fetchBrands        = true;
        settings.dcc                = false;
        settings.partialApproval    = false;
        settings.tipAllowed         = false;
        settings.enableKeepAlive    = true;

        const terminal = new timapi.Terminal(settings);
        this._terminal = terminal;

        // POS ID — max 6 digits
        terminal.setPosId((config.posId ?? '1').substring(0, 6));
        terminal.setUserId(1);

        // EcrInfo — software identification
        const ecrInfo = new timapi.EcrInfo();
        ecrInfo.type            = timapi.constants.EcrInfoType.ecrApplication;
        ecrInfo.name            = 'ElevatedPOS';
        ecrInfo.manufacturerName = 'ElevatedPOS Pty Ltd';
        ecrInfo.version         = '1.0';
        terminal.addEcrData(ecrInfo);

        // PrintOptions — terminal sends receipt data to ECR, POS handles the
        // printing.  PrintOption is frozen after construction (it calls
        // Object.freeze(this) in its constructor), so ALL options must be
        // passed to the constructor — field assignment after the fact throws
        // "Cannot assign to read only property 'recipient'".
        // Signature: new PrintOption(recipient, printFormat, width, flags)
        terminal.setPrintOptions([
          new timapi.PrintOption(
            timapi.constants.Recipient.merchant,
            timapi.constants.PrintFormat.normal,
            40,
            [],
          ),
          new timapi.PrintOption(
            timapi.constants.Recipient.cardholder,
            timapi.constants.PrintFormat.normal,
            40,
            [],
          ),
        ]);

        terminal.addListener({
          transactionCompleted: (event: _TimApiTransactionEvent, data: _TimApiTransactionResponse) => {
            if (event.exception === undefined) {
              // Approved — autoCommit=true so no manual commit needed
              const { merchant, cardholder } = extractReceipts(data.printData);
              resolve({
                approved:        true,
                transactionRef:  data.transactionInformation?.trmTransRef,
                authCode:        data.transactionInformation?.authCode,
                cardLast4:       data.cardData?.cardNumberPrintable?.slice(-4)
                              ?? data.cardData?.cardNumberPrintableCardholder?.slice(-4),
                cardScheme:      data.cardData?.brandName,
                merchantReceipt: merchant,
                customerReceipt: cardholder,
              });
            } else {
              const { merchant, cardholder } = extractReceipts(event.exception.printData);
              resolve({
                approved:        false,
                declineCode:     resultCodeStr(event.exception.resultCode),
                declineReason:   event.exception.message ?? `Declined (${resultCodeStr(event.exception.resultCode)})`,
                merchantReceipt: merchant,
                customerReceipt: cardholder,
              });
            }
            this._resolve = null;
            this._reject  = null;
          },

          connectCompleted: (_event: _TimApiTransactionEvent) => {
            onStatus?.('Terminal connected');
          },

          loginCompleted: (_event: _TimApiTransactionEvent) => {
            onStatus?.('Terminal ready');
          },
        });

        onStatus?.('Presenting transaction…');
        // SDK v26-01: transactionAsync takes only type and amount (no referenceId)
        terminal.transactionAsync(
          timapi.constants.TransactionType.purchase,
          new timapi.Amount(amountCents, timapi.constants.Currency.AUD),
        );
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this._resolve = null;
        this._reject  = null;
        reject(error);
      }
    });
  }

  /** Cancel in-progress transaction (best-effort). */
  cancel() {
    this._cancelled = true;
    try {
      // SDK v26-01: cancel() is NOT async
      this._terminal?.cancel();
    } catch { /* ignore */ }

    if (this._resolve) {
      this._resolve({ approved: false, declineReason: 'Cancelled by operator' });
      this._resolve = null;
      this._reject  = null;
    }
  }
}
