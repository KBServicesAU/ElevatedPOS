'use client';

import { useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShoppingCart,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderItem {
  id: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
  sku?: string;
}

interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  total?: number;
  createdAt?: string;
  customerName?: string;
  customerEmail?: string;
  items?: OrderItem[];
  itemCount?: number;
}

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | '';

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function statusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800';
    case 'ready':
      return 'bg-purple-100 text-purple-800';
    case 'confirmed':
      return 'bg-teal-100 text-teal-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
}

function fmt(amount?: number): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount / 100);
}

// ---------------------------------------------------------------------------
// Expanded row: line items
// ---------------------------------------------------------------------------

function ExpandedRow({ order }: { order: Order }) {
  const items = order.items ?? [];

  return (
    <tr>
      <td colSpan={6} className="px-5 py-0">
        <div className="border border-gray-200 rounded-lg my-3 overflow-hidden">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">No line item details available.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 text-sm text-gray-800">{item.name ?? item.id}</td>
                    <td className="px-4 py-2 text-sm text-gray-500 font-mono">{item.sku ?? '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 text-center">{item.quantity ?? '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 text-right">{fmt(item.unitPrice)}</td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">{fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Order row
// ---------------------------------------------------------------------------

function OrderRow({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const itemCount = order.itemCount ?? order.items?.length ?? 0;

  return (
    <>
      <tr
        className="hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-1.5">
            {expanded ? (
              <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
            )}
            <span className="text-sm font-medium text-gray-900 font-mono">
              {order.orderNumber ?? order.id.slice(0, 8)}
            </span>
          </div>
        </td>
        <td className="px-5 py-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadgeClass(
              order.status
            )}`}
          >
            {order.status.replace('_', ' ')}
          </span>
        </td>
        <td className="px-5 py-3 text-sm text-gray-600 text-center">{itemCount || '—'}</td>
        <td className="px-5 py-3 text-sm font-medium text-gray-900 text-right">{fmt(order.total)}</td>
        <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">
          {order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}
        </td>
        <td className="px-5 py-3 text-sm text-gray-600">
          {order.customerName ?? order.customerEmail ?? '—'}
        </td>
      </tr>
      {expanded && <ExpandedRow order={order} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function OrdersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [orgId, setOrgId] = useState(searchParams.get('orgId') ?? '');
  const [orgIdInput, setOrgIdInput] = useState(searchParams.get('orgId') ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState<OrderStatus>('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchOrders = useCallback(
    async (oId: string, from: string, to: string, st: OrderStatus) => {
      if (!oId.trim()) return;
      setLoading(true);
      setFetchError('');
      try {
        const params = new URLSearchParams({ orgId: oId });
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (st) params.set('status', st);

        const res = await fetch(`/api/proxy/orders?${params.toString()}`);
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        if (!res.ok) {
          const msg =
            (data as { message?: string; error?: string })?.message ??
            (data as { message?: string; error?: string })?.error ??
            `HTTP ${res.status}`;
          throw new Error(msg);
        }

        if (Array.isArray(data)) {
          setOrders(data as Order[]);
        } else if (data && typeof data === 'object') {
          const d = data as Record<string, unknown>;
          if (Array.isArray(d['orders'])) setOrders(d['orders'] as Order[]);
          else if (Array.isArray(d['data'])) setOrders(d['data'] as Order[]);
          else setOrders([]);
        } else {
          setOrders([]);
        }
      } catch (err) {
        setFetchError((err as Error).message);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const id = orgIdInput.trim();
    if (!id) return;
    setOrgId(id);
    router.replace(`/dashboard/orders?orgId=${encodeURIComponent(id)}`);
    fetchOrders(id, dateFrom, dateTo, status);
  }

  function handleRefresh() {
    fetchOrders(orgId, dateFrom, dateTo, status);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <ShoppingCart size={24} className="text-blue-700" />
            Order Lookup
          </h1>
          <p className="text-sm text-gray-500 mt-1">Look up orders for any merchant by org ID</p>
        </div>
        {orgId && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
          Search Filters
        </p>
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Org ID */}
          <div className="flex gap-3 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Organisation UUID…"
                value={orgIdInput}
                onChange={(e) => setOrgIdInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-mono"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              disabled={!orgIdInput.trim() || loading}
              className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Search
            </button>
          </div>

          {/* Date range + status */}
          <div className="flex flex-wrap gap-3 max-w-2xl">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </form>
        {orgId && (
          <p className="mt-3 text-xs text-gray-400">
            Showing orders for: <span className="font-mono text-gray-600">{orgId}</span>
          </p>
        )}
      </div>

      {/* Results */}
      {orgId && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Results</span>
            {!loading && orders.length > 0 && (
              <span className="text-xs text-gray-400">
                {orders.length} order{orders.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              Loading orders…
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-red-500">
              <AlertCircle size={20} />
              <span>{fetchError}</span>
              <button
                onClick={handleRefresh}
                className="mt-1 text-xs text-blue-600 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="py-14 text-center text-sm text-gray-400">
              No orders found for this organisation.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order #
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created At
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!orgId && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <ShoppingCart size={40} className="opacity-30" />
          <p className="text-sm">Enter an organisation ID above to search its orders.</p>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 p-6">Loading…</div>}>
      <OrdersContent />
    </Suspense>
  );
}
