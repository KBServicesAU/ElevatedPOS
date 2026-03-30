import { NexusApiError } from './errors';
import type {
  ApiResponse,
  PaginatedResponse,
  Product,
  Category,
  Order,
  OrderLine,
  Customer,
  StockLevel,
  StockAdjustment,
  LoyaltyAccount,
  LoyaltyTransaction,
  Payment,
  Webhook,
  WebhookDelivery,
  WebhookEvent,
} from './types';

// Re-export for convenience
export type { OrderLine };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface NexusClientConfig {
  /** API key for server-side access. Sent as `X-Nexus-Api-Key` header. */
  apiKey: string;
  /** Defaults to https://api.nexus.app */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30 000. */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export class NexusClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: NexusClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.nexus.app').replace(/\/$/, '');
    this.timeout = config.timeout ?? 30_000;
  }

  // -------------------------------------------------------------------------
  // Core fetch wrapper
  // -------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Nexus-Api-Key': this.apiKey,
          'X-Nexus-Version': '1',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw new NexusApiError(
        0,
        'about:blank',
        err instanceof Error ? err.message : 'Network error',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let errorBody: { type?: string; title?: string; detail?: string } = {};
      try {
        errorBody = (await response.json()) as typeof errorBody;
      } catch {
        // ignore parse failure
      }
      throw new NexusApiError(
        response.status,
        errorBody.type ?? 'about:blank',
        errorBody.title ?? response.statusText,
        errorBody.detail,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // catalog
  // -------------------------------------------------------------------------

  readonly catalog = {
    products: {
      list: (params?: {
        categoryId?: string;
        search?: string;
        isActive?: boolean;
        limit?: number;
        cursor?: string;
      }): Promise<PaginatedResponse<Product>> =>
        this.request('GET', `/api/v1/products${buildQuery(params)}`),

      get: (id: string): Promise<ApiResponse<Product>> =>
        this.request('GET', `/api/v1/products/${id}`),

      create: (data: Partial<Product>): Promise<ApiResponse<Product>> =>
        this.request('POST', '/api/v1/products', data),

      update: (id: string, data: Partial<Product>): Promise<ApiResponse<Product>> =>
        this.request('PATCH', `/api/v1/products/${id}`, data),

      delete: (id: string): Promise<void> =>
        this.request('DELETE', `/api/v1/products/${id}`),
    },

    categories: {
      list: (): Promise<PaginatedResponse<Category>> =>
        this.request('GET', '/api/v1/categories'),

      get: (id: string): Promise<ApiResponse<Category>> =>
        this.request('GET', `/api/v1/categories/${id}`),
    },
  };

  // -------------------------------------------------------------------------
  // orders
  // -------------------------------------------------------------------------

  readonly orders = {
    list: (params?: {
      status?: string;
      customerId?: string;
      locationId?: string;
      limit?: number;
      cursor?: string;
    }): Promise<PaginatedResponse<Order>> =>
      this.request('GET', `/api/v1/orders${buildQuery(params)}`),

    get: (id: string): Promise<ApiResponse<Order>> =>
      this.request('GET', `/api/v1/orders/${id}`),

    create: (data: {
      locationId?: string;
      customerId?: string;
      lines: Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }>;
      notes?: string;
    }): Promise<ApiResponse<Order>> =>
      this.request('POST', '/api/v1/orders', data),

    updateStatus: (id: string, status: Order['status']): Promise<ApiResponse<Order>> =>
      this.request('PATCH', `/api/v1/orders/${id}`, { status }),
  };

  // -------------------------------------------------------------------------
  // customers
  // -------------------------------------------------------------------------

  readonly customers = {
    list: (params?: {
      search?: string;
      limit?: number;
      cursor?: string;
    }): Promise<PaginatedResponse<Customer>> =>
      this.request('GET', `/api/v1/customers${buildQuery(params)}`),

    get: (id: string): Promise<ApiResponse<Customer>> =>
      this.request('GET', `/api/v1/customers/${id}`),

    create: (data: Partial<Customer>): Promise<ApiResponse<Customer>> =>
      this.request('POST', '/api/v1/customers', data),

    update: (id: string, data: Partial<Customer>): Promise<ApiResponse<Customer>> =>
      this.request('PATCH', `/api/v1/customers/${id}`, data),
  };

  // -------------------------------------------------------------------------
  // inventory
  // -------------------------------------------------------------------------

  readonly inventory = {
    stock: {
      list: (params?: {
        locationId?: string;
        lowStock?: boolean;
        productId?: string;
        limit?: number;
      }): Promise<PaginatedResponse<StockLevel>> =>
        this.request('GET', `/api/v1/stock${buildQuery(params)}`),

      get: (productId: string, locationId: string): Promise<ApiResponse<StockLevel>> =>
        this.request('GET', `/api/v1/stock/${productId}${buildQuery({ locationId })}`),

      adjust: (
        productId: string,
        data: { locationId: string; quantity: number; reason: string },
      ): Promise<ApiResponse<StockAdjustment>> =>
        this.request('POST', `/api/v1/stock/${productId}/adjust`, data),
    },
  };

  // -------------------------------------------------------------------------
  // loyalty
  // -------------------------------------------------------------------------

  readonly loyalty = {
    accounts: {
      get: (customerId: string): Promise<ApiResponse<LoyaltyAccount>> =>
        this.request('GET', `/api/v1/loyalty/accounts/${customerId}`),

      transactions: (
        accountId: string,
        params?: { limit?: number },
      ): Promise<PaginatedResponse<LoyaltyTransaction>> =>
        this.request('GET', `/api/v1/loyalty/accounts/${accountId}/transactions${buildQuery(params)}`),

      accruePoints: (
        accountId: string,
        data: { orderId?: string; points: number; description?: string },
      ): Promise<ApiResponse<LoyaltyTransaction>> =>
        this.request('POST', `/api/v1/loyalty/accounts/${accountId}/earn`, data),

      redeemPoints: (
        accountId: string,
        data: { orderId?: string; points: number; description?: string },
      ): Promise<ApiResponse<LoyaltyTransaction>> =>
        this.request('POST', `/api/v1/loyalty/accounts/${accountId}/redeem`, data),
    },
  };

  // -------------------------------------------------------------------------
  // payments
  // -------------------------------------------------------------------------

  readonly payments = {
    list: (params?: {
      orderId?: string;
      status?: string;
      limit?: number;
    }): Promise<PaginatedResponse<Payment>> =>
      this.request('GET', `/api/v1/payments${buildQuery(params)}`),

    get: (id: string): Promise<ApiResponse<Payment>> =>
      this.request('GET', `/api/v1/payments/${id}`),

    refund: (
      id: string,
      data: { amount?: number; reason?: string },
    ): Promise<ApiResponse<Payment>> =>
      this.request('POST', `/api/v1/payments/${id}/refund`, data),
  };

  // -------------------------------------------------------------------------
  // webhooks
  // -------------------------------------------------------------------------

  readonly webhooks = {
    list: (): Promise<PaginatedResponse<Webhook>> =>
      this.request('GET', '/api/v1/integrations/webhooks'),

    get: (id: string): Promise<ApiResponse<Webhook>> =>
      this.request('GET', `/api/v1/integrations/webhooks/${id}`),

    create: (data: {
      url: string;
      events: WebhookEvent[];
      label?: string;
      secret?: string;
    }): Promise<ApiResponse<Webhook>> =>
      this.request('POST', '/api/v1/integrations/webhooks', data),

    update: (
      id: string,
      data: { url?: string; events?: WebhookEvent[]; label?: string; enabled?: boolean },
    ): Promise<ApiResponse<Webhook>> =>
      this.request('PATCH', `/api/v1/integrations/webhooks/${id}`, data),

    delete: (id: string): Promise<void> =>
      this.request('DELETE', `/api/v1/integrations/webhooks/${id}`),

    test: (id: string): Promise<ApiResponse<{ success: boolean; statusCode: number | null }>> =>
      this.request('POST', `/api/v1/integrations/webhooks/${id}/test`),

    deliveries: (
      id: string,
      params?: { limit?: number },
    ): Promise<PaginatedResponse<WebhookDelivery>> =>
      this.request('GET', `/api/v1/integrations/webhooks/${id}/deliveries${buildQuery(params)}`),
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createClient(config: NexusClientConfig): NexusClient {
  return new NexusClient(config);
}

// ---------------------------------------------------------------------------
// Webhook verification helper (for incoming webhook handlers)
// ---------------------------------------------------------------------------

/**
 * Verifies the `X-Nexus-Signature` header against the raw request body.
 * Use the secret that was returned when the webhook was created.
 *
 * Works in Node.js (>=18) and edge runtimes (Web Crypto API).
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expectedHex =
    'sha256=' +
    Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  return expectedHex === signature;
}
