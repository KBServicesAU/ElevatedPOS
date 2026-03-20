'use client';

import { useState } from 'react';
import { Search, Filter, Eye, RefreshCw, Loader2 } from 'lucide-react';
import { useOrders, useInvalidateOrders } from '../../../lib/hooks';
import type { Order } from '../../../lib/api';

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  preparing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  void: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

const channelColors: Record<string, string> = {
  pos: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  online: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400',
  delivery: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  kiosk: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  marketplace: 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400',
};

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function OrdersClient() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const invalidate = useInvalidateOrders();

  const { data, isLoading, isError, refetch, isFetching } = useOrders({
    search: search || undefined,
    status: statusFilter || undefined,
    channel: channelFilter || undefined,
    limit: 50,
  });

  const orders = data?.data ?? [];
  const total = data?.pagination?.total ?? orders.length;
  const revenue = orders.reduce((sum, o) => sum + (o.total ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Orders</h2>
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <p className="text-sm text-gray-500">
              {total} orders · {formatCurrency(revenue)} revenue
            </p>
          )}
        </div>
        <button
          onClick={() => { void refetch(); void invalidate(); }}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="preparing">Preparing</option>
          <option value="completed">Completed</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="">All Channels</option>
          <option value="pos">In-Store</option>
          <option value="online">Online</option>
          <option value="delivery">Delivery</option>
          <option value="kiosk">Kiosk</option>
        </select>
        <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <Filter className="h-4 w-4" /> More
        </button>
      </div>

      {/* Orders table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {isError ? (
          <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">
            Failed to load orders.{' '}
            <button onClick={() => void refetch()} className="underline">
              Retry
            </button>
          </div>
        ) : (
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
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: j === 7 ? 24 : '80%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : orders.map((order: Order) => (
                    <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white font-mono">
                        {order.orderNumber}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                        {order.customerName ?? 'Walk-in'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${channelColors[order.channel] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {order.channel === 'pos' ? 'In-Store' : order.channel}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{order.itemCount}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[order.status] ?? 'bg-gray-100 text-gray-500'}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                        {timeAgo(order.createdAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
              {!isLoading && orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
