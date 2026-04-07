import type { Metadata } from 'next';
import {
  TrendingUp, TrendingDown, ShoppingCart, Users,
  DollarSign, Package, AlertTriangle, ArrowUpRight, Sparkles, UserCircle,
  Rocket, CreditCard, ChevronRight,
} from 'lucide-react';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/session';
import { formatCurrency, timeAgo } from '@/lib/formatting';
import { DashboardControls } from '@/components/dashboard-controls';

export const metadata: Metadata = { title: 'Dashboard' };

interface Order {
  id: string; orderNumber: string; status: string;
  total: number; itemCount: number; customerName?: string; createdAt: string;
}
interface StockItem {
  id: string; productName?: string; onHand: number; reorderPoint: number;
}
interface SalesSummary {
  totalRevenue: number; totalOrders: number; avgOrderValue: number;
  totalDiscounts: number; totalTax: number;
}

async function safeFetch<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', headers });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch { return null; }
}

function getAuthHeaders(): Record<string, string> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get('elevatedpos_token')?.value;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch { /* cookies() may throw outside request context */ }
  return {};
}

async function fetchAISuggestions(): Promise<string[]> {
  try {
    const aiBase = process.env.AI_API_URL ?? 'http://localhost:4012';
    const res = await fetch(aiBase + '/api/v1/ai/suggestions', {
      next: { revalidate: 3600 },
      headers: { Authorization: `Bearer dev-internal` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: string[] };
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

function greeting(firstName: string): string {
  const hour = new Date().getHours();
  const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${salutation}, ${firstName} 👋`;
}

const PERIOD_COMPARISON_LABEL: Record<string, string> = {
  today: 'vs yesterday',
  yesterday: 'vs 2 days ago',
  week: 'vs last week',
  month: 'vs last month',
};

function StatCard({ label, value, change, trend, context, icon: Icon, color, loading, period }: {
  label: string; value: string; change?: string; trend?: 'up' | 'down';
  context?: string; icon: React.ElementType; color: string; loading?: boolean; period?: string;
}) {
  const comparisonLabel = PERIOD_COMPARISON_LABEL[period ?? 'today'] ?? 'vs yesterday';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          {loading ? (
            <div className="mt-1.5 h-8 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          ) : (
            <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          )}
        </div>
        <div className={`rounded-xl p-2.5 ${color}`}><Icon className="h-5 w-5" /></div>
      </div>
      {change && trend && (
        <div className="mt-3 flex items-center gap-1.5">
          {trend === 'up' ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
          <span className={`text-sm font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>{change}</span>
          <span className="text-sm text-gray-400">{comparisonLabel}</span>
        </div>
      )}
      {context && !change && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-sm text-gray-400">{context}</span>
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ordersBase = process.env.ORDERS_API_URL ?? 'http://localhost:4004';
  const invBase = process.env.INVENTORY_API_URL ?? 'http://localhost:4003';
  const reportsBase = process.env.REPORTING_API_URL ?? 'http://localhost:4014';
  const customersBase = process.env.CUSTOMERS_API_URL ?? 'http://localhost:4006';
  const employeesBase = process.env.AUTH_API_URL ?? 'http://localhost:4001';
  const catalogBase = process.env.CATALOG_API_URL ?? 'http://localhost:4002';

  const resolvedParams = await searchParams;
  const period = resolvedParams.period ?? 'today';

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const orgId = process.env.DEFAULT_ORG_ID ?? 'default';

  // Calculate date range based on selected period
  let fromStr = todayStr;
  let toStr = todayStr;
  if (period === 'yesterday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    fromStr = d.toISOString().slice(0, 10);
    toStr = fromStr;
  } else if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    fromStr = d.toISOString().slice(0, 10);
    toStr = todayStr;
  } else if (period === 'month') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    fromStr = d.toISOString().slice(0, 10);
    toStr = todayStr;
  }

  const authHeaders = getAuthHeaders();

  const [ordersResult, stockResult, aiSuggestions, salesResult, customersResult, employeesResult, productsResult, user] = await Promise.all([
    safeFetch<{ data: Order[] }>(ordersBase + '/api/v1/orders?limit=5', authHeaders),
    safeFetch<{ data: StockItem[] }>(invBase + '/api/v1/stock/low-stock', authHeaders),
    fetchAISuggestions(),
    safeFetch<{ data: SalesSummary }>(
      `${reportsBase}/api/v1/reports/sales?orgId=${orgId}&from=${fromStr}&to=${toStr}`,
      authHeaders,
    ),
    safeFetch<{ data: unknown[]; meta?: { totalCount: number }; pagination?: { total: number } }>(
      customersBase + '/api/v1/customers?limit=1',
      authHeaders,
    ),
    safeFetch<{ data: { clockedIn?: boolean }[] }>(
      employeesBase + '/api/v1/employees?limit=100',
      authHeaders,
    ),
    safeFetch<{ data: unknown[]; meta?: { totalCount: number }; pagination?: { total: number } }>(
      catalogBase + '/api/v1/products?status=active&limit=1',
      authHeaders,
    ),
    getSessionUser(),
  ]);

  const recentOrders: Order[] = ordersResult?.data ?? [];
  const lowStock: StockItem[] = stockResult?.data ?? [];
  const suggestions: string[] = aiSuggestions ?? [];

  // Revenue & transactions — prefer reports endpoint, fall back to sum of recent orders
  const sales = salesResult?.data;
  const revenue = sales?.totalRevenue ?? recentOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const txns = sales?.totalOrders ?? recentOrders.length;
  const aov = txns > 0 ? Math.round(revenue / txns) : 0;

  // Customers total — the microservice may return the count in meta.totalCount or pagination.total
  const totalCustomers = customersResult?.meta?.totalCount ?? customersResult?.pagination?.total ?? null;

  // Staff on duty
  const allStaff = employeesResult?.data ?? [];
  const staffOnDuty = allStaff.filter((e) => e.clockedIn).length;
  const totalStaff = allStaff.length;

  // Active products — the microservice may return the count in meta.totalCount or pagination.total
  const activeProducts = productsResult?.meta?.totalCount ?? productsResult?.pagination?.total ?? null;

  const firstName = user?.firstName ?? 'there';
  const today = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Detect a fresh / empty account for onboarding
  const isNewAccount = revenue === 0 && txns === 0 && (totalCustomers === 0 || totalCustomers === null) && (activeProducts === 0 || activeProducts === null);

  return (
    <div className="space-y-6">

      {/* ── Onboarding banner (new accounts only) ────────────────────────────── */}
      {isNewAccount && (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-6 dark:border-indigo-800 dark:from-indigo-950/40 dark:to-purple-950/40">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
              <Rocket className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Welcome to ElevatedPOS — let&apos;s get you set up!
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Complete these steps to start taking orders and managing your business.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  { href: '/dashboard/catalog', icon: Package, label: 'Add your products', sub: 'Set up your catalog' },
                  { href: '/dashboard/staff', icon: Users, label: 'Add your team', sub: 'Invite staff members' },
                  { href: '/pos', icon: CreditCard, label: 'Open the POS', sub: 'Start taking payments' },
                ].map(({ href, icon: Icon, label, sub }) => (
                  <a
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-white px-4 py-3 transition hover:border-indigo-400 hover:shadow-sm dark:border-indigo-800 dark:bg-gray-900"
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-indigo-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{label}</p>
                      <p className="text-xs text-gray-400 truncate">{sub}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{greeting(firstName)}</h2>
          <p className="text-sm text-gray-500">{today}</p>
        </div>
        <DashboardControls period={period} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Revenue Today"
          value={revenue > 0 ? formatCurrency(revenue) : '$0.00'}
          icon={DollarSign}
          color="bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          period={period}
        />
        <StatCard
          label="Transactions"
          value={txns > 0 ? txns.toString() : '0'}
          icon={ShoppingCart}
          color="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          period={period}
        />
        <StatCard
          label="Avg Order Value"
          value={aov > 0 ? formatCurrency(aov) : '$0.00'}
          icon={TrendingUp}
          color="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
          period={period}
        />
        <StatCard
          label="Total Customers"
          value={totalCustomers !== null ? totalCustomers.toLocaleString() : '0'}
          icon={Users}
          color="bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
          period={period}
        />
        <StatCard
          label="Active Products"
          value={activeProducts !== null ? activeProducts.toLocaleString() : '0'}
          icon={Package}
          color="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          period={period}
        />
        <StatCard
          label="Staff on Duty"
          value={staffOnDuty.toString()}
          icon={UserCircle}
          color="bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
          context={totalStaff > 0 ? `of ${totalStaff} total` : undefined}
        />
      </div>

      {/* AI Insights Card */}
      <div className="overflow-hidden rounded-xl border border-purple-200 bg-white shadow-sm dark:border-purple-900 dark:bg-gray-900">
        {/* Purple gradient header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)' }}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">AI Insights</h3>
            <p className="text-xs text-purple-200">Powered by ElevatedPOS AI Copilot · refreshes hourly</p>
          </div>
        </div>

        {/* Suggestions */}
        <div className="p-5">
          {suggestions.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-purple-200 p-4 dark:border-purple-800">
              <Sparkles className="h-5 w-5 flex-shrink-0 text-purple-300" />
              <p className="text-sm text-gray-400">AI insights are loading or unavailable. Ensure the AI service is running.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {suggestions.slice(0, 3).map((suggestion, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                    {i + 1}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{suggestion}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Orders</h3>
            <a href="/dashboard/orders" className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-500">View all <ArrowUpRight className="h-3.5 w-3.5" /></a>
          </div>
          {recentOrders.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No recent orders — services may be starting up.</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-800">{(order.customerName ?? 'WI').slice(0,2).toUpperCase()}</div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{order.customerName ?? 'Walk-in'}</p>
                      <p className="text-xs text-gray-400">{order.orderNumber} · {order.itemCount} item{order.itemCount !== 1 ? 's' : ''} · {timeAgo(order.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(order.total)}</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${order.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>{order.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><h3 className="font-semibold text-gray-900 dark:text-white">Alerts</h3></div>
          <div className="space-y-3 p-4">
            {lowStock.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center dark:border-gray-700">
                <Package className="mx-auto mb-1.5 h-5 w-5 text-gray-300" />
                <p className="text-xs text-gray-400">No alerts right now</p>
              </div>
            )}
            {lowStock.slice(0,5).map((item) => (
              <div key={item.id} className="rounded-lg bg-amber-50 p-3.5 dark:bg-amber-900/20">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{item.productName ?? 'Item'} — only {item.onHand} remaining</p>
                    <a href="/dashboard/inventory" className="mt-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400">View inventory →</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
