'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, ArrowLeftRight, Package, Search, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransferLine {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  requestedQty: string;
  dispatchedQty: string;
  receivedQty: string;
}

interface StockTransfer {
  id: string;
  transferNumber: string;
  fromLocationId: string;
  toLocationId: string;
  status: 'requested' | 'approved' | 'dispatched' | 'received' | 'cancelled';
  notes?: string;
  createdAt: string;
  dispatchedAt?: string;
  receivedAt?: string;
  lines: TransferLine[];
}

interface Location {
  id: string;
  name: string;
  type: string;
}

interface NewLine {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const b = await res.json(); message = b.message ?? b.error ?? message; } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

const STATUS_BADGE: Record<string, string> = {
  requested: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  approved:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  dispatched:'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  received:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ─── New Transfer Modal ────────────────────────────────────────────────────────

function NewTransferModal({
  locations,
  onClose,
  onCreated,
}: {
  locations: Location[];
  onClose: () => void;
  onCreated: (t: StockTransfer) => void;
}) {
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<NewLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addLine = () => {
    if (!productSearch.trim() || quantity <= 0) return;
    setLines((prev) => [
      ...prev,
      {
        productId: crypto.randomUUID(),
        productName: productName || productSearch,
        sku: sku || productSearch,
        quantity,
      },
    ]);
    setProductSearch('');
    setProductName('');
    setSku('');
    setQuantity(1);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!fromLocationId || !toLocationId || lines.length === 0) {
      setError('Please select both locations and add at least one item.');
      return;
    }
    if (fromLocationId === toLocationId) {
      setError('Source and destination locations must be different.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<{ data: StockTransfer }>('transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromLocationId,
          toLocationId,
          notes: notes || undefined,
          lines: lines.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            sku: l.sku,
            requestedQty: l.quantity,
          })),
        }),
      });
      onCreated(result.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create transfer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">New Stock Transfer</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Locations */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">From Location</label>
              <select
                value={fromLocationId}
                onChange={(e) => setFromLocationId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="">Select…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">To Location</label>
              <select
                value={toLocationId}
                onChange={(e) => setToLocationId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="">Select…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Add line */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Add Item</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setProductName(e.target.value); setSku(e.target.value); }}
                  placeholder="Product name / SKU…"
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <button
                onClick={addLine}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Add
              </button>
            </div>
          </div>

          {/* Lines table */}
          {lines.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{line.productName}</td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{line.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeLine(i)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any notes about this transfer…"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────

function TransferDrawer({
  transfer,
  locationMap,
  onClose,
  onUpdated,
}: {
  transfer: StockTransfer;
  locationMap: Record<string, string>;
  onClose: () => void;
  onUpdated: (t: StockTransfer) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const performAction = async (action: 'send' | 'receive' | 'cancel') => {
    setError('');
    setLoading(true);
    try {
      const result = await apiFetch<{ data: StockTransfer }>(`transfers/${transfer.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      onUpdated(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} transfer`);
    } finally {
      setLoading(false);
    }
  };

  const canSend = ['requested', 'approved'].includes(transfer.status);
  const canReceive = transfer.status === 'dispatched';
  const canCancel = ['requested', 'approved'].includes(transfer.status);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{transfer.transferNumber}</h2>
          <StatusBadge status={transfer.status} />
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        {/* Route */}
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex-1 text-center">
            <p className="text-xs text-gray-400">From</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {locationMap[transfer.fromLocationId] ?? transfer.fromLocationId}
            </p>
          </div>
          <ArrowLeftRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <div className="flex-1 text-center">
            <p className="text-xs text-gray-400">To</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {locationMap[transfer.toLocationId] ?? transfer.toLocationId}
            </p>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Created</p>
            <p className="text-gray-700 dark:text-gray-300">{new Date(transfer.createdAt).toLocaleDateString()}</p>
          </div>
          {transfer.dispatchedAt && (
            <div>
              <p className="text-xs text-gray-400">Dispatched</p>
              <p className="text-gray-700 dark:text-gray-300">{new Date(transfer.dispatchedAt).toLocaleDateString()}</p>
            </div>
          )}
          {transfer.receivedAt && (
            <div>
              <p className="text-xs text-gray-400">Received</p>
              <p className="text-gray-700 dark:text-gray-300">{new Date(transfer.receivedAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>

        {/* Notes */}
        {transfer.notes && (
          <div>
            <p className="text-xs text-gray-400">Notes</p>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{transfer.notes}</p>
          </div>
        )}

        {/* Lines */}
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">Items ({transfer.lines.length})</p>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Product</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Req.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Rcv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {transfer.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900 dark:text-white">{line.productName}</p>
                      <p className="text-xs text-gray-400">{line.sku}</p>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                      {line.requestedQty}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                      {line.receivedQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Actions */}
      {(canSend || canReceive || canCancel) && (
        <div className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-800">
          {canSend && (
            <button
              onClick={() => performAction('send')}
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          )}
          {canReceive && (
            <button
              onClick={() => performAction('receive')}
              disabled={loading}
              className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Receive
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => performAction('cancel')}
              disabled={loading}
              className="flex-1 rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function TransfersClient() {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l.name]));

  const loadTransfers = useCallback(async () => {
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const result = await apiFetch<{ data: StockTransfer[] }>(`transfers${qs}`);
      setTransfers(result.data ?? []);
    } catch { /* ignore */ }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ data: Location[] }>('locations').catch(() => ({ data: [] as Location[] })),
      apiFetch<{ data: StockTransfer[] }>('transfers').catch(() => ({ data: [] as StockTransfer[] })),
    ]).then(([locs, txfrs]) => {
      setLocations(locs.data);
      setTransfers(txfrs.data);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  const handleCreated = (t: StockTransfer) => {
    setTransfers((prev) => [t, ...prev]);
  };

  const handleUpdated = (t: StockTransfer) => {
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...t } : x)));
    setSelectedTransfer((prev) => (prev?.id === t.id ? { ...prev, ...t } : prev));
  };

  const statuses = ['requested', 'approved', 'dispatched', 'received', 'cancelled'];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Stock Transfers</h2>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${transfers.length} transfer${transfers.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> New Transfer
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            statusFilter === ''
              ? 'bg-indigo-600 text-white'
              : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          All
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Transfer No.</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">From</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">To</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Items</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Date</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: j === 6 ? 24 : '70%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : transfers.map((transfer) => (
                  <tr
                    key={transfer.id}
                    onClick={() => setSelectedTransfer(transfer)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                          <ArrowLeftRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {transfer.transferNumber}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                      {locationMap[transfer.fromLocationId] ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                      {locationMap[transfer.toLocationId] ?? '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                        <Package className="h-3.5 w-3.5" />
                        {transfer.lines?.length ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={transfer.status} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">
                      {new Date(transfer.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </td>
                  </tr>
                ))}
            {!loading && transfers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                  No stock transfers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* New Transfer Modal */}
      {showModal && (
        <NewTransferModal
          locations={locations}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Detail Drawer */}
      {selectedTransfer && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setSelectedTransfer(null)}
          />
          <TransferDrawer
            transfer={selectedTransfer}
            locationMap={locationMap}
            onClose={() => setSelectedTransfer(null)}
            onUpdated={handleUpdated}
          />
        </>
      )}
    </div>
  );
}
