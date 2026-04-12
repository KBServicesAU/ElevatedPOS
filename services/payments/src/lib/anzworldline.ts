/**
 * ANZ Worldline TIM (Terminal Integration Module) — Server-side types
 *
 * NOTE: The TIM API uses the WebSocket/SIXml protocol via the timapi.js JS SDK.
 * Direct HTTP/JSON calls to the terminal do NOT work.
 *
 * ─── Browser & Android POS integration ──────────────────────────────────────
 * Payment is initiated client-side (browser or Android WebView) using:
 *   - apps/web-backoffice/lib/timapi-client.ts   (browser POS)
 *   - apps/mobile/assets/timapi/timapi-bridge.html (Android WebView)
 *
 * Both require:
 *   - timapi.js + timapi.wasm (from https://start.portal.anzworldline-solutions.com.au/)
 *   - ANZ_INTEGRATOR_ID env var (issued by ANZ Worldline to ElevatedPOS)
 *   - Terminal configured in ECR/Integrated mode (section 2.16 of TIM API guide)
 *
 * ─── This file ───────────────────────────────────────────────────────────────
 * Kept for type definitions and potential server-side terminal status checks.
 * The AnzWorldlineTIMClient class uses HTTP only for /v1/status (health check).
 */

// ─── Config ────────────────────────────────────────────────────────────────

export interface TIMConfig {
  /** IPv4 address of the terminal on the local network, e.g. "192.168.1.100" */
  terminalIp:   string;
  /** WebSocket port — ANZ TIM API default is 80 */
  terminalPort: number;
}

// ─── Request / Response types ──────────────────────────────────────────────

export type TIMTransactionType = 'purchase' | 'refund' | 'reversal';

export interface TIMPurchaseRequest {
  transactionType: 'purchase';
  /** Amount in cents, e.g. 1000 = $10.00 */
  amount:          number;
  /** Optional cash-out amount in cents */
  cashOut?:        number;
  /** Merchant reference / order ID */
  referenceId?:    string;
}

export interface TIMRefundRequest {
  transactionType:       'refund';
  /** Amount in cents to refund */
  amount:                number;
  /** Transaction ID returned from the original purchase */
  originalTransactionId: string;
  referenceId?:          string;
}

export interface TIMReversalRequest {
  transactionType:       'reversal';
  originalTransactionId: string;
}

export type TIMRequest = TIMPurchaseRequest | TIMRefundRequest | TIMReversalRequest;

export interface TIMResponse {
  /** "00" = approved; any other value = declined/error */
  responseCode:      string;
  responseText:      string;
  transactionId?:    string;
  /** 6-digit auth code from the bank */
  authorizationCode?: string;
  /** Card scheme: "VISA", "MASTERCARD", "AMEX", etc. */
  cardType?:         string;
  /** Masked PAN, e.g. "XXXXXXXXXXXX4242" */
  maskedPan?:        string;
  /** Retrieval Reference Number */
  rrn?:              string;
  /** System Trace Audit Number */
  stan?:             string;
  /** Amount that was processed in cents */
  amount?:           number;
  /** Cash out amount in cents (if applicable) */
  cashOutAmount?:    number;
  receiptData?: {
    merchantReceipt?: string;
    customerReceipt?: string;
  };
  /** Raw error detail from terminal if available */
  errorDetail?: string;
}

export interface TIMStatusResponse {
  status:       'ready' | 'busy' | 'offline';
  terminalId?:  string;
  merchantId?:  string;
  softwareVersion?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function isApproved(res: TIMResponse): boolean {
  return res.responseCode === '00';
}

export function mapCardType(cardType?: string): string | undefined {
  if (!cardType) return undefined;
  const map: Record<string, string> = {
    VISA:       'visa',
    MASTERCARD: 'mastercard',
    AMEX:       'amex',
    EFTPOS:     'eftpos',
    DINERS:     'diners',
    JCB:        'jcb',
    UNIONPAY:   'unionpay',
  };
  return map[cardType.toUpperCase()] ?? cardType.toLowerCase();
}

// ─── TIM Client ─────────────────────────────────────────────────────────────

export class AnzWorldlineTIMClient {
  private readonly baseUrl: string;

  constructor(cfg: TIMConfig) {
    this.baseUrl = `http://${cfg.terminalIp}:${cfg.terminalPort}`;
  }

  // ── Low-level HTTP ───────────────────────────────────────────────────────

  private async post<T>(path: string, body: unknown, timeoutMs = 90_000): Promise<{ data: T; httpStatus: number }> {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });

      let data: T;
      const text = await res.text();
      try   { data = JSON.parse(text) as T; }
      catch { data = text as unknown as T;  }

      return { data, httpStatus: res.status };
    } finally {
      clearTimeout(timer);
    }
  }

  private async get<T>(path: string, timeoutMs = 10_000): Promise<{ data: T; httpStatus: number }> {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        signal: controller.signal,
      });

      let data: T;
      const text = await res.text();
      try   { data = JSON.parse(text) as T; }
      catch { data = text as unknown as T;  }

      return { data, httpStatus: res.status };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Public API methods ───────────────────────────────────────────────────

  /**
   * Initiate a card-present purchase.
   * The terminal will prompt the customer — this call blocks until the
   * customer completes or cancels (up to ~90 s).
   */
  async purchase(amountCents: number, referenceId?: string, cashOutCents = 0): Promise<{ data: TIMResponse; httpStatus: number }> {
    return this.post<TIMResponse>('/v1/payments', {
      transactionType: 'purchase',
      amount:          amountCents,
      ...(cashOutCents > 0 ? { cashOut: cashOutCents } : {}),
      ...(referenceId       ? { referenceId }          : {}),
    });
  }

  /**
   * Refund a previous transaction.
   */
  async refund(amountCents: number, originalTransactionId: string, referenceId?: string): Promise<{ data: TIMResponse; httpStatus: number }> {
    return this.post<TIMResponse>('/v1/refunds', {
      transactionType:       'refund',
      amount:                amountCents,
      originalTransactionId,
      ...(referenceId ? { referenceId } : {}),
    });
  }

  /**
   * Reverse (void) a previous transaction.
   */
  async reverse(originalTransactionId: string): Promise<{ data: TIMResponse; httpStatus: number }> {
    return this.post<TIMResponse>('/v1/reversals', {
      transactionType:       'reversal',
      originalTransactionId,
    });
  }

  /**
   * Check whether the terminal is reachable and ready.
   */
  async getStatus(): Promise<{ data: TIMStatusResponse; httpStatus: number }> {
    return this.get<TIMStatusResponse>('/v1/status');
  }

  /**
   * Convenience: returns true if the terminal responds to a status ping.
   */
  async testConnection(): Promise<boolean> {
    try {
      const { httpStatus } = await this.getStatus();
      return httpStatus === 200;
    } catch {
      return false;
    }
  }
}
