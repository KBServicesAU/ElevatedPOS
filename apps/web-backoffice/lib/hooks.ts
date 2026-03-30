/**
 * React Query hooks for all NEXUS API resources.
 * Each hook wraps a typed fetch function from lib/api.ts.
 */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  fetchOrders,
  fetchProducts,
  fetchCategories,
  fetchCustomers,
  fetchStock,
  fetchPurchaseOrders,
  fetchEmployees,
  fetchLoyaltyPrograms,
  fetchCampaigns,
  fetchAutomations,
  fetchIntegrationApps,
  fetchStockAnomalies,
  fetchChurnRisk,
  fetchLaborOptimization,
  fetchMenuEngineering,
  fetchReorderSuggestions,
  fetchSalesSummary,
  fetchTopProducts,
  fetchRevenueByHour,
  fetchRevenueByChannel,
  type StockAnomalyItem,
  type ChurnRiskCustomer,
  type LaborShift,
  type MenuEngineeringItem,
  type ReorderItem,
} from './api';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const queryKeys = {
  orders: (params?: object) => ['orders', params] as const,
  products: (params?: object) => ['products', params] as const,
  categories: () => ['categories'] as const,
  customers: (params?: object) => ['customers', params] as const,
  stock: (params?: object) => ['stock', params] as const,
  purchaseOrders: () => ['purchase-orders'] as const,
  employees: () => ['employees'] as const,
  loyaltyPrograms: () => ['loyalty-programs'] as const,
  campaigns: (params?: object) => ['campaigns', params] as const,
  automations: () => ['automations'] as const,
  integrationApps: () => ['integration-apps'] as const,
  salesSummary: (params: object) => ['sales-summary', params] as const,
  topProducts: (params: object) => ['top-products', params] as const,
  revenueByHour: (params: object) => ['revenue-by-hour', params] as const,
  revenueByChannel: (params: object) => ['revenue-by-channel', params] as const,
};

// ─── Orders ──────────────────────────────────────────────────────────────────

export function useOrders(params?: Parameters<typeof fetchOrders>[0]) {
  return useQuery({
    queryKey: queryKeys.orders(params),
    queryFn: () => fetchOrders(params),
    refetchInterval: 30_000, // poll every 30s for live order updates
    staleTime: 10_000,
  });
}

// ─── Products ─────────────────────────────────────────────────────────────────

export function useProducts(params?: Parameters<typeof fetchProducts>[0]) {
  return useQuery({
    queryKey: queryKeys.products(params),
    queryFn: () => fetchProducts(params),
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories(),
    queryFn: fetchCategories,
    staleTime: 5 * 60_000, // categories change rarely
  });
}

// ─── Customers ────────────────────────────────────────────────────────────────

export function useCustomers(params?: Parameters<typeof fetchCustomers>[0]) {
  return useQuery({
    queryKey: queryKeys.customers(params),
    queryFn: () => fetchCustomers(params),
    staleTime: 30_000,
  });
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export function useStock(params?: Parameters<typeof fetchStock>[0]) {
  return useQuery({
    queryKey: queryKeys.stock(params),
    queryFn: () => fetchStock(params),
    staleTime: 30_000,
  });
}

export function usePurchaseOrders() {
  return useQuery({
    queryKey: queryKeys.purchaseOrders(),
    queryFn: fetchPurchaseOrders,
    staleTime: 60_000,
  });
}

// ─── Employees ────────────────────────────────────────────────────────────────

export function useEmployees() {
  return useQuery({
    queryKey: queryKeys.employees(),
    queryFn: fetchEmployees,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────

export function useLoyaltyPrograms() {
  return useQuery({
    queryKey: queryKeys.loyaltyPrograms(),
    queryFn: fetchLoyaltyPrograms,
    staleTime: 5 * 60_000,
  });
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export function useCampaigns(params?: Parameters<typeof fetchCampaigns>[0]) {
  return useQuery({
    queryKey: queryKeys.campaigns(params),
    queryFn: () => fetchCampaigns(params),
    staleTime: 60_000,
  });
}

// ─── Automations ──────────────────────────────────────────────────────────────

export function useAutomations() {
  return useQuery({
    queryKey: queryKeys.automations(),
    queryFn: fetchAutomations,
    staleTime: 60_000,
  });
}

// ─── Integrations ─────────────────────────────────────────────────────────────

export function useIntegrationApps() {
  return useQuery({
    queryKey: queryKeys.integrationApps(),
    queryFn: fetchIntegrationApps,
    staleTime: 5 * 60_000,
  });
}

// ─── Reporting / Analytics ────────────────────────────────────────────────────

export function useSalesSummary(params: Parameters<typeof fetchSalesSummary>[0]) {
  return useQuery({
    queryKey: queryKeys.salesSummary(params),
    queryFn: () => fetchSalesSummary(params),
    staleTime: 5 * 60_000,
  });
}

export function useTopProducts(params: Parameters<typeof fetchTopProducts>[0]) {
  return useQuery({
    queryKey: queryKeys.topProducts(params),
    queryFn: () => fetchTopProducts(params),
    staleTime: 5 * 60_000,
  });
}

export function useRevenueByHour(params: Parameters<typeof fetchRevenueByHour>[0]) {
  return useQuery({
    queryKey: queryKeys.revenueByHour(params),
    queryFn: () => fetchRevenueByHour(params),
    staleTime: 5 * 60_000,
  });
}

export function useRevenueByChannel(params: Parameters<typeof fetchRevenueByChannel>[0]) {
  return useQuery({
    queryKey: queryKeys.revenueByChannel(params),
    queryFn: () => fetchRevenueByChannel(params),
    staleTime: 5 * 60_000,
  });
}

// ─── Invalidation helper ──────────────────────────────────────────────────────

export function useInvalidateOrders() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['orders'] });
}

// ─── AI mutations ─────────────────────────────────────────────────────────────

export function useStockAnomalies() {
  return useMutation({
    mutationFn: (payload: {
      orgId: string;
      locationId?: string;
      lookbackDays?: number;
      items: StockAnomalyItem[];
    }) => fetchStockAnomalies(payload),
  });
}

export function useChurnRisk() {
  return useMutation({
    mutationFn: (payload: { customers: ChurnRiskCustomer[] }) => fetchChurnRisk(payload),
  });
}

export function useLaborOptimization() {
  return useMutation({
    mutationFn: (payload: {
      shifts: LaborShift[];
      forecast?: { nextWeek: Array<{ date: string; dayOfWeek: string; predictedRevenue: number }> };
    }) => fetchLaborOptimization(payload),
  });
}

export function useMenuEngineering() {
  return useMutation({
    mutationFn: (payload: { items: MenuEngineeringItem[]; period: string }) =>
      fetchMenuEngineering(payload),
  });
}

export function useReorderSuggestions() {
  return useMutation({
    mutationFn: (payload: { items: ReorderItem[] }) => fetchReorderSuggestions(payload),
  });
}
