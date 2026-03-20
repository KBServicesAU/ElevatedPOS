import ky, { HTTPError, TimeoutError } from 'ky';
import { NexusApiError, NexusNetworkError } from './errors.js';
import type {
  Category,
  Customer,
  ListParams,
  NexusClientConfig,
  Order,
  OrderStatus,
  PaginatedResponse,
  Payment,
  Product,
  StockLevel,
} from './types.js';

// ─── Resource builder helpers ─────────────────────────────────────────────────

type CreateProductInput = Pick<Product, 'name' | 'price'> & Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>;
type UpdateProductInput = Partial<CreateProductInput>;

type CreateCustomerInput = Pick<Customer, 'firstName' | 'lastName'> & Partial<Omit<Customer, 'id' | 'merchantId' | 'createdAt' | 'updatedAt' | 'totalSpend' | 'visitCount'>>;
type UpdateCustomerInput = Partial<CreateCustomerInput>;

type CreateOrderInput = {
  locationId?: string;
  customerId?: string;
  channel: Order['channel'];
  type: Order['type'];
  items: Array<{
    productId: string;
    quantity: number;
    modifiers?: Array<{ id: string }>;
    notes?: string;
  }>;
  notes?: string;
  tableNumber?: string;
};

type ProcessPaymentInput = {
  orderId: string;
  method: Payment['method'];
  amount: number;
  currency?: string;
  cardToken?: string;
};

async function handleError(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    let body: Record<string, unknown> = {};
    try {
      body = await error.response.json();
    } catch {
      // ignore JSON parse errors
    }
    throw new NexusApiError({
      message: String(body['title'] ?? error.message),
      statusCode: error.response.status,
      code: String(body['code'] ?? 'unknown'),
      detail: body['detail'] != null ? String(body['detail']) : undefined,
      requestId: error.response.headers.get('x-request-id') ?? undefined,
    });
  }
  if (error instanceof TimeoutError) {
    throw new NexusNetworkError('Request timed out', error);
  }
  throw new NexusNetworkError('Network error', error);
}

// ─── NexusClient ──────────────────────────────────────────────────────────────

export class NexusClient {
  private readonly http: typeof ky;

  readonly products: ProductsResource;
  readonly categories: CategoriesResource;
  readonly orders: OrdersResource;
  readonly customers: CustomersResource;
  readonly payments: PaymentsResource;
  readonly inventory: InventoryResource;

  constructor(config: NexusClientConfig) {
    this.http = ky.create({
      prefixUrl: config.baseUrl.replace(/\/$/, '') + '/api/v1',
      timeout: config.timeout ?? 30_000,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Nexus-SDK-Version': '0.1.0',
      },
    });

    this.products = new ProductsResource(this.http);
    this.categories = new CategoriesResource(this.http);
    this.orders = new OrdersResource(this.http);
    this.customers = new CustomersResource(this.http);
    this.payments = new PaymentsResource(this.http);
    this.inventory = new InventoryResource(this.http);
  }
}

// ─── Products ────────────────────────────────────────────────────────────────

class ProductsResource {
  constructor(private readonly http: typeof ky) {}

  async list(params?: ListParams): Promise<PaginatedResponse<Product>> {
    try {
      return await this.http.get('catalog/products', { searchParams: params as Record<string, string | number | boolean> }).json();
    } catch (e) { return handleError(e); }
  }

  async get(id: string): Promise<Product> {
    try {
      const res: { data: Product } = await this.http.get(`catalog/products/${id}`).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async create(input: CreateProductInput): Promise<Product> {
    try {
      const res: { data: Product } = await this.http.post('catalog/products', { json: input }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    try {
      const res: { data: Product } = await this.http.patch(`catalog/products/${id}`, { json: input }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.http.delete(`catalog/products/${id}`);
    } catch (e) { return handleError(e); }
  }
}

// ─── Categories ──────────────────────────────────────────────────────────────

class CategoriesResource {
  constructor(private readonly http: typeof ky) {}

  async list(params?: ListParams): Promise<PaginatedResponse<Category>> {
    try {
      return await this.http.get('catalog/categories', { searchParams: params as Record<string, string | number | boolean> }).json();
    } catch (e) { return handleError(e); }
  }

  async get(id: string): Promise<Category> {
    try {
      const res: { data: Category } = await this.http.get(`catalog/categories/${id}`).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

class OrdersResource {
  constructor(private readonly http: typeof ky) {}

  async list(params?: ListParams & { status?: OrderStatus }): Promise<PaginatedResponse<Order>> {
    try {
      return await this.http.get('orders', { searchParams: params as Record<string, string | number | boolean> }).json();
    } catch (e) { return handleError(e); }
  }

  async get(id: string): Promise<Order> {
    try {
      const res: { data: Order } = await this.http.get(`orders/${id}`).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async create(input: CreateOrderInput): Promise<Order> {
    try {
      const res: { data: Order } = await this.http.post('orders', { json: input }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async updateStatus(id: string, status: OrderStatus, reason?: string): Promise<Order> {
    try {
      const res: { data: Order } = await this.http.patch(`orders/${id}/status`, { json: { status, reason } }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async cancel(id: string, reason?: string): Promise<Order> {
    return this.updateStatus(id, 'cancelled', reason);
  }
}

// ─── Customers ───────────────────────────────────────────────────────────────

class CustomersResource {
  constructor(private readonly http: typeof ky) {}

  async list(params?: ListParams): Promise<PaginatedResponse<Customer>> {
    try {
      return await this.http.get('customers', { searchParams: params as Record<string, string | number | boolean> }).json();
    } catch (e) { return handleError(e); }
  }

  async get(id: string): Promise<Customer> {
    try {
      const res: { data: Customer } = await this.http.get(`customers/${id}`).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    try {
      const res: { data: Customer } = await this.http.post('customers', { json: input }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async update(id: string, input: UpdateCustomerInput): Promise<Customer> {
    try {
      const res: { data: Customer } = await this.http.patch(`customers/${id}`, { json: input }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async getOrders(id: string, params?: ListParams): Promise<PaginatedResponse<Order>> {
    try {
      return await this.http.get(`customers/${id}/orders`, { searchParams: params as Record<string, string | number | boolean> }).json();
    } catch (e) { return handleError(e); }
  }
}

// ─── Payments ────────────────────────────────────────────────────────────────

class PaymentsResource {
  constructor(private readonly http: typeof ky) {}

  async process(input: ProcessPaymentInput): Promise<Payment> {
    try {
      const res: { data: Payment } = await this.http.post('payments', { json: input }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async get(id: string): Promise<Payment> {
    try {
      const res: { data: Payment } = await this.http.get(`payments/${id}`).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async refund(id: string, amount?: number): Promise<Payment> {
    try {
      const res: { data: Payment } = await this.http.post(`payments/${id}/refund`, { json: amount != null ? { amount } : {} }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }
}

// ─── Inventory ───────────────────────────────────────────────────────────────

class InventoryResource {
  constructor(private readonly http: typeof ky) {}

  async getStock(productId: string, locationId?: string): Promise<StockLevel[]> {
    try {
      const params = locationId ? { locationId } : undefined;
      const res: { data: StockLevel[] } = await this.http.get(`inventory/stock/${productId}`, { searchParams: params }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }

  async adjust(productId: string, locationId: string, quantity: number, reason: string): Promise<StockLevel> {
    try {
      const res: { data: StockLevel } = await this.http.post('inventory/adjustments', {
        json: { productId, locationId, quantity, reason },
      }).json();
      return res.data;
    } catch (e) { return handleError(e); }
  }
}
