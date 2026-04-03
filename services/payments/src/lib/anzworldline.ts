/**
 * ANZ Worldline API Client
 *
 * REST API v2 — HMAC-SHA256 authentication
 * Test:  https://payment.preprod.anzworldline-solutions.com.au
 * Live:  https://payment.anzworldline-solutions.com.au
 *
 * Docs: https://docs.anzworldline-solutions.com.au/en/api-reference
 */

import crypto from 'crypto';

// ─── Config ────────────────────────────────────────────────────────────────

export interface AnzWorldlineConfig {
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  environment: 'preprod' | 'production';
}

const BASE_URLS: Record<'preprod' | 'production', string> = {
  preprod:    'https://payment.preprod.anzworldline-solutions.com.au',
  production: 'https://payment.anzworldline-solutions.com.au',
};

// ─── Request / Response types ──────────────────────────────────────────────

export interface AnzCardData {
  cardholderName: string;
  cardNumber:     string;
  cvv:            string;
  /** MMYY format */
  expiryDate:     string;
}

export interface AnzCreatePaymentRequest {
  /** Amount in cents (e.g. 1000 = $10.00 AUD) */
  amountCents:         number;
  currency:            string;
  merchantReference:   string;
  card?:               AnzCardData;
  /** Use a stored token instead of raw card data */
  token?:              string;
  /** Skip 3-D Secure (use true for card-present / MOTO) */
  skipAuthentication?: boolean;
  customer?: {
    firstName?: string;
    lastName?:  string;
    email?:     string;
  };
}

export interface AnzAmountOfMoney {
  amount:       number;
  currencyCode: string;
}

export interface AnzCardOutput {
  paymentProductId?:   number;
  authorisationCode?:  string;
  card?: {
    cardNumber?:     string;   // masked
    expiryDate?:     string;
    cardholderName?: string;
  };
}

export interface AnzPaymentOutput {
  amountOfMoney?:                      AnzAmountOfMoney;
  cardPaymentMethodSpecificOutput?:    AnzCardOutput;
  references?: {
    merchantReference?: string;
    acquirerReference?: string;
  };
}

export interface AnzStatusOutput {
  isAuthorized?:  boolean;
  isRefundable?:  boolean;
  isCancellable?: boolean;
}

export interface AnzPaymentResponse {
  id:     string;
  status: {
    statusCode:    number;
    statusOutput?: AnzStatusOutput;
  };
  paymentOutput?:  AnzPaymentOutput;
  merchantAction?: {
    actionType?:  string;
    redirectData?: { redirectURL?: string };
  };
}

export interface AnzRefundResponse {
  id:     string;
  status: { statusCode: number };
  refundOutput?: {
    amountOfMoney?: AnzAmountOfMoney;
  };
}

export interface AnzCaptureResponse {
  id:     string;
  status: { statusCode: number };
  captureOutput?: {
    amountOfMoney?: AnzAmountOfMoney;
  };
}

export interface AnzCancelResponse {
  payment?: {
    id:     string;
    status: { statusCode: number };
  };
}

export interface AnzErrorResponse {
  errorId?:  string;
  errors?:   { code: string; message: string; propertyName?: string }[];
}

// ─── Status mapping ────────────────────────────────────────────────────────

/**
 * ANZ Worldline status codes:
 *  0    – Created / pending
 *  5    – Pending authentication
 *  9    – Payment pending
 * 100   – Rejected by 3DS
 * 120   – Authentication not required (card not enrolled)
 * 200   – Authorised (pending capture)
 * 220   – Authorised (auto-capture requested)
 * 500   – Captured / settled
 * 600   – Captured
 * 800   – Paid
 * 900   – Refunded
 * 1000+ – Various declined/error codes
 */
export function mapAnzStatusCode(code: number): 'approved' | 'declined' | 'pending' | 'refunded' {
  if ([200, 220, 500, 600, 800].includes(code)) return 'approved';
  if (code === 900)                              return 'refunded';
  if (code >= 1000)                             return 'declined';
  return 'pending';
}

/** Map ANZ payment product ID → card scheme name */
export function mapProductIdToScheme(id?: number): string | undefined {
  const map: Record<number, string> = {
    1:   'visa',
    2:   'amex',
    3:   'mastercard',
    117: 'unionpay',
    130: 'jcb',
    132: 'diners',
  };
  return id !== undefined ? map[id] : undefined;
}

// ─── HMAC-SHA256 auth helpers ───────────────────────────────────────────────

function rfc1123Now(): string {
  return new Date().toUTCString();
}

function hmacSha256Base64(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('base64');
}

/**
 * Build the string-to-hash per the Worldline spec:
 *
 *   POST:   "<METHOD>\n<Content-Type>\n<Date>\n<URI path>\n"
 *   GET/DELETE: "<METHOD>\n\n<Date>\n<URI path>\n"
 */
function buildStringToHash(method: 'GET' | 'POST' | 'DELETE', uriPath: string, date: string): string {
  const contentType = method === 'POST' ? 'application/json; charset=utf-8' : '';
  return `${method}\n${contentType}\n${date}\n${uriPath}\n`;
}

function buildAuthHeader(
  apiKey: string,
  apiSecret: string,
  method: 'GET' | 'POST' | 'DELETE',
  uriPath: string,
  date: string,
): string {
  const str  = buildStringToHash(method, uriPath, date);
  const sig  = hmacSha256Base64(str, apiSecret);
  return `GCS v1HMAC:${apiKey}:${sig}`;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class AnzWorldlineClient {
  private readonly cfg:     AnzWorldlineConfig;
  private readonly baseUrl: string;

  constructor(cfg: AnzWorldlineConfig) {
    this.cfg     = cfg;
    this.baseUrl = BASE_URLS[cfg.environment];
  }

  // ── Low-level HTTP ───────────────────────────────────────────────────────

  private async request<T>(
    method:  'GET' | 'POST' | 'DELETE',
    path:    string,
    body?:   unknown,
  ): Promise<{ data: T; httpStatus: number }> {
    const date     = rfc1123Now();
    const fullPath = `/v2/${this.cfg.merchantId}${path}`;
    const auth     = buildAuthHeader(this.cfg.apiKey, this.cfg.apiSecret, method, fullPath, date);

    const headers: Record<string, string> = {
      Authorization: auth,
      Date:          date,
    };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    const res = await fetch(`${this.baseUrl}${fullPath}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    let data: T;
    const text = await res.text();
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }

    return { data, httpStatus: res.status };
  }

  // ── Public API methods ───────────────────────────────────────────────────

  /** POST /v2/{merchantId}/payments */
  async createPayment(req: AnzCreatePaymentRequest): Promise<{ data: AnzPaymentResponse; httpStatus: number }> {
    const body: Record<string, unknown> = {
      order: {
        amountOfMoney: {
          amount:       req.amountCents,
          currencyCode: req.currency,
        },
        references: {
          merchantReference: req.merchantReference,
        },
        ...(req.customer && {
          customer: {
            ...(req.customer.email && {
              contactDetails: { emailAddress: req.customer.email },
            }),
            ...((req.customer.firstName || req.customer.lastName) && {
              name: {
                ...(req.customer.firstName && { firstName: req.customer.firstName }),
                ...(req.customer.lastName  && { surname:   req.customer.lastName  }),
              },
            }),
          },
        }),
      },
    };

    if (req.card) {
      body.cardPaymentMethodSpecificInput = {
        paymentProductId:    1,   // will be overridden by the platform based on card BIN
        skipAuthentication:  req.skipAuthentication ?? true,
        card: {
          cardholderName: req.card.cardholderName,
          cardNumber:     req.card.cardNumber,
          cvv:            req.card.cvv,
          expiryDate:     req.card.expiryDate,
        },
      };
    } else if (req.token) {
      body.cardPaymentMethodSpecificInput = {
        paymentProductId:   1,
        token:              req.token,
        skipAuthentication: req.skipAuthentication ?? true,
      };
    }

    return this.request<AnzPaymentResponse>('POST', '/payments', body);
  }

  /** GET /v2/{merchantId}/payments/{paymentId} */
  async getPayment(paymentId: string): Promise<{ data: AnzPaymentResponse; httpStatus: number }> {
    return this.request<AnzPaymentResponse>('GET', `/payments/${paymentId}`);
  }

  /** GET /v2/{merchantId}/payments/{paymentId}/details */
  async getPaymentDetails(paymentId: string): Promise<{ data: unknown; httpStatus: number }> {
    return this.request<unknown>('GET', `/payments/${paymentId}/details`);
  }

  /** POST /v2/{merchantId}/payments/{paymentId}/capture */
  async capturePayment(
    paymentId:   string,
    amountCents?: number,
  ): Promise<{ data: AnzCaptureResponse; httpStatus: number }> {
    const body = amountCents !== undefined
      ? { amountOfMoney: { amount: amountCents } }
      : {};
    return this.request<AnzCaptureResponse>('POST', `/payments/${paymentId}/capture`, body);
  }

  /** POST /v2/{merchantId}/payments/{paymentId}/cancel */
  async cancelPayment(paymentId: string): Promise<{ data: AnzCancelResponse; httpStatus: number }> {
    return this.request<AnzCancelResponse>('POST', `/payments/${paymentId}/cancel`, {});
  }

  /** POST /v2/{merchantId}/payments/{paymentId}/refund */
  async refundPayment(
    paymentId:   string,
    amountCents: number,
    currency:    string,
  ): Promise<{ data: AnzRefundResponse; httpStatus: number }> {
    return this.request<AnzRefundResponse>('POST', `/payments/${paymentId}/refund`, {
      amountOfMoney: {
        amount:       amountCents,
        currencyCode: currency,
      },
    });
  }

  /** GET /v2/{merchantId}/services/testconnection */
  async testConnection(): Promise<boolean> {
    try {
      const { httpStatus } = await this.request<unknown>('GET', '/services/testconnection');
      return httpStatus === 200;
    } catch {
      return false;
    }
  }
}
