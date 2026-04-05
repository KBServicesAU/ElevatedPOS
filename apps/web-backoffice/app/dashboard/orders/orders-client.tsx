'use client';

import { useState } from 'react';
import { Search, Filter, Eye, RefreshCw, Loader2, X, RotateCcw, ChevronDown, ChevronUp, Mail, MessageSquare, Send } from 'lucide-react';
import { useOrders, useInvalidateOrders } from '@/lib/hooks';
import { apiFetch } from '@/lib/api';
import type { Order, OrderLineItem } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { formatDollars, timeAgo, getErrorMessage } from '@/lib/formatting';

const statusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  preparing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
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

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'completed', label: 'Completed' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'cancelled', label: 'Cancelled' },
];

const REFUND_REASONS = [
  { value: 'duplicate', label: 'Duplicate order' },
  { value: 'customer_request', label: 'Customer request' },
  { value: 'defective', label: 'Defective product' },
  { value: 'other', label: 'Other' },
];

const STATUS_TIMELINE: Record<string, string[]> = {
  pending: ['pending'],
  preparing: ['pending', 'preparing'],
  processing: ['pending', 'processing'],
  completed: ['pending', 'preparing', 'completed'],
  refunded: ['pending', 'preparing', 'completed', 'refunded'],
  cancelled: ['pending', 'cancelled'],
};

interface RefundItem {
  id: string;
  selected: boolean;
  qty: number;
  maxQty: number;
  name: string;
  unitPrice: number;
}

interface OrderNote {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export function OrdersClient() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const invalidate = useInvalidateOrders();
  const [limit, setLimit] = useState(50);

  const { data, isLoading, isError, refetch, isFetching } = useOrders({
    search: search || undefined,
    status: statusFilter || undefined,
    channel: channelFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit,
  });

  const activeDateFilters = [dateFrom, dateTo].filter(Boolean).length;

  const orders = data?.data ?? [];
  const total = data?.pagination?.total ?? orders.length;
  const revenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  // Shared line items state — fetched once per order, reused by both detail and refund modals
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<OrderLineItem[]>([]);
  const [detailItemsLoading, setDetailItemsLoading] = useState(false);

  async function loadOrderItems(order: Order): Promise<OrderLineItem[]> {
    // Return cached items if already loaded for this order
    if (loadedOrderId === order.id && detailItems.length > 0) return detailItems;
    setDetailItemsLoading(true);
    try {
      const res = await apiFetch<{ data: OrderLineItem[] }>(`orders/${order.id}/items`);
      const items = Array.isArray(res.data) ? res.data : [];
      setDetailItems(items);
      setLoadedOrderId(order.id);
      return items;
    } catch {
      return [];
    } finally {
      setDetailItemsLoading(false);
    }
  }

  // Detail modal
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  // Internal notes state
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Cancel order state
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);

  // Email receipt state
  const [emailReceiptOpen, setEmailReceiptOpen] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [sendingReceipt, setSendingReceipt] = useState(false);

  async function loadNotes(orderId: string) {
    setNotesLoading(true);
    try {
      const res = await apiFetch<{ data: OrderNote[] }>(`orders/${orderId}/notes`);
      setNotes(Array.isArray(res.data) ? res.data : []);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }

  async function handleToggleNotes() {
    if (!detailOrder) return;
    const opening = !notesOpen;
    setNotesOpen(opening);
    if (opening && notes.length === 0) {
      await loadNotes(detailOrder.id);
    }
  }

  async function handleAddNote() {
    if (!detailOrder || !newNoteBody.trim()) return;
    setAddingNote(true);
    try {
      const res = await apiFetch<{ data: OrderNote }>(`orders/${detailOrder.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: newNoteBody.trim() }),
      });
      setNotes((prev) => [...prev, res.data]);
      setNewNoteBody('');
      toast({ title: 'Note added', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Failed to add note',
        description: getErrorMessage(err, 'Could not save note.'),
        variant: 'destructive',
      });
    } finally {
      setAddingNote(false);
    }
  }

  async function handleSendReceipt() {
    if (!detailOrder || !receiptEmail.trim()) return;
    setSendingReceipt(true);
    try {
      await apiFetch(`orders/${detailOrder.id}/send-receipt`, {
        method: 'POST',
        body: JSON.stringify({ email: receiptEmail.trim() }),
      });
      toast({ title: `Receipt sent to ${receiptEmail.trim()}`, variant: 'success' });
      setEmailReceiptOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to send receipt',
        description: getErrorMessage(err, 'Could not send receipt.'),
        variant: 'destructive',
      });
    } finally {
      setSendingReceipt(false);
    }
  }

  async function openDetail(order: Order) {
    setDetailOrder(order);
    setRefundOrder(null);
    setNotesOpen(false);
    setNotes([]);
    setNewNoteBody('');
    setEmailReceiptOpen(false);
    setCancelConfirmOpen(false);
    setReceiptEmail((order as Order & { customerEmail?: string }).customerEmail ?? '');
    if (loadedOrderId !== order.id) setDetailItems([]);
    await loadOrderItems(order);
  }

  // Refund modal
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundItems, setRefundItems] = useState<RefundItem[]>([]);
  const [refundReason, setRefundReason] = useState('customer_request');
  const [refundNotes, setRefundNotes] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);

  async function openRefund(order: Order) {
    setRefundOrder(order);
    setDetailOrder(null);
    const items = await loadOrderItems(order);
    if (items.length > 0) {
      setRefundItems(
        items.map((item) => ({
          id: item.id,
          selected: false,
          qty: item.qty,
          maxQty: item.qty,
          name: item.productName,
          unitPrice: item.unitPrice,
        })),
      );
    } else {
      // Fallback: allow refund with item count from order summary
      setRefundItems(
        Array.from({ length: order.itemCount ?? 1 }, (_, i) => ({
          id: String(i),
          selected: false,
          qty: 1,
          maxQty: 1,
          name: `Item ${i + 1}`,
          unitPrice: (Number(order.total) || 0) / (order.itemCount ?? 1),
        })),
      );
    }
    setRefundReason('customer_request');
    setRefundNotes('');
  }

  async function handleProcessRefund() {
    if (!refundOrder) return;
    setProcessingRefund(true);
    const selectedItems = refundItems.filter((i) => i.selected);
    try {
      await apiFetch('refunds', {
        method: 'POST',
        body: JSON.stringify({
          orderId: refundOrder.id,
          items: selectedItems.map(({ id, qty }) => ({ id, qty })),
          reason: refundReason,
          notes: refundNotes,
        }),
      });
      toast({ title: 'Refund processed', description: `Refund for order ${refundOrder.orderNumber ?? refundOrder.id} has been submitted.`, variant: 'success' });
      invalidate();
      setRefundOrder(null);
    } catch (err) {
      toast({
        title: 'Refund failed',
        description: getErrorMessage(err, 'Could not process refund. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setProcessingRefund(false);
    }
  }

  async function handleCancelOrder() {
    if (!detailOrder) return;
    setCancellingOrder(true);
    try {
      await apiFetch(`orders/${detailOrder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const cancelledOrder = { ...detailOrder, status: 'cancelled' as const };
      setDetailOrder(cancelledOrder);
      invalidate();
      setCancelConfirmOpen(false);
      toast({
        title: 'Order cancelled',
        description: `Order ${detailOrder.orderNumber ?? detailOrder.id} has been cancelled.`,
        variant: 'destructive',
      });
    } catch (err) {
      toast({
        title: 'Failed to cancel order',
        description: getErrorMessage(err, 'Could not cancel this order.'),
        variant: 'destructive',
      });
    } finally {
      setCancellingOrder(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Orders</h2>
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <p className="text-sm text-gray-500">
              {total} orders · {formatDollars(revenue)} revenue
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

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit dark:border-gray-800 dark:bg-gray-900">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === key
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
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
        <button
          onClick={() => setShowMoreFilters((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            showMoreFilters || activeDateFilters > 0
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          <Filter className="h-4 w-4" />
          More
          {activeDateFilters > 0 && (
            <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
              {activeDateFilters}
            </span>
          )}
        </button>
      </div>

      {/* Extended filter panel */}
      {showMoreFilters && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {activeDateFilters > 0 && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 dark:text-gray-400"
            >
              <X className="h-3.5 w-3.5" /> Clear dates
            </button>
          )}
        </div>
      )}

      {/* Orders table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {isError ? (
          <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">
            Failed to load orders.{' '}
            <button onClick={() => void refetch()} className="underline">
              Retry
            </button>
          </div>
        ) : (
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Order</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Customer</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Channel</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Items</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Total</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Time</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: j === 7 ? 60 : '80%' }} />
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
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{order.itemCount ?? order.lines?.length ?? '—'}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white">
                        {formatDollars(order.total)}
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openDetail(order)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {order.status !== 'refunded' && order.status !== 'cancelled' && (
                            <button
                              onClick={() => openRefund(order)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                              title="Refund"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
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

      {/* Pagination */}
      {!isLoading && orders.length > 0 && total > orders.length && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {orders.length} of {total} orders
          </p>
          <button
            onClick={() => setLimit((prev) => prev + 50)}
            disabled={isFetching}
            className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
          >
            {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
            {isFetching ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {/* Order Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl dark:bg-gray-900 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white font-mono">
                  {detailOrder.orderNumber}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{timeAgo(detailOrder.createdAt)}</p>
              </div>
              <button
                onClick={() => setDetailOrder(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Customer info */}
              <div className="rounded-lg border border-gray-100 p-4 dark:border-gray-800">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Customer</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {detailOrder.customerName ?? 'Walk-in Customer'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Channel: {detailOrder.channel === 'pos' ? 'In-Store' : detailOrder.channel}
                </p>
              </div>

              {/* Line items */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Line Items</p>
                {detailItemsLoading ? (
                  <div className="space-y-2 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                    {Array.from({ length: detailOrder.itemCount ?? 2 }).map((_, i) => (
                      <div key={i} className="flex animate-pulse justify-between">
                        <div className="h-4 w-48 rounded bg-gray-100 dark:bg-gray-700" />
                        <div className="h-4 w-16 rounded bg-gray-100 dark:bg-gray-700" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Unit Price</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {detailItems.length > 0 ? detailItems.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-white">
                              {item.productName}
                              {item.sku && <span className="ml-1.5 text-xs text-gray-400">{item.sku}</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400">{item.qty}</td>
                            <td className="px-4 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400">{formatDollars(item.unitPrice)}</td>
                            <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-900 dark:text-white">{formatDollars(item.lineTotal ?? item.qty * item.unitPrice)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={4} className="px-4 py-4 text-center text-sm text-gray-400">Line items unavailable</td></tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200 dark:border-gray-700">
                          <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900 dark:text-white">Total</td>
                          <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900 dark:text-white">{formatDollars(detailOrder.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Payment & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-gray-100 p-4 dark:border-gray-800">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Payment Method</p>
                  <p className="font-medium text-gray-900 dark:text-white capitalize">
                    {detailOrder.paymentMethod ?? 'Card'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-4 dark:border-gray-800">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Status</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[detailOrder.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {detailOrder.status}
                  </span>
                </div>
              </div>

              {/* Order Timeline */}
              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Order Timeline</p>
                <div className="flex items-center gap-2">
                  {(STATUS_TIMELINE[detailOrder.status] ?? ['pending']).map((step, idx, arr) => (
                    <div key={step} className="flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                        <p className="mt-1 text-xs text-gray-500 capitalize whitespace-nowrap">{step}</p>
                      </div>
                      {idx < arr.length - 1 && (
                        <div className="mb-4 h-0.5 w-8 bg-indigo-200 dark:bg-indigo-800" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Email Receipt */}
              <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
                <button
                  onClick={() => setEmailReceiptOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Receipt</span>
                  </div>
                  {emailReceiptOpen ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {emailReceiptOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3 bg-gray-50/50 dark:bg-gray-800/20">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={receiptEmail}
                        onChange={(e) => setReceiptEmail(e.target.value)}
                        placeholder="customer@example.com"
                        className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      <button
                        onClick={() => { void handleSendReceipt(); }}
                        disabled={sendingReceipt || !receiptEmail.trim()}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                      >
                        {sendingReceipt ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Send Receipt
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Internal Notes */}
              <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
                <button
                  onClick={() => { void handleToggleNotes(); }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Internal Notes</span>
                    {notes.length > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                        {notes.length}
                      </span>
                    )}
                  </div>
                  {notesOpen ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </button>

                {notesOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                    {/* Notes thread */}
                    <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
                      {notesLoading ? (
                        <div className="space-y-2">
                          {[1, 2].map((i) => (
                            <div key={i} className="animate-pulse space-y-1">
                              <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                              <div className="h-10 rounded bg-gray-200 dark:bg-gray-700" />
                            </div>
                          ))}
                        </div>
                      ) : notes.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">No notes yet. Add the first one below.</p>
                      ) : (
                        notes.map((note) => (
                          <div key={note.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{note.author}</span>
                              <span className="text-xs text-gray-400">{timeAgo(note.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.body}</p>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add note */}
                    <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-2">
                      <textarea
                        value={newNoteBody}
                        onChange={(e) => setNewNoteBody(e.target.value)}
                        rows={2}
                        placeholder="Add an internal note…"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => { void handleAddNote(); }}
                          disabled={addingNote || !newNoteBody.trim()}
                          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                        >
                          {addingNote ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5" />
                          )}
                          Add Note
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              <div className="flex items-center gap-2">
                {/* Cancel Order */}
                {(['open', 'pending', 'processing'] as const).includes(detailOrder.status as 'open' | 'pending' | 'processing') && (
                  cancelConfirmOpen ? (
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Cancel this order? This cannot be undone.</span>
                      <button
                        onClick={() => { void handleCancelOrder(); }}
                        disabled={cancellingOrder}
                        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {cancellingOrder && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Confirm Cancel
                      </button>
                      <button
                        onClick={() => setCancelConfirmOpen(false)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setCancelConfirmOpen(true)}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                    >
                      Cancel Order
                    </button>
                  )
                )}
              </div>
              <div className="flex items-center gap-3">
                {detailOrder.status !== 'refunded' && detailOrder.status !== 'cancelled' && (
                  <button
                    onClick={() => openRefund(detailOrder)}
                    className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Refund
                  </button>
                )}
                <button
                  onClick={() => setDetailOrder(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-gray-900 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Refund — {refundOrder.orderNumber}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Select items to refund</p>
              </div>
              <button
                onClick={() => setRefundOrder(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 p-6">
              {/* Item selection */}
              <div className="space-y-2">
                {refundItems.map((item, idx) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 cursor-pointer hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) =>
                        setRefundItems((prev) =>
                          prev.map((i, j) => (j === idx ? { ...i, selected: e.target.checked } : i)),
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDollars(item.unitPrice)} each</p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={item.maxQty}
                      value={item.qty}
                      disabled={!item.selected}
                      onChange={(e) =>
                        setRefundItems((prev) =>
                          prev.map((i, j) =>
                            j === idx ? { ...i, qty: Math.min(Number(e.target.value), item.maxQty) } : i,
                          ),
                        )
                      }
                      className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-right focus:border-indigo-500 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </label>
                ))}
              </div>

              {/* Reason */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Refund Reason</label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {REFUND_REASONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes (optional)</label>
                <textarea
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional notes…"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {/* Refund total */}
              {refundItems.some((i) => i.selected) && (
                <div className="rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Refund total:{' '}
                    <strong>
                      {formatDollars(
                        refundItems
                          .filter((i) => i.selected)
                          .reduce((s, i) => s + i.qty * i.unitPrice, 0),
                      )}
                    </strong>
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              <button
                onClick={() => setRefundOrder(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRefund}
                disabled={processingRefund || !refundItems.some((i) => i.selected)}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {processingRefund && <Loader2 className="h-4 w-4 animate-spin" />}
                Process Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
