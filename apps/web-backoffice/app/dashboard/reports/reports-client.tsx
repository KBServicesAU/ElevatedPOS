'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, BarChart2 } from 'lucide-react';
import { apiFetch } from '../../../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderLine {
  id: string;
  name: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  channel: string;
  customerId?: string;
  createdAt: string;
  lines?: OrderLine[];
}

type DateRange = 'today' | 'yesterday' | 'week' | 'month';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateBounds(range: DateRange): { from: string; to: string; label: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (range === 'today') {
    const start = startOfDay(now);
    return { from: start.toISOString(), to: now.toISOString(), label: now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
  }
  if (range === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const start = startOfDay(yest);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString(), label: yest.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
  }
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: startOfDay(start).toISOString(), to: now.toISOString(), label: 'Last 7 Days' };
  }
  // month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: start.toISOString(), to: now.toISOString(), label: 'This Month' };
}

function fmt(cents: number | string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
    typeof cents === 'string' ? parseFloat(cents) : cents,
  );
}

function getHour(iso: string): number {
  return new Date(iso).getHours();
}

// ─── Derived data builders ────────────────────────────────────────────────────

function buildKpis(orders: Order[], prevOrders: Order[]) {
  const completed = orders.filter((o) => o.status === 'completed');
  const prevCompleted = prevOrders.filter((o) => o.status === 'completed');

  const grossRevenue = completed.reduce((s, o) => s + parseFloat(o.total), 0);
  const prevGross = prevCompleted.reduce((s, o) => s + parseFloat(o.total), 0);

  const pct = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? '+100%' : '0%';
    const change = ((curr - prev) / prev) * 100;
    return (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
  };

  const uniqueCustomers = new Set(completed.map((o) => o.customerId).filter(Boolean)).size;
  const prevUniqueCustomers = new Set(prevCompleted.map((o) => o.customerId).filter(Boolean)).size;

  return [
    {
      label: 'Gross Revenue',
      value: fmt(grossRevenue),
      change: pct(grossRevenue, prevGross),
      up: grossRevenue >= prevGross,
      icon: DollarSign,
    },
    {
      label: 'Net Revenue',
      value: fmt(grossRevenue * 0.92),
      change: pct(grossRevenue * 0.92, prevGross * 0.92),
      up: grossRevenue >= prevGross,
      icon: BarChart2,
    },
    {
      label: 'Transactions',
      value: completed.length.toString(),
      change: pct(completed.length, prevCompleted.length),
      up: completed.length >= prevCompleted.length,
      icon: ShoppingCart,
    },
    {
      label: 'Customers',
      value: uniqueCustomers.toString(),
      change: pct(uniqueCustomers, prevUniqueCustomers),
      up: uniqueCustomers >= prevUniqueCustomers,
      icon: Users,
    },
  ];
}

function buildHourlyRevenue(orders: Order[], range: DateRange) {
  const completed = orders.filter((o) => o.status === 'completed');

  if (range === 'today' || range === 'yesterday') {
    // Build per-hour buckets 6am-9pm
    const hours: Record<number, number> = {};
    for (let h = 6; h <= 21; h++) hours[h] = 0;
    for (const o of completed) {
      const h = getHour(o.createdAt);
      if (h >= 6 && h <= 21) hours[h] += parseFloat(o.total);
    }
    return Object.entries(hours).map(([h, revenue]) => ({
      hour: Number(h) < 12 ? `${h}am` : Number(h) === 12 ? '12pm' : `${Number(h) - 12}pm`,
      revenue,
    }));
  }

  // For week/month: group by day
  const days: Record<string, number> = {};
  for (const o of completed) {
    const day = o.createdAt.split('T')[0];
    days[day] = (days[day] ?? 0) + parseFloat(o.total);
  }
  return Object.entries(days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, revenue]) => ({
      hour: new Date(day).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      revenue,
    }));
}

function buildTopProducts(orders: Order[]) {
  const completed = orders.filter((o) => o.status === 'completed' && o.lines);
  const productMap: Record<string, { name: string; units: number; revenue: number }> = {};

  for (const o of completed) {
    for (const line of o.lines ?? []) {
      if (!productMap[line.name]) {
        productMap[line.name] = { name: line.name, units: 0, revenue: 0 };
      }
      productMap[line.name].units += parseInt(line.quantity, 10);
      productMap[line.name].revenue += parseFloat(line.lineTotal);
    }
  }

  const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const maxRevenue = products[0]?.revenue ?? 1;

  return products.map((p) => ({
    name: p.name,
    units: p.units,
    revenue: fmt(p.revenue),
    share: Math.round((p.revenue / maxRevenue) * 100),
  }));
}

function buildChannelBreakdown(orders: Order[]) {
  const completed = orders.filter((o) => o.status === 'completed');
  const channelMap: Record<string, number> = {};

  for (const o of completed) {
    const ch = o.channel ?? 'other';
    channelMap[ch] = (channelMap[ch] ?? 0) + parseFloat(o.total);
  }

  const total = Object.values(channelMap).reduce((s, v) => s + v, 0) || 1;
  const labels: Record<string, string> = {
    pos: 'In-Store POS',
    online: 'Online',
    kiosk: 'Kiosk',
    qr: 'QR Order',
    marketplace: 'Marketplace',
    delivery: 'Delivery',
    phone: 'Phone',
  };

  return Object.entries(channelMap)
    .sort(([, a], [, b]) => b - a)
    .map(([ch, amount]) => ({
      method: labels[ch] ?? ch,
      amount: fmt(amount),
      pct: Math.round((amount / total) * 100),
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsClient() {
  const [range, setRange] = useState<DateRange>('today');

  const bounds = useMemo(() => getDateBounds(range), [range]);

  // Compute previous period bounds for comparison
  const prevBounds = useMemo(() => {
    const from = new Date(bounds.from);
    const to = new Date(bounds.to);
    const duration = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - duration);
    const prevTo = new Date(from.getTime() - 1);
    return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
  }, [bounds]);

  const { data: ordersResp, isLoading } = useQuery({
    queryKey: ['orders', 'reports', range, bounds.from],
    queryFn: () =>
      apiFetch<{ data: Order[] }>(
        `orders?from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}&limit=200`,
      ),
    staleTime: 60_000,
  });

  const { data: prevOrdersResp } = useQuery({
    queryKey: ['orders', 'reports', 'prev', prevBounds.from],
    queryFn: () =>
      apiFetch<{ data: Order[] }>(
        `orders?from=${encodeURIComponent(prevBounds.from)}&to=${encodeURIComponent(prevBounds.to)}&limit=200`,
      ),
    staleTime: 60_000,
  });

  const orders = ordersResp?.data ?? [];
  const prevOrders = prevOrdersResp?.data ?? [];

  const kpis = useMemo(() => buildKpis(orders, prevOrders), [orders, prevOrders]);
  const hourlyRevenue = useMemo(() => buildHourlyRevenue(orders, range), [orders, range]);
  const topProducts = useMemo(() => buildTopProducts(orders), [orders]);
  const channelBreakdown = useMemo(() => buildChannelBreakdown(orders), [orders]);
  const maxRevenue = Math.max(...hourlyRevenue.map((h) => h.revenue), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h2>
          <p className="text-sm text-gray-500">{bounds.label} · All Locations</p>
        </div>
        <div className="flex gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as DateRange)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-2 h-8 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-3 h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            ))
          : kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm text-gray-500 dark:text-gray-400">{kpi.label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
                <div className="mt-2 flex items-center gap-1">
                  {kpi.up ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`text-sm font-medium ${kpi.up ? 'text-green-600' : 'text-red-600'}`}>
                    {kpi.change}
                  </span>
                  <span className="text-sm text-gray-400">vs prior period</span>
                </div>
              </div>
            ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue chart */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
            {range === 'today' || range === 'yesterday' ? 'Revenue by Hour' : 'Revenue by Day'}
          </h3>
          {isLoading ? (
            <div className="animate-pulse h-40 rounded bg-gray-100 dark:bg-gray-700" />
          ) : hourlyRevenue.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              No completed orders in this period
            </div>
          ) : (
            <div className="flex h-40 items-end gap-1 overflow-x-auto">
              {hourlyRevenue.map((h) => (
                <div key={h.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-sm bg-nexus-500 dark:bg-nexus-600 transition-all hover:bg-nexus-600"
                    style={{ height: `${(h.revenue / maxRevenue) * 100}%`, minHeight: h.revenue > 0 ? '4px' : '0' }}
                    title={fmt(h.revenue)}
                  />
                  <span className="text-xs text-gray-400 truncate">{h.hour}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Channel breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Sales by Channel</h3>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse space-y-1">
                  <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700" />
                </div>
              ))}
            </div>
          ) : channelBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400">No sales data</p>
          ) : (
            <div className="space-y-3">
              {channelBreakdown.map((ch) => (
                <div key={ch.method}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{ch.method}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{ch.amount}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    <div className="h-full rounded-full bg-nexus-500" style={{ width: `${ch.pct}%` }} />
                  </div>
                  <p className="mt-0.5 text-right text-xs text-gray-400">{ch.pct}%</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top products */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">Top Products</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Product</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Units Sold</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Revenue</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-40">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3.5" colSpan={4}>
                      <div className="animate-pulse h-4 w-full rounded bg-gray-100 dark:bg-gray-700" />
                    </td>
                  </tr>
                ))
              : topProducts.length === 0
              ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">
                      No product sales data for this period
                    </td>
                  </tr>
                )
              : topProducts.map((p) => (
                  <tr key={p.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{p.name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{p.units}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{p.revenue}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                          <div className="h-full rounded-full bg-nexus-500" style={{ width: `${p.share}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs text-gray-500">{p.share}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
