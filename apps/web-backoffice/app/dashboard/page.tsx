import type { Metadata } from 'next';
import {
  TrendingUp, TrendingDown, ShoppingCart, Users,
  DollarSign, Package, AlertTriangle, ArrowUpRight,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Dashboard' };

function StatCard({
  label, value, change, trend, icon: Icon, color,
}: {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {trend === 'up' ? (
          <TrendingUp className="h-4 w-4 text-green-500" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-500" />
        )}
        <span className={`text-sm font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
          {change}
        </span>
        <span className="text-sm text-gray-400">vs yesterday</span>
      </div>
    </div>
  );
}

const recentOrders = [
  { id: 'ORD-1042', customer: 'Sarah Chen', items: 3, total: '$68.50', status: 'Completed', time: '2 min ago' },
  { id: 'ORD-1041', customer: 'Walk-in', items: 1, total: '$12.00', status: 'Completed', time: '8 min ago' },
  { id: 'ORD-1040', customer: 'James Wilson', items: 5, total: '$143.20', status: 'Preparing', time: '12 min ago' },
  { id: 'ORD-1039', customer: 'Emma Davis', items: 2, total: '$34.00', status: 'Completed', time: '18 min ago' },
  { id: 'ORD-1038', customer: 'Walk-in', items: 4, total: '$87.60', status: 'Completed', time: '25 min ago' },
];

const alerts = [
  { type: 'warning', message: 'Oat Milk — only 2 units remaining', action: 'Order now' },
  { type: 'warning', message: 'Single Origin Beans — reorder point reached', action: 'Create PO' },
  { type: 'info', message: '3 online orders awaiting acceptance', action: 'View orders' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Good morning, Jane 👋</h2>
          <p className="text-sm text-gray-500">Thursday, 19 March 2026 · Main Location</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
            <option>Today</option>
            <option>Yesterday</option>
            <option>This Week</option>
            <option>This Month</option>
          </select>
          <button className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            Export
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Revenue Today" value="$4,287.50" change="+12.4%" trend="up" icon={DollarSign} color="bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
        <StatCard label="Transactions" value="94" change="+8.1%" trend="up" icon={ShoppingCart} color="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard label="Avg Order Value" value="$45.61" change="-3.2%" trend="down" icon={TrendingUp} color="bg-nexus-50 text-nexus-600 dark:bg-nexus-900/30 dark:text-nexus-400" />
        <StatCard label="New Customers" value="12" change="+33%" trend="up" icon={Users} color="bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent orders */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Orders</h3>
            <button className="flex items-center gap-1 text-sm text-nexus-600 hover:text-nexus-500">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-800">
                    {order.customer.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{order.customer}</p>
                    <p className="text-xs text-gray-400">{order.id} · {order.items} item{order.items !== 1 ? 's' : ''} · {order.time}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{order.total}</p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${order.status === 'Completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Alerts</h3>
          </div>
          <div className="space-y-3 p-4">
            {alerts.map((alert, i) => (
              <div key={i} className={`rounded-lg p-3.5 ${alert.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-blue-50 dark:bg-blue-900/20'}`}>
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className={`mt-0.5 h-4 w-4 flex-shrink-0 ${alert.type === 'warning' ? 'text-amber-500' : 'text-blue-500'}`} />
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{alert.message}</p>
                    <button className={`mt-1.5 text-xs font-medium ${alert.type === 'warning' ? 'text-amber-600 hover:text-amber-700 dark:text-amber-400' : 'text-blue-600 hover:text-blue-700 dark:text-blue-400'}`}>
                      {alert.action} →
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center dark:border-gray-700">
              <Package className="mx-auto mb-1.5 h-5 w-5 text-gray-300" />
              <p className="text-xs text-gray-400">No more alerts right now</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
