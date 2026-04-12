/**
 * ANZ Worldline TIM API – Browser POS client
 *
 * The TIM (Terminal Integration Module) API JS SDK communicates with the
 * physical EFTPOS terminal via WebSocket on port 80 using the SIXml protocol.
 * This file wraps the event-based SDK in a promise-based API.
 *
 * ─── Setup ───────────────────────────────────────────────────────────────────
 * 1. Obtain `timapi.js` and `timapi.wasm` from:
 *    https://start.portal.anzworldline-solutions.com.au/
 *    (requires ANZ Worldline ISV/integrator registration)
 *
 * 2. Place both files in:
 *    apps/web-backoffice/public/timapi/timapi.js
 *    apps/web-backoffice/public/timapi/timapi.wasm
 *
 * 3. Set ANZ_INTEGRATOR_ID in your environment (provided by ANZ Worldline).
 *
 * 4. In the dashboard → Integrations → ANZ Worldline:
 *    - Enter the terminal IP address
 *    - Leave port at 80 (WebSocket default)
 *    - Switch terminal to ECR/Integrated mode (section 2.16 of the TIM API guide)
 */

// ─── TypeScript declarations for the timapi global ───────────────────────────

declare global {
  interface Window {
    onTimApiReady?: () => void;
    timapi?: TimApiNamespace;
  }
}

interface TimApiNamespace {
  TerminalSettings: new () => TimApiSettings;
  Terminal: new (settings: TimApiSettings) => TimApiTerminal;
  Amount: new (amountCents: number, currency: string) => object;
  constants: {
    TransactionType: { purchase: string; refund: string; reversal: string };
    Currency: { AUD: string };
  };
}

interface TimApiSettings {
  connectionIPString: string;
  connectionIPPort: number;
  autoCommit: boolean;
  integratorId: string;
}

export interface TimApiTerminal {
  setPosId(id: string): void;
  addListener(listener: TimApiListener): void;
  removeListener(listener: TimApiListener): void;
  transactionAsync(type: string, amount: object): void;
  commitAsync(): void;
  cancelAsync(): void;
}

interface TimApiTransactionEvent {
  exception?: { resultCode: string; message?: string };
}

interface TimApiTransactionData {
  transactionReference?: string;
  authorisationCode?: string;
  maskedPan?: string;
  cardType?: string;
  receiptText?: string;
  merchantReceiptText?: string;
  customerReceiptText?: string;
  rrn?: string;
  stan?: string;
  amount?: number;
}

interface TimApiConnectionEvent {
  data?: { state?: string };
}

interface TimApiDisplayEvent {
  data?: { text?: string };
}

interface TimApiListener {
  transactionCompleted(event: TimApiTransactionEvent, data: TimApiTransactionData): void;
  connectionStateChanged?(event: TimApiConnectionEvent, data: unknown): void;
  displayTextChanged?(event: TimApiDisplayEvent, data: unknown): void;
  receiptGenerated?(event: unknown, data: unknown): void;
}

// ─── SDK loader ───────────────────────────────────────────────────────────────

let _sdkLoadPromise: Promise<void> | null = null;
let _sdkReady = false;

/**
 * Dynamically load timapi.js from /timapi/timapi.js.
 * Resolves when the SDK fires `window.onTimApiReady`.
 * Rejects if the file is not found (404).
 */
export function loadTimApi(): Promise<void> {
  if (_sdkReady && typeof window !== 'undefined' && window.timapi) return Promise.resolve();
  if (_sdkLoadPromise) return _sdkLoadPromise;

  _sdkLoadPromise = new Promise((resolve, reject) => {
    // Must set onTimApiReady BEFORE inserting the script tag
    window.onTimApiReady = () => {
      _sdkReady = true;
      resolve();
    };

    const script = document.createElement('script');
    script.src = '/timapi/timapi.js';
    script.onerror = () => {
      _sdkLoadPromise = null;
      reject(new Error(
        'ANZ TIM API SDK not found.\n\n' +
        'Place timapi.js and timapi.wasm in /public/timapi/ and redeploy.\n' +
        'Download from: https://start.portal.anzworldline-solutions.com.au/'
      ));
    };
    document.head.appendChild(script);
  });

  return _sdkLoadPromise;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface AnzTIMResult {
  approved: boolean;
  transactionRef?: string;
  authCode?: string;
  cardLast4?: string;
  cardType?: string;
  rrn?: string;
  merchantReceipt?: string;
  customerReceipt?: string;
  declineCode?: string;
  declineReason?: string;
}

export interface AnzTIMConfig {
  terminalIp: string;
  /** WebSocket port — ANZ TIM API default is 80 */
  terminalPort?: number;
  integratorId: string;
  posId?: string;
}

// ─── Terminal session ─────────────────────────────────────────────────────────

/**
 * Represents a single ANZ terminal session.
 * Create one per payment attempt; discard after completion.
 *
 * ```typescript
 * const session = new AnzTerminalSession();
 * const result = await session.purchase(config, amountCents, onStatus);
 * ```
 */
export class AnzTerminalSession {
  private _terminal: TimApiTerminal | null = null;
  private _cancelled = false;
  private _resolve: ((r: AnzTIMResult) => void) | null = null;
  private _reject: ((e: Error) => void) | null = null;

  get cancelled() { return this._cancelled; }

  purchase(
    config: AnzTIMConfig,
    amountCents: number,
    onStatus?: (msg: string) => void,
  ): Promise<AnzTIMResult> {
    return new Promise(async (resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;

      try {
        onStatus?.('Loading ANZ SDK…');
        await loadTimApi();

        if (this._cancelled) {
          resolve({ approved: false, declineReason: 'Cancelled before transaction started' });
          return;
        }

        const timapi = window.timapi!;

        onStatus?.('Connecting to terminal…');

        const settings = new timapi.TerminalSettings();
        settings.connectionIPString = config.terminalIp.trim();
        settings.connectionIPPort   = config.terminalPort ?? 80;
        settings.autoCommit         = false;
        settings.integratorId       = config.integratorId;

        const terminal = new timapi.Terminal(settings);
        this._terminal = terminal;
        terminal.setPosId(config.posId ?? 'ECR-01');

        const self = this;

        terminal.addListener({
          transactionCompleted(event: TimApiTransactionEvent, data: TimApiTransactionData) {
            if (event.exception === undefined) {
              // Approved — commit to finalise the transaction
              try { terminal.commitAsync(); } catch { /* non-fatal */ }

              resolve({
                approved:       true,
                transactionRef: data.transactionReference,
                authCode:       data.authorisationCode,
                cardLast4:      data.maskedPan?.slice(-4),
                cardType:       data.cardType,
                rrn:            data.rrn,
                merchantReceipt: data.merchantReceiptText ?? data.receiptText,
                customerReceipt: data.customerReceiptText,
              });
            } else {
              resolve({
                approved:      false,
                declineCode:   event.exception.resultCode,
                declineReason: event.exception.message ?? `Declined (${event.exception.resultCode})`,
              });
            }
            self._resolve = null;
            self._reject  = null;
          },

          connectionStateChanged(_event: TimApiConnectionEvent, _data: unknown) {
            onStatus?.('Terminal connected');
          },

          displayTextChanged(_event: TimApiDisplayEvent, data: unknown) {
            const text = (data as Record<string, unknown>)?.['text'];
            if (typeof text === 'string' && text.trim()) {
              onStatus?.(text.trim());
            }
          },
        });

        onStatus?.('Presenting transaction…');
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

  /** Cancel any in-progress transaction. Safe to call multiple times. */
  cancel() {
    this._cancelled = true;
    try { this._terminal?.cancelAsync(); } catch { /* ignore */ }
    // If we're still waiting for a resolve (e.g. sdk loading), resolve now
    if (this._resolve) {
      this._resolve({ approved: false, declineReason: 'Cancelled by operator' });
      this._resolve = null;
      this._reject  = null;
    }
  }
}
