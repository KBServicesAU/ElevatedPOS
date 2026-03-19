import type { Metadata } from 'next';
import { Download, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, BarChart2 } from 'lucide-react';

export const metadata: Metadata = { title: 'Reports' };

const hourlyRevenue = [
  { hour: '8am', revenue: 120 },
  { hour: '9am', revenue: 380 },
  { hour: '10am', revenue: 520 },
  { hour: '11am', revenue: 460 },
  { hour: '12pm', revenue: 680 },
  { hour: '1pm', revenue: 590 },
  { hour: '2pm', revenue: 340 },
  { hour: '3pm', revenue: 290 },
  { hour: '4pm', revenue: 410 },
  { hour: '5pm', revenue: 370 },
];

const topProducts = [
  { name: 'Flat White', units: 142, revenue: '$781.00', share: 82 },
  { name: 'Iced Latte', units: 98, revenue: '$588.00', share: 64 },
  { name: 'Croissant', units: 87, revenue: '$348.00', share: 55 },
  { name: 'Avocado Toast', units: 41, revenue: '$594.50', share: 38 },
  { name: 'Cold Brew', units: 76, revenue: '$380.00', share: 48 },
];

const paymentMethods = [
  { method: 'Card (Tap)', amount: '$2,840.00', pct: 66 },
  { method: 'Card (Chip)', amount: '$820.50', pct: 19 },
  { method: 'Cash', amount: '$420.00', pct: 10 },
  { method: 'Digital Wallet', amount: '$207.00', pct: 5 },
];

const maxRevenue = Math.max(...hourlyRevenue.map((h) => h.revenue));

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h2>
          <p className="text-sm text-gray-500">Thursday, 19 March 2026 · Main Location</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
            <option>Today</option>
            <option>Yesterday</option>
            <option>This Week</option>
            <option>This Month</option>
          </select>
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Gross Revenue', value: '$4,287.50', change: '+12.4%', up: true, icon: DollarSign },
          { label: 'Net Revenue', value: '$3,944.30', change: '+11.8%', up: true, icon: BarChart2 },
          { label: 'Transactions', value: '94', change: '+8.1%', up: true, icon: ShoppingCart },
          { label: 'New Customers', value: '12', change: '+33%', up: true, icon: Users },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500 dark:text-gray-400">{kpi.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
            <div className="mt-2 flex items-center gap-1">
              {kpi.up ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
              <span className={`text-sm font-medium ${kpi.up ? 'text-green-600' : 'text-red-600'}`}>{kpi.change}</span>
              <span className="text-sm text-gray-400">vs yesterday</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hourly revenue chart */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Revenue by Hour</h3>
          <div className="flex h-40 items-end gap-2">
            {hourlyRevenue.map((h) => (
              <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-sm bg-nexus-500 dark:bg-nexus-600 transition-all hover:bg-nexus-600"
                  style={{ height: `${(h.revenue / maxRevenue) * 100}%` }}
                />
                <span className="text-xs text-gray-400">{h.hour}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment methods */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Payment Methods</h3>
          <div className="space-y-3">
            {paymentMethods.map((pm) => (
              <div key={pm.method}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{pm.method}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{pm.amount}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-nexus-500"
                    style={{ width: `${pm.pct}%` }}
                  />
                </div>
                <p className="mt-0.5 text-right text-xs text-gray-400">{pm.pct}%</p>
              </div>
            ))}
          </div>
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
            {topProducts.map((p) => (
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
