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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    // Expired / invalid session — boot user to login
    if (res.status === 401 && typeof window !== 'undefined') {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }

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
  subtotal: number | string;
  taxTotal: number | string;
  discountTotal: number | string;
  total: number | string;
  itemCount?: number;
  /** Embedded line items returned by the orders service */
  lines?: { id: string; qty: number; unitPrice?: number | string }[];
  paymentMethod?: string;
  createdAt: string;
  completedAt?: string;
}

export interface OrderLineItem {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  qty: number;
  unitPrice: number;
  discountTotal: number;
  taxTotal: number;
  lineTotal: number;
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
  dateFrom?: string;
  dateTo?: string;
}): Promise<OrdersResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.channel) qs.set('channel', params.channel);
  if (params?.search) qs.set('search', params.search);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params?.dateTo) qs.set('dateTo', params.dateTo);
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
  dateOfBirth?: string;
  anniversaryDate?: string;
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

// ─── Roles ────────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  permissions: Record<string, boolean>;
  isSystemRole?: boolean;
}

export function fetchRoles(): Promise<{ data: Role[] }> {
  return apiFetch<{ data: Role[] }>('roles');
}

// ─── Shifts (time-clock) ──────────────────────────────────────────────────────

export interface Shift {
  id: string;
  employeeId: string;
  locationId: string;
  orgId: string;
  clockInAt: string;
  clockOutAt: string | null;
  breakMinutes: number;
  status: 'open' | 'closed' | 'approved';
}

export function fetchShifts(params?: {
  employeeId?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'open' | 'closed' | 'approved';
}): Promise<{ data: Shift[] }> {
  const qs = new URLSearchParams();
  if (params?.employeeId) qs.set('employeeId', params.employeeId);
  if (params?.locationId) qs.set('locationId', params.locationId);
  if (params?.dateFrom)   qs.set('dateFrom', params.dateFrom);
  if (params?.dateTo)     qs.set('dateTo', params.dateTo);
  if (params?.status)     qs.set('status', params.status);
  return apiFetch<{ data: Shift[] }>(`shifts?${qs}`);
}

// ─── Employees ────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roleId?: string;
  role?: { id: string; name: string } | string;
  locationId?: string;
  locationName?: string;
  employmentType?: string;
  hourlyRate?: number;
  clockedIn?: boolean;
  isActive?: boolean;
  status?: string;
  pin?: string;
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
  // Detail fields (present when editing)
  targetSegment?: Record<string, string>;
  subject?: string;
  body?: string;
  fromName?: string;
  message?: string;
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

// ─── AI ───────────────────────────────────────────────────────────────────────

export interface StockAnomalyItem {
  productId: string;
  name: string;
  sku: string;
  currentStock: number;
  avgDailySales: number;
  daysOfStock: number;
  lastMovementDays: number;
}

export interface StockAnomaly {
  productId: string;
  name: string;
  type: 'spike' | 'stagnant' | 'negative' | 'overstock';
  severity: 'low' | 'medium' | 'high';
  message: string;
  recommendation: string;
}

export interface StockAnomalyResponse {
  anomalies: StockAnomaly[];
  summary: string;
}

export function fetchStockAnomalies(payload: {
  orgId: string;
  locationId?: string;
  lookbackDays?: number;
  items: StockAnomalyItem[];
}): Promise<StockAnomalyResponse> {
  return apiFetch<StockAnomalyResponse>('ai/stock-anomaly', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface ChurnRiskCustomer {
  customerId: string;
  name: string;
  daysSinceLastVisit: number;
  visitCount30d: number;
  visitCount90d: number;
  avgOrderValue: number;
  lifetimeValue: number;
  tier: string;
}

export interface ChurnRiskScore {
  customerId: string;
  name: string;
  churnRisk: number;
  riskLevel: 'high' | 'medium' | 'low';
  primaryFactor: string;
  recommendation: string;
}

export interface ChurnRiskResponse {
  scores: ChurnRiskScore[];
  highRiskCount: number;
  summary: string;
}

export function fetchChurnRisk(payload: {
  customers: ChurnRiskCustomer[];
}): Promise<ChurnRiskResponse> {
  return apiFetch<ChurnRiskResponse>('ai/churn-risk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface LaborShift {
  date: string;
  dayOfWeek: string;
  staffCount: number;
  revenue: number;
  transactions: number;
  avgServiceTime: number;
}

export interface LaborInsight {
  date: string;
  issue: 'overstaffed' | 'understaffed' | 'optimal';
  actualStaff: number;
  recommendedStaff: number;
  revenuePerStaff: number;
  message: string;
}

export interface LaborNextWeekRec {
  date: string;
  recommendedStaff: number;
  reasoning: string;
}

export interface LaborOptimizationResponse {
  insights: LaborInsight[];
  nextWeekRecommendations: LaborNextWeekRec[];
  summary: string;
}

export function fetchLaborOptimization(payload: {
  shifts: LaborShift[];
  forecast?: { nextWeek: Array<{ date: string; dayOfWeek: string; predictedRevenue: number }> };
}): Promise<LaborOptimizationResponse> {
  return apiFetch<LaborOptimizationResponse>('ai/labor-optimization', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface MenuEngineeringItem {
  productId: string;
  name: string;
  category: string;
  unitsSold: number;
  revenue: number;
  costPrice: number;
  salePrice: number;
  margin: number;
}

export interface MenuAnalysisEntry {
  productId: string;
  name: string;
  quadrant: 'star' | 'plowhorse' | 'puzzle' | 'dog';
  popularityScore: number;
  marginScore: number;
  recommendation: string;
  action: 'promote' | 'reprice' | 'remove' | 'bundle';
}

export interface MenuEngineeringResponse {
  analysis: MenuAnalysisEntry[];
  stars: string[];
  plowhorses: string[];
  puzzles: string[];
  dogs: string[];
  summary: string;
}

export function fetchMenuEngineering(payload: {
  items: MenuEngineeringItem[];
  period: string;
}): Promise<MenuEngineeringResponse> {
  return apiFetch<MenuEngineeringResponse>('ai/menu-engineering', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface ReorderItem {
  productId: string;
  name: string;
  sku: string;
  supplierId: string;
  supplierName: string;
  currentStock: number;
  avgDailySales: number;
  leadTimeDays: number;
  reorderPoint: number;
  reorderQty: number;
  unitCost: number;
}

export interface ReorderSuggestion {
  productId: string;
  name: string;
  supplierId: string;
  supplierName: string;
  suggestedQty: number;
  urgency: 'urgent' | 'soon' | 'optional';
  daysUntilStockout: number;
  estimatedCost: number;
  reasoning: string;
}

export interface ReorderSuggestionsResponse {
  suggestions: ReorderSuggestion[];
  totalEstimatedCost: number;
  urgentCount: number;
  summary: string;
}

export function fetchReorderSuggestions(payload: {
  items: ReorderItem[];
}): Promise<ReorderSuggestionsResponse> {
  return apiFetch<ReorderSuggestionsResponse>('ai/reorder-suggestions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Reporting / Analytics ────────────────────────────────────────────────────

export interface SalesSummary {
  totalRevenue: number;
  totalOrders: number;
  totalDiscounts: number;
  totalTax: number;
  avgOrderValue: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
}

export interface RevenueByHour {
  hour: number;
  totalRevenue: number;
  orderCount: number;
}

export interface RevenueByChannel {
  channel: string;
  totalRevenue: number;
  orderCount: number;
  avgOrderValue: number;
}

export function fetchSalesSummary(params: {
  orgId: string;
  from: string;
  to: string;
}): Promise<{ data: SalesSummary }> {
  const qs = new URLSearchParams({ orgId: params.orgId, from: params.from, to: params.to });
  return apiFetch<{ data: SalesSummary }>(`reports/sales?${qs}`);
}

export function fetchTopProducts(params: {
  orgId: string;
  from: string;
  to: string;
  limit?: number;
}): Promise<{ data: TopProduct[] }> {
  const qs = new URLSearchParams({ orgId: params.orgId, from: params.from, to: params.to });
  if (params.limit) qs.set('limit', String(params.limit));
  return apiFetch<{ data: TopProduct[] }>(`reports/products?${qs}`);
}

export function fetchRevenueByHour(params: {
  orgId: string;
  date: string;
}): Promise<{ data: RevenueByHour[] }> {
  const qs = new URLSearchParams({ orgId: params.orgId, date: params.date });
  return apiFetch<{ data: RevenueByHour[] }>(`reports/revenue-by-hour?${qs}`);
}

export function fetchRevenueByChannel(params: {
  orgId: string;
  from: string;
  to: string;
}): Promise<{ data: RevenueByChannel[] }> {
  const qs = new URLSearchParams({ orgId: params.orgId, from: params.from, to: params.to });
  return apiFetch<{ data: RevenueByChannel[] }>(`reports/revenue-by-channel?${qs}`);
}
