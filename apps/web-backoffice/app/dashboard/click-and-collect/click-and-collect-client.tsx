'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { Package, Plus, X, Trash2, Clock, AlertCircle, MapPin } from 'lucide-react';

type CollectStatus = 'pending' | 'picked' | 'packed' | 'ready' | 'dispatched' | 'collected' | 'cancelled';

interface CollectOrderItem {
  productName: string;
  qty: number;
  unitPrice: number;
}

interface CollectOrder {
  id: string;
  fulfillmentId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  status: CollectStatus;
  itemCount: number;
  itemsSummary: string;
  total: string | number;
  pickupReadyAt: string | null;
  notes: string | null;
  readyAt: string | null;
  createdAt: string;
}

interface CollectListResponse {
  data: CollectOrder[];
}

interface Location {
  id: string;
  name: string;
}

type FilterTab = 'all' | 'pending' | 'ready' | 'collected';

const STATUS_STYLES: Record<CollectStatus, string> = {
  pending:    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  picked:     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  packed:     'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  ready:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  dispatched: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  collected:  'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  cancelled:  'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

const STATUS_LABELS: Record<CollectStatus, string> = {
  pending:    'Preparing',
  picked:     'Picked',
  packed:     'Packed',
  ready:      'Ready for Pickup',
  dispatched: 'Dispatched',
  collected:  'Collected',
  cancelled:  'Cancelled',
};

const emptyItem = (): CollectOrderItem => ({ productName: '', qty: 1, unitPrice: 0 });

function subtotalOf(items: CollectOrderItem[]): number {
  return items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
}

export default function ClickAndCollectClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<CollectOrder[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readyingId, setReadyingId] = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    pickupLocationId: '',
    lineItems: [emptyItem()],
    notes: '',
    pickupReadyAt: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<CollectListResponse>('fulfillment/click-and-collect/list');
      setItems(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      const r = await apiFetch<{ data?: Location[] } | Location[]>('locations');
      const list = Array.isArray(r) ? r : (r.data ?? []);
      setLocations(list);
      // Default pickup location to first available so merchants with one
      // location don't have to pick every time.
      if (list.length > 0) {
        setForm((prev) => prev.pickupLocationId ? prev : { ...prev, pickupLocationId: list[0]!.id });
      }
    } catch {
      // Stay blank — /locations route may 401 or service be down.
    }
  }, []);

  useEffect(() => { load(); loadLocations(); }, [load, loadLocations]);

  function resetForm() {
    setForm({
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      pickupLocationId: locations[0]?.id ?? '',
      lineItems: [emptyItem()],
      notes: '',
      pickupReadyAt: '',
    });
  }

  function updateLineItem(index: number, field: keyof CollectOrderItem, value: string | number) {
    setForm((prev) => {
      const updated = [...prev.lineItems];
      updated[index] = { ...updated[index]!, [field]: value };
      return { ...prev, lineItems: updated };
    });
  }

  function addLineItem() {
    setForm((prev) => ({ ...prev, lineItems: [...prev.lineItems, emptyItem()] }));
  }

  function removeLineItem(index: number) {
    setForm((prev) => ({ ...prev, lineItems: prev.lineItems.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    if (!form.customerName) return;
    const validItems = form.lineItems.filter((it) => it.productName.trim() !== '');
    if (validItems.length === 0) {
      toast({ title: 'Add at least one item', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('fulfillment/click-and-collect/quick', {
        method: 'POST',
        body: JSON.stringify({
          customerName: form.customerName,
          customerEmail: form.customerEmail || undefined,
          customerPhone: form.customerPhone || undefined,
          pickupLocationId: form.pickupLocationId || undefined,
          items: validItems,
          notes: form.notes || undefined,
          pickupReadyAt: form.pickupReadyAt || undefined,
        }),
      });
      toast({
        title: 'Order created',
        description: `Click & Collect order for ${form.customerName} has been queued.`,
        variant: 'success',
      });
      resetForm();
      setShowModal(false);
      await load();
    } catch (err) {
      toast({ title: 'Failed to create order', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // Move a pending order all the way through pick → pack → ready in one click.
  // Merchants doing this from the dashboard (not POS) don't care about the
  // intermediate states; they just want "it's ready for pickup."
  async function handleMarkReady(id: string) {
    setReadyingId(id);
    try {
      await apiFetch(`fulfillment/${id}/pick`, { method: 'POST' });
      await apiFetch(`fulfillment/${id}/pack`, { method: 'POST' });
      await apiFetch(`fulfillment/${id}/ready`, { method: 'POST' });
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, status: 'ready' as CollectStatus, readyAt: new Date().toISOString() } : it));
      toast({ title: 'Marked ready for pickup', variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to mark ready', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setReadyingId(null);
    }
  }

  async function handleMarkCollected(id: string) {
    setCollectingId(id);
    try {
      await apiFetch(`fulfillment/${id}/collect`, { method: 'POST' });
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, status: 'collected' as CollectStatus } : it));
      toast({ title: 'Marked as collected', variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to mark collected', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setCollectingId(null);
    }
  }

  const counts = {
    all: items.length,
    pending: items.filter((i) => ['pending', 'picked', 'packed'].includes(i.status)).length,
    ready: items.filter((i) => i.status === 'ready').length,
    collected: items.filter((i) => i.status === 'collected').length,
  };

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all',       label: `All (${counts.all})` },
    { id: 'pending',   label: `Preparing (${counts.pending})` },
    { id: 'ready',     label: `Ready (${counts.ready})` },
    { id: 'collected', label: `Collected (${counts.collected})` },
  ];

  const filtered = activeTab === 'all'
    ? items
    : activeTab === 'pending'
      ? items.filter((i) => ['pending', 'picked', 'packed'].includes(i.status))
      : items.filter((i) => i.status === activeTab);

  const previewTotal = subtotalOf(form.lineItems);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Click &amp; Collect</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Create and manage orders for customer pickup
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void load(); }}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Order
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-5 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-elevatedpos-500 text-elevatedpos-600 dark:text-elevatedpos-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 dark:border-gray-700 dark:bg-gray-800/40">
          <Package className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">No orders here yet</p>
          <p className="mt-1 text-sm text-gray-400">
            {activeTab === 'all' ? 'Click New Order to create one.' : `No ${activeTab} orders.`}
          </p>
        </div>
      )}

      {/* Order cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                <Package className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-gray-400">{order.orderNumber}</span>
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">{order.customerName}</span>
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status]}`}>
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">{order.itemsSummary}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                  <span>{order.itemCount} item{order.itemCount !== 1 ? 's' : ''}</span>
                  <span>${Number(order.total).toFixed(2)}</span>
                  {order.pickupReadyAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Pickup: {order.pickupReadyAt}
                    </span>
                  )}
                </div>
              </div>

              {['pending', 'picked', 'packed'].includes(order.status) && (
                <button
                  onClick={() => handleMarkReady(order.id)}
                  disabled={readyingId === order.id}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors"
                >
                  {readyingId === order.id ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : null}
                  Mark Ready
                </button>
              )}

              {order.status === 'ready' && (
                <button
                  onClick={() => handleMarkCollected(order.id)}
                  disabled={collectingId === order.id}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-60 transition-colors"
                >
                  {collectingId === order.id ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : null}
                  Mark Collected
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Order Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">New Click &amp; Collect Order</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              {/* Customer */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jane Smith"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Customer Email</label>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    value={form.customerEmail}
                    onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Customer Phone</label>
                  <input
                    type="tel"
                    placeholder="+61 4xx xxx xxx"
                    value={form.customerPhone}
                    onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                </div>
              </div>

              {/* Pickup location */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  <MapPin className="h-3 w-3 inline-block mr-1" />
                  Pickup Location
                </label>
                {locations.length > 0 ? (
                  <select
                    value={form.pickupLocationId}
                    onChange={(e) => setForm({ ...form, pickupLocationId: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400">No locations found — the order will default to your most recent location.</p>
                )}
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Items <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="flex items-center gap-1 text-xs text-elevatedpos-600 hover:text-elevatedpos-500 dark:text-elevatedpos-400"
                  >
                    <Plus className="h-3 w-3" /> Add Row
                  </button>
                </div>
                <div className="space-y-2">
                  {form.lineItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Product name"
                        value={item.productName}
                        onChange={(e) => updateLineItem(idx, 'productName', e.target.value)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.qty}
                        onChange={(e) => updateLineItem(idx, 'qty', Number(e.target.value))}
                        className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit $"
                        value={item.unitPrice || ''}
                        onChange={(e) => updateLineItem(idx, 'unitPrice', Number(e.target.value))}
                        className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      />
                      {form.lineItems.length > 1 && (
                        <button onClick={() => removeLineItem(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pickup ready time + notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Pickup Ready Time</label>
                <input
                  type="datetime-local"
                  value={form.pickupReadyAt}
                  onChange={(e) => setForm({ ...form, pickupReadyAt: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
                <p className="mt-1 text-xs text-gray-400">Optional — when you expect this order to be ready.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Notes</label>
                <textarea
                  rows={3}
                  placeholder="Special instructions, gift message, etc..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 resize-none"
                />
              </div>

              {/* Preview Total */}
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Estimated Total</span>
                <span className="text-base font-bold text-gray-900 dark:text-white">${previewTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleSave(); }}
                disabled={!form.customerName || saving}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
                Create Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
