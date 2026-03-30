'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/formatting';

interface Transfer {
  id: string;
  transferNumber: string;
  fromLocation: string;
  toLocation: string;
  status: 'pending' | 'in_transit' | 'received' | 'cancelled';
  itemsCount: number;
  requestedBy: string;
  createdAt: string;
  notes?: string;
}

interface TransferItem {
  productName: string;
  qty: number;
}

const MOCK_TRANSFERS: Transfer[] = [
  {
    id: '1',
    transferNumber: 'TRF-0001',
    fromLocation: 'Main Store',
    toLocation: 'City Branch',
    status: 'received',
    itemsCount: 12,
    requestedBy: 'Jane Doe',
    createdAt: '2026-03-20T09:00:00Z',
  },
  {
    id: '2',
    transferNumber: 'TRF-0002',
    fromLocation: 'City Branch',
    toLocation: 'Airport Kiosk',
    status: 'in_transit',
    itemsCount: 5,
    requestedBy: 'Bob Smith',
    createdAt: '2026-03-21T11:30:00Z',
  },
  {
    id: '3',
    transferNumber: 'TRF-0003',
    fromLocation: 'Main Store',
    toLocation: 'Airport Kiosk',
    status: 'pending',
    itemsCount: 8,
    requestedBy: 'Alice Lee',
    createdAt: '2026-03-22T14:00:00Z',
  },
  {
    id: '4',
    transferNumber: 'TRF-0004',
    fromLocation: 'Airport Kiosk',
    toLocation: 'Main Store',
    status: 'pending',
    itemsCount: 3,
    requestedBy: 'Jane Doe',
    createdAt: '2026-03-22T15:45:00Z',
  },
  {
    id: '5',
    transferNumber: 'TRF-0005',
    fromLocation: 'City Branch',
    toLocation: 'Main Store',
    status: 'cancelled',
    itemsCount: 6,
    requestedBy: 'Bob Smith',
    createdAt: '2026-03-19T08:00:00Z',
  },
];

const STATUS_COLORS: Record<Transfer['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_transit: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  received: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_LABELS: Record<Transfer['status'], string> = {
  pending: 'Pending',
  in_transit: 'In Transit',
  received: 'Received',
  cancelled: 'Cancelled',
};

const LOCATIONS = ['Main Store', 'City Branch', 'Airport Kiosk'];

const FILTER_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'received', label: 'Received' },
];

export function TransfersClient() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fromLocation, setFromLocation] = useState(LOCATIONS[0]);
  const [toLocation, setToLocation] = useState(LOCATIONS[1]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<TransferItem[]>([{ productName: '', qty: 1 }]);

  useEffect(() => {
    setIsLoading(true);
    fetch('/api/proxy/transfers')
      .then((r) => r.json())
      .then((json) => {
        const data: Transfer[] = Array.isArray(json) ? json : json.data ?? [];
        setTransfers(data.length > 0 ? data : MOCK_TRANSFERS);
      })
      .catch(() => setTransfers(MOCK_TRANSFERS))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered =
    activeTab === 'all' ? transfers : transfers.filter((t) => t.status === activeTab);

  function addItem() {
    setItems((prev) => [...prev, { productName: '', qty: 1 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof TransferItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  }

  function openModal() {
    setFromLocation(LOCATIONS[0]);
    setToLocation(LOCATIONS[1]);
    setNotes('');
    setItems([{ productName: '', qty: 1 }]);
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { fromLocation, toLocation, notes, items };
      const res = await fetch('/api/proxy/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const created: Transfer = await res.json().catch(() => ({
        id: String(Date.now()),
        transferNumber: `TRF-${String(transfers.length + 1).padStart(4, '0')}`,
        fromLocation,
        toLocation,
        status: 'pending' as const,
        itemsCount: items.length,
        requestedBy: 'Current User',
        createdAt: new Date().toISOString(),
        notes,
      }));
      setTransfers((prev) => [created, ...prev]);
    } catch {
      // no-op
    } finally {
      setSaving(false);
      setShowModal(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Stock Transfers</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLoading ? 'Loading…' : `${transfers.length} transfers`}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Transfer
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit dark:border-gray-800 dark:bg-gray-900">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Transfer #</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">From</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">To</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Items</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Requested By</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '70%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-3.5 font-mono text-sm font-medium text-gray-900 dark:text-white">
                      {t.transferNumber}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{t.fromLocation}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{t.toLocation}</td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status]}`}>
                        {STATUS_LABELS[t.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{t.itemsCount}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{t.requestedBy}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">{formatDate(t.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  </tr>
                ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                  No transfers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* New Transfer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-gray-900 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">New Transfer</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">From Location</label>
                  <select
                    value={fromLocation}
                    onChange={(e) => setFromLocation(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    {LOCATIONS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">To Location</label>
                  <select
                    value={toLocation}
                    onChange={(e) => setToLocation(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    {LOCATIONS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Items</label>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.productName}
                        onChange={(e) => updateItem(idx, 'productName', e.target.value)}
                        placeholder="Product name"
                        className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))}
                        className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      {items.length > 1 && (
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional notes…"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || items.every((i) => !i.productName)}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
