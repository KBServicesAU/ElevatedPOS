import type { Metadata } from 'next';
import { Search, Filter, Eye, RefreshCw } from 'lucide-react';

export const metadata: Metadata = { title: 'Orders' };

const orders = [
  { id: 'ORD-1042', customer: 'Sarah Chen', items: 3, total: '$68.50', status: 'Completed', channel: 'In-Store', time: '2 min ago', payment: 'Card' },
  { id: 'ORD-1041', customer: 'Walk-in', items: 1, total: '$12.00', status: 'Completed', channel: 'In-Store', time: '8 min ago', payment: 'Cash' },
  { id: 'ORD-1040', customer: 'James Wilson', items: 5, total: '$143.20', status: 'Preparing', channel: 'Online', time: '12 min ago', payment: 'Card' },
  { id: 'ORD-1039', customer: 'Emma Davis', items: 2, total: '$34.00', status: 'Completed', channel: 'In-Store', time: '18 min ago', payment: 'Tap' },
  { id: 'ORD-1038', customer: 'Walk-in', items: 4, total: '$87.60', status: 'Completed', channel: 'In-Store', time: '25 min ago', payment: 'Card' },
  { id: 'ORD-1037', customer: 'Aisha Patel', items: 2, total: '$26.00', status: 'Refunded', channel: 'In-Store', time: '45 min ago', payment: 'Card' },
  { id: 'ORD-1036', customer: 'Uber Eats', items: 6, total: '$112.00', status: 'Completed', channel: 'Delivery', time: '1h ago', payment: 'Online' },
  { id: 'ORD-1035', customer: 'Walk-in', items: 1, total: '$5.50', status: 'Completed', channel: 'In-Store', time: '1h 10m ago', payment: 'Cash' },
];

const statusColors: Record<string, string> = {
  Completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Preparing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

const channelColors: Record<string, string> = {
  'In-Store': 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  Online: 'bg-nexus-50 text-nexus-600 dark:bg-nexus-900/20 dark:text-nexus-400',
  Delivery: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
};

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Orders</h2>
          <p className="text-sm text-gray-500">94 orders today · $4,287.50 revenue</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search orders..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-nexus-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
          <option value="">All Statuses</option>
          <option>Completed</option>
          <option>Preparing</option>
          <option>Refunded</option>
        </select>
        <select className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
          <option value="">All Channels</option>
          <option>In-Store</option>
          <option>Online</option>
          <option>Delivery</option>
        </select>
        <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <Filter className="h-4 w-4" /> More
        </button>
      </div>

      {/* Orders table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Order</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Customer</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Channel</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Items</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Total</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Time</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{order.id}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{order.customer}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${channelColors[order.channel] || 'bg-gray-100 text-gray-600'}`}>
                    {order.channel}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{order.items}</td>
                <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white">{order.total}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[order.status]}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">{order.time}</td>
                <td className="px-5 py-3.5">
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
