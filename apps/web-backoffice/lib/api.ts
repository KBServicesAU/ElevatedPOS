/**
 * Typed API helpers for the web-backoffice.
 * All requests go through the /api/proxy route handler which adds auth headers
 * and forwards to the correct microservice.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? message;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, 'API_ERROR', message);
  }

  return res.json() as Promise<T>;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  orderType: string;
  customerId?: string;
  customerName?: string;
  locationId: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  itemCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface OrdersResponse {
  data: Order[];
  pagination?: { total: number; limit: number; cursor?: string };
}

export function fetchOrders(params?: {
  status?: string;
  channel?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}): Promise<OrdersResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.channel) qs.set('channel', params.channel);
  if (params?.search) qs.set('search', params.search);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  return apiFetch<OrdersResponse>(`orders?${qs}`);
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  sku: string;
  basePrice: number;
  status: string;
  productType: string;
  categoryId?: string;
  categoryName?: string;
  trackStock: boolean;
  isSoldInstore: boolean;
  createdAt: string;
}

export interface ProductsResponse {
  data: Product[];
  pagination?: { total: number; limit: number; cursor?: string };
}

export function fetchProducts(params?: {
  search?: string;
  categoryId?: string;
  status?: string;
  limit?: number;
}): Promise<ProductsResponse> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.categoryId) qs.set('categoryId', params.categoryId);
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  return apiFetch<ProductsResponse>(`products?${qs}`);
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
}

export function fetchCategories(): Promise<{ data: Category[] }> {
  return apiFetch<{ data: Category[] }>('categories');
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  totalVisits: number;
  totalSpend: number;
  loyaltyTier?: string;
  loyaltyPoints?: number;
  lastVisitAt?: string;
  createdAt: string;
}

export interface CustomersResponse {
  data: Customer[];
  pagination?: { total: number; limit: number; cursor?: string };
}

export function fetchCustomers(params?: {
  search?: string;
  limit?: number;
  cursor?: string;
}): Promise<CustomersResponse> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  return apiFetch<CustomersResponse>(`customers?${qs}`);
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface StockItem {
  id: string;
  productId: string;
  productName?: string;
  sku?: string;
  locationId: string;
  onHand: number;
  reorderPoint: number;
  reorderQuantity: number;
  unit: string;
  updatedAt: string;
}

export interface StockResponse {
  data: StockItem[];
}

export function fetchStock(params?: { locationId?: string; lowStock?: boolean }): Promise<StockResponse> {
  const qs = new URLSearchParams();
  if (params?.locationId) qs.set('locationId', params.locationId);
  if (params?.lowStock) qs.set('lowStock', 'true');
  return apiFetch<StockResponse>(`stock?${qs}`);
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName?: string;
  status: string;
  lineCount: number;
  totalCost: number;
  expectedAt?: string;
  createdAt: string;
}

export function fetchPurchaseOrders(): Promise<{ data: PurchaseOrder[] }> {
  return apiFetch<{ data: PurchaseOrder[] }>('purchase-orders?status=open,confirmed,shipped');
}

// ─── Employees ────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  clockedIn: boolean;
  status: string;
  createdAt: string;
}

export function fetchEmployees(): Promise<{ data: Employee[] }> {
  return apiFetch<{ data: Employee[] }>('employees');
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────

export interface LoyaltyProgram {
  id: string;
  name: string;
  earnRate: number;
  active: boolean;
  tiers?: LoyaltyTier[];
}

export interface LoyaltyTier {
  id: string;
  name: string;
  minPoints: number;
  maxPoints?: number;
  multiplier: number;
  memberCount?: number;
}

export function fetchLoyaltyPrograms(): Promise<{ data: LoyaltyProgram[] }> {
  return apiFetch<{ data: LoyaltyProgram[] }>('programs');
}

export function fetchLoyaltyAccounts(params?: { limit?: number }): Promise<{ data: unknown[] }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  return apiFetch<{ data: unknown[] }>(`loyalty-accounts?${qs}`);
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  scheduledAt?: string;
  sentAt?: string;
  recipientCount?: number;
  createdAt: string;
}

export function fetchCampaigns(params?: { status?: string }): Promise<{ data: Campaign[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  return apiFetch<{ data: Campaign[] }>(`campaigns?${qs}`);
}

// ─── Automations ──────────────────────────────────────────────────────────────

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  runCount: number;
  lastRunAt?: string;
  createdAt: string;
}

export function fetchAutomations(): Promise<{ data: AutomationRule[] }> {
  return apiFetch<{ data: AutomationRule[] }>('automations');
}

// ─── Integrations ─────────────────────────────────────────────────────────────

export interface IntegrationApp {
  id: string;
  name: string;
  category: string;
  description: string;
  installed: boolean;
  installedAt?: string;
}

export function fetchIntegrationApps(): Promise<{ data: IntegrationApp[] }> {
  return apiFetch<{ data: IntegrationApp[] }>('integration-apps');
}
