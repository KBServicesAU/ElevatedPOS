import type { Metadata } from 'next';
import {
  TrendingUp, TrendingDown, ShoppingCart, Users,
  DollarSign, Package, AlertTriangle, ArrowUpRight,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Dashboard' };

interface Order {
  id: string; orderNumber: string; status: string;
  total: number; itemCount: number; customerName?: string; createdAt: string;
}
interface StockItem {
  id: string; productName?: string; onHand: number; reorderPoint: number;
}

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch { return null; }
}

function fmt(cents: number) { return '$' + (cents / 100).toFixed(2); }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatCard({ label, value, change, trend, icon: Icon, color }: {
  label: string; value: string; change: string; trend: 'up' | 'down';
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${color}`}><Icon className="h-5 w-5" /></div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {trend === 'up' ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
        <span className={`text-sm font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>{change}</span>
        <span className="text-sm text-gray-400">vs yesterday</span>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const ordersBase = process.env.ORDERS_API_URL ?? 'http://localhost:4004';
  const invBase = process.env.INVENTORY_API_URL ?? 'http://localhost:4003';

  const [ordersResult, stockResult] = await Promise.allSettled([
    safeFetch<{ data: Order[] }>(ordersBase + '/api/v1/orders?limit=5'),
    safeFetch<{ data: StockItem[] }>(invBase + '/api/v1/stock/low-stock'),
  ]);

  const recentOrders: Order[] = ordersResult.status === 'fulfilled' ? (ordersResult.value?.data ?? []) : [];
  const lowStock: StockItem[] = stockResult.status === 'fulfilled' ? (stockResult.value?.data ?? []) : [];
  const revenue = recentOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const txns = recentOrders.length;
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Good morning &#x1F44B;</h2>
          <p className="text-sm text-gray-500">{today} · Main Location</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
            <option>Today</option><option>Yesterday</option><option>This Week</option><option>This Month</option>
          </select>
          <button className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">Export</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Revenue Today" value={revenue > 0 ? fmt(revenue) : '—'} change="+12.4%" trend="up" icon={DollarSign} color="bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
        <StatCard label="Transactions" value={txns > 0 ? txns.toString() : '—'} change="+8.1%" trend="up" icon={ShoppingCart} color="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard label="Avg Order Value" value={txns > 0 ? fmt(Math.round(revenue / txns)) : '—'} change="-3.2%" trend="down" icon={TrendingUp} color="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" />
        <StatCard label="New Customers" value="—" change="+33%" trend="up" icon={Users} color="bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
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
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmt(order.total)}</p>
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