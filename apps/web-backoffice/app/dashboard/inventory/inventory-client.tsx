'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, AlertTriangle, TrendingDown, ArrowUpDown, ClipboardList, History,
  Download, Search, Edit2, X, Loader2, Minus, CheckSquare, BarChart2,
} from 'lucide-react';
import { useStock, usePurchaseOrders } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import type { StockItem, PurchaseOrder } from '@/lib/api';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/formatting';

// Augment StockItem locally with optional pricing fields
type StockItemWithPricing = StockItem & {
  costPrice?: number;   // in cents
  retailPrice?: number; // in cents
};

function stockStatus(item: StockItem): 'Critical' | 'Low' | 'OK' {
  if (item.onHand === 0) return 'Critical';
  if (item.onHand <= item.reorderPoint) return 'Low';
  return 'OK';
}

// ─── Stock Movements Types ─────────────────────────────────────────────────────

type MovementType = 'receipt' | 'adjustment' | 'transfer' | 'sale' | 'return';

interface StockMovement {
  id: string;
  date: string;
  productName: string;
  sku: string;
  type: MovementType;
  qtyChange: number;
  location: string;
  reference: string;
  user: string;
}

const MOVEMENT_TYPE_BADGE: Record<MovementType, string> = {
  receipt:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  adjustment: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  transfer:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  sale:       'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  return:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

// ─── Stock Adjust Modal ────────────────────────────────────────────────────────

const ADJUST_REASONS = [
  { value: 'received',         label: 'Stock received' },
  { value: 'damaged',          label: 'Damaged / spoiled' },
  { value: 'expired',          label: 'Expired' },
  { value: 'count_correction', label: 'Count correction (stocktake)' },
  { value: 'theft',            label: 'Theft / shrinkage' },
  { value: 'return_to_supplier', label: 'Return to supplier' },
  { value: 'other',            label: 'Other' },
];

function StockAdjustModal({
  item,
  onClose,
  onSaved,
}: {
  item: StockItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('count_correction');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const qtyNum = parseInt(qty, 10);
  const newQty =
    !isNaN(qtyNum) && qty !== ''
      ? direction === 'increase'
        ? item.onHand + qtyNum
        : item.onHand - qtyNum
      : null;
  const isValid =
    !isNaN(qtyNum) && qtyNum > 0 && (direction === 'increase' || qtyNum <= item.onHand);

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const adjustmentQty = direction === 'increase' ? qtyNum : -qtyNum;
      await apiFetch(`stock/${item.id}/adjustment`, {
        method: 'POST',
        body: JSON.stringify({ quantity: adjustmentQty, reason, notes }),
      });
      toast({
        title: 'Stock adjusted',
        description: `${item.productName ?? 'Item'}: ${direction === 'increase' ? '+' : ''}${adjustmentQty} units recorded.`,
        variant: 'success',
      });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: 'Adjustment failed',
        description: getErrorMessage(err, 'Could not save adjustment. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Adjust Stock</h3>
            <p className="text-sm text-gray-500">{item.productName ?? item.productId} · {item.sku ?? ''}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
            <span className="text-sm text-gray-500">Current stock</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">{item.onHand} {item.unit ?? 'units'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDirection('increase')}
              className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${
                direction === 'increase'
                  ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              <Plus className="h-4 w-4" /> Add stock
            </button>
            <button
              onClick={() => setDirection('decrease')}
              className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${
                direction === 'decrease'
                  ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              <Minus className="h-4 w-4" /> Remove stock
            </button>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Quantity to {direction === 'increase' ? 'add' : 'remove'}
            </label>
            <input
              type="number"
              min="1"
              max={direction === 'decrease' ? item.onHand : undefined}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            {newQty !== null && (
              <p className="mt-1.5 text-sm text-gray-500">
                New stock level:{' '}
                <span className={`font-semibold ${newQty < 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                  {newQty} {item.unit ?? 'units'}
                </span>
              </p>
            )}
            {direction === 'decrease' && qtyNum > item.onHand && (
              <p className="mt-1 text-xs text-red-600">Cannot remove more than current stock ({item.onHand})</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {ADJUST_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Counted during weekly stocktake"
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save adjustment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Adjust Modal ─────────────────────────────────────────────────────────

const BULK_ADJUST_REASONS = [
  { value: 'recount',           label: 'Recount' },
  { value: 'damaged',           label: 'Damaged' },
  { value: 'stolen',            label: 'Stolen' },
  { value: 'supplier_delivery', label: 'Supplier delivery' },
  { value: 'other',             label: 'Other' },
];

interface BulkAdjustEntry {
  item: StockItemWithPricing;
  adjustBy: string; // string for controlled input; parse on submit
}

function BulkAdjustModal({
  items,
  onClose,
  onSaved,
}: {
  items: StockItemWithPricing[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<BulkAdjustEntry[]>(
    () => items.map((item) => ({ item, adjustBy: '' })),
  );
  const [reason, setReason] = useState('recount');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const setAdjustBy = (index: number, value: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, adjustBy: value } : e)),
    );
  };

  const hasAnyValue = entries.some((e) => e.adjustBy.trim() !== '' && e.adjustBy !== '0');

  const handleApply = async () => {
    const toProcess = entries.filter((e) => {
      const n = parseInt(e.adjustBy, 10);
      return !isNaN(n) && n !== 0;
    });

    if (toProcess.length === 0) return;

    setSaving(true);
    setProgress({ done: 0, total: toProcess.length });

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < toProcess.length; i++) {
      const { item, adjustBy } = toProcess[i];
      const quantity = parseInt(adjustBy, 10);
      try {
        await apiFetch(`inventory/${item.id}/adjust`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity, reason }),
        });
        succeeded++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: toProcess.length });
    }

    setSaving(false);
    setProgress(null);

    if (failed === 0) {
      toast({
        title: 'Bulk adjustment complete',
        description: `Adjusted stock for ${succeeded} product${succeeded !== 1 ? 's' : ''}.`,
        variant: 'success',
      });
    } else {
      toast({
        title: 'Partial success',
        description: `${succeeded} adjusted, ${failed} failed.`,
        variant: 'warning' as never,
      });
    }

    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Bulk Stock Adjustment</h3>
            <p className="text-sm text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''} selected</p>
          </div>
          {!saving && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Reason selector */}
        <div className="border-b border-gray-100 px-6 py-3 dark:border-gray-800">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Reason for all adjustments</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50"
          >
            {BULK_ADJUST_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/80">
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Item</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Current Stock</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Adjust By</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">New Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {entries.map((entry, idx) => {
                const parsed = parseInt(entry.adjustBy, 10);
                const newStock = !isNaN(parsed) ? entry.item.onHand + parsed : null;
                return (
                  <tr key={entry.item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {entry.item.productName ?? entry.item.productId}
                      </p>
                      <p className="text-xs text-gray-400">{entry.item.sku ?? ''}</p>
                    </td>
                    <td className="px-6 py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                      {entry.item.onHand} {entry.item.unit}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <input
                        type="number"
                        value={entry.adjustBy}
                        onChange={(e) => setAdjustBy(idx, e.target.value)}
                        disabled={saving}
                        placeholder="0"
                        className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-right text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50"
                      />
                    </td>
                    <td className="px-6 py-3 text-right">
                      {newStock !== null ? (
                        <span className={`text-sm font-semibold ${newStock < 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                          {newStock}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="border-t border-gray-100 px-6 py-3 dark:border-gray-800">
            <p className="mb-1.5 text-sm text-gray-600 dark:text-gray-400">
              Adjusting {progress.done} of {progress.total}…
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={saving || !hasAnyValue}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Applying…</> : 'Apply Adjustments'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock Movements Tab ──────────────────────────────────────────────────────

function StockMovementsTab() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<MovementType | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    apiFetch<{ data: StockMovement[] }>('stock/movements?limit=100')
      .then((r) => setMovements(r.data ?? []))
      .catch(() => setMovements([]))
      .finally(() => setLoadingMovements(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (
        search &&
        !m.productName.toLowerCase().includes(search.toLowerCase()) &&
        !m.sku.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (dateFrom && m.date < dateFrom) return false;
      if (dateTo && m.date > dateTo + 'T23:59:59Z') return false;
      return true;
    });
  }, [movements, search, typeFilter, dateFrom, dateTo]);

  function exportCSV() {
    const header = 'Date,Product,SKU,Type,Qty Change,Location,Reference,User';
    const rows = filtered.map((m) =>
      [
        new Date(m.date).toLocaleString('en-AU'),
        `"${m.productName}"`,
        m.sku,
        m.type,
        m.qtyChange,
        `"${m.location}"`,
        m.reference,
        `"${m.user}"`,
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const typeOptions: { value: MovementType | 'all'; label: string }[] = [
    { value: 'all',        label: 'All Types' },
    { value: 'receipt',    label: 'Receipt' },
    { value: 'adjustment', label: 'Adjustment' },
    { value: 'transfer',   label: 'Transfer' },
    { value: 'sale',       label: 'Sale' },
    { value: 'return',     label: 'Return' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search product or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as MovementType | 'all')}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        <span className="text-sm text-gray-400">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Date</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Product</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Qty Change</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Location</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Reference</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">User</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                  {formatDate(m.date, { day: 'numeric', month: 'short' })}
                  <br />
                  <span className="text-xs text-gray-400">
                    {new Date(m.date).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{m.productName}</p>
                  <p className="text-xs text-gray-400">{m.sku}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${MOVEMENT_TYPE_BADGE[m.type]}`}>
                    {m.type}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className={`text-sm font-semibold ${m.qtyChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.qtyChange > 0 ? '+' : ''}{m.qtyChange}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{m.location}</td>
                <td className="px-5 py-3.5">
                  <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{m.reference}</span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{m.user}</td>
              </tr>
            ))}
            {loadingMovements && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">Loading movements…</td>
              </tr>
            )}
            {!loadingMovements && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                  {movements.length === 0
                    ? 'No stock movements recorded yet.'
                    : 'No movements match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Stock Levels Table (with bulk select + valuation toggle) ─────────────────

type StockView = 'levels' | 'valuation';

function StockLevelsTab({
  stockItems,
  stockLoading,
  onAdjustItem,
}: {
  stockItems: StockItemWithPricing[];
  stockLoading: boolean;
  onAdjustItem: (item: StockItemWithPricing) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<StockView>('levels');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const allSelected = stockItems.length > 0 && selectedIds.size === stockItems.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(stockItems.map((i) => i.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedItems = stockItems.filter((i) => selectedIds.has(i.id));

  // Valuation calculations (prices are in cents)
  const valuationRows = useMemo(() =>
    stockItems.map((item) => {
      const cost = item.costPrice ?? 0;
      const retail = item.retailPrice ?? 0;
      const stockValue = item.onHand * cost;
      const retailValue = item.onHand * retail;
      const margin = retail > 0 ? ((retail - cost) / retail) * 100 : null;
      return { item, cost, retail, stockValue, retailValue, margin };
    }),
  [stockItems]);

  const totals = useMemo(() => {
    const totalStock = valuationRows.reduce((s, r) => s + r.stockValue, 0);
    const totalRetail = valuationRows.reduce((s, r) => s + r.retailValue, 0);
    return { totalStock, totalRetail };
  }, [valuationRows]);

  function exportValuationCSV() {
    const header = 'Product,SKU,On Hand,Cost Price,Stock Value,Retail Price,Retail Value,Margin %';
    const rows = valuationRows.map(({ item, cost, retail, stockValue, retailValue, margin }) =>
      [
        `"${item.productName ?? item.productId}"`,
        item.sku ?? '',
        item.onHand,
        (cost / 100).toFixed(2),
        (stockValue / 100).toFixed(2),
        (retail / 100).toFixed(2),
        (retailValue / 100).toFixed(2),
        margin !== null ? margin.toFixed(1) : '',
      ].join(','),
    );
    const summary = [
      '',
      `"Total",,,,${(totals.totalStock / 100).toFixed(2)},,${(totals.totalRetail / 100).toFixed(2)},`,
    ];
    const csv = [header, ...rows, ...summary].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-valuation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: 'Valuation CSV downloaded.', variant: 'success' });
  }

  const colSpanFull = view === 'valuation' ? 8 : 6;

  return (
    <>
      {bulkModalOpen && (
        <BulkAdjustModal
          items={selectedItems}
          onClose={() => setBulkModalOpen(false)}
          onSaved={() => {
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ['stock'] });
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {/* Table header toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">Stock Levels</h3>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              <button
                onClick={() => setView('levels')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === 'levels'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" /> Stock Levels
              </button>
              <button
                onClick={() => setView('valuation')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === 'valuation'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                <BarChart2 className="h-3.5 w-3.5" /> Valuation
              </button>
            </div>

            {view === 'valuation' && (
              <button
                onClick={exportValuationCSV}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                <Download className="h-3.5 w-3.5" /> Export Valuation
              </button>
            )}
          </div>
        </div>

        {/* Bulk action toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 border-b border-indigo-100 bg-indigo-50 px-5 py-2.5 dark:border-indigo-900/30 dark:bg-indigo-900/20">
            <CheckSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setBulkModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                <ArrowUpDown className="h-3.5 w-3.5" /> Bulk Adjust
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:border-indigo-800 dark:text-indigo-400"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              {/* Checkbox column */}
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  disabled={stockLoading || stockItems.length === 0}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600"
                />
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Item</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">On Hand</th>
              {view === 'levels' ? (
                <>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Reorder At</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-5 py-3" />
                </>
              ) : (
                <>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Cost Price</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Stock Value</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Retail Price</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Retail Value</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Margin</th>
                </>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {stockLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: colSpanFull }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div
                          className="h-4 rounded bg-gray-100 dark:bg-gray-800"
                          style={{ width: j === colSpanFull - 1 ? '60px' : '80%' }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : view === 'levels'
              ? stockItems.map((item) => {
                  const status = stockStatus(item);
                  const checked = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${checked ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                    >
                      <td className="w-10 px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(item.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600"
                        />
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.productName ?? item.productId}
                        </p>
                        <p className="text-xs text-gray-400">{item.sku ?? item.productId.slice(0, 8)}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                        {item.onHand} {item.unit}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                        {item.reorderPoint} {item.unit}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            status === 'Critical'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : status === 'Low'
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          }`}
                        >
                          {status !== 'OK' && <TrendingDown className="h-3 w-3" />}
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => onAdjustItem(item)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
                        >
                          <Edit2 className="h-3 w-3" /> Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })
              : valuationRows.map(({ item, cost, retail, stockValue, retailValue, margin }) => {
                  const checked = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${checked ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                    >
                      <td className="w-10 px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(item.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600"
                        />
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.productName ?? item.productId}
                        </p>
                        <p className="text-xs text-gray-400">{item.sku ?? item.productId.slice(0, 8)}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                        {item.onHand} {item.unit}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm text-gray-600 dark:text-gray-400">
                        {cost > 0 ? formatCurrency(cost) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-medium text-gray-900 dark:text-white">
                        {cost > 0 ? formatCurrency(stockValue) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm text-gray-600 dark:text-gray-400">
                        {retail > 0 ? formatCurrency(retail) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-medium text-gray-900 dark:text-white">
                        {retail > 0 ? formatCurrency(retailValue) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {margin !== null ? (
                          <span
                            className={`text-sm font-semibold ${
                              margin >= 40
                                ? 'text-green-600 dark:text-green-400'
                                : margin >= 20
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {margin.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

            {!stockLoading && stockItems.length === 0 && (
              <tr>
                <td colSpan={colSpanFull} className="px-5 py-10 text-center text-sm text-gray-400">
                  No stock items found.
                </td>
              </tr>
            )}
          </tbody>

          {/* Totals row for valuation view */}
          {view === 'valuation' && !stockLoading && stockItems.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                <td className="px-4 py-3" />
                <td className="px-5 py-3 text-sm font-semibold text-gray-900 dark:text-white" colSpan={2}>
                  Totals
                </td>
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-right text-sm font-bold text-gray-900 dark:text-white">
                  {formatCurrency(totals.totalStock)}
                </td>
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-right text-sm font-bold text-gray-900 dark:text-white">
                  {formatCurrency(totals.totalRetail)}
                </td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ActiveTab = 'stock' | 'movements';

export function InventoryClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: stockData, isLoading: stockLoading } = useStock();
  const { data: posData, isLoading: posLoading } = usePurchaseOrders();
  const [activeTab, setActiveTab] = useState<ActiveTab>('stock');
  const [adjustItem, setAdjustItem] = useState<StockItemWithPricing | null>(null);

  const stockItems = (stockData?.data ?? []) as StockItemWithPricing[];
  const purchaseOrders = posData?.data ?? [];

  const critical = stockItems.filter((i) => stockStatus(i) === 'Critical').length;
  const low = stockItems.filter((i) => stockStatus(i) === 'Low').length;

  return (
    <div className="space-y-6">
      {/* Single-item Stock Adjust Modal */}
      {adjustItem && (
        <StockAdjustModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['stock'] })}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inventory</h2>
          <p className="text-sm text-gray-500">
            {stockLoading
              ? 'Loading…'
              : `${stockItems.length} SKUs tracked · ${critical} critical, ${low} low`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/dashboard/inventory/transfers')}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <ArrowUpDown className="h-4 w-4" /> Stock Transfer
          </button>
          <button
            onClick={() => router.push('/dashboard/purchase-orders?action=new')}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Create PO
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {!stockLoading && (critical > 0 || low > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/20">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Reorder alert</p>
            <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">
              {critical} item{critical !== 1 ? 's' : ''} critically low, {low} item{low !== 1 ? 's' : ''} below reorder point.
            </p>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'stock'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <ClipboardList className="h-4 w-4" /> Stock Levels
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'movements'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <History className="h-4 w-4" /> Stock Movements
        </button>
      </div>

      {/* Stock Levels tab */}
      {activeTab === 'stock' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Stock table with bulk select + valuation toggle */}
          <div className="lg:col-span-2">
            <StockLevelsTab
              stockItems={stockItems}
              stockLoading={stockLoading}
              onAdjustItem={setAdjustItem}
            />
          </div>

          {/* Pending POs */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Purchase Orders</h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {posLoading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                  ))}
                </div>
              ) : purchaseOrders.length === 0 ? (
                <div className="p-5 text-center text-sm text-gray-400">No open purchase orders</div>
              ) : (
                purchaseOrders.map((po: PurchaseOrder) => (
                  <div key={po.id} className="px-5 py-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{po.poNumber}</p>
                        <p className="text-xs text-gray-400">{po.supplierName ?? po.supplierId}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          po.status === 'shipped'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}
                      >
                        {po.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {po.lineCount} items · {formatCurrency(po.totalCost)}
                      </span>
                      <span>ETA: {formatDate(po.expectedAt, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                ))
              )}
              <div className="p-5">
                <button
                  onClick={() => router.push('/dashboard/purchase-orders')}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 py-3 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700"
                >
                  <ClipboardList className="h-4 w-4" /> View all POs
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock Movements tab */}
      {activeTab === 'movements' && <StockMovementsTab />}
    </div>
  );
}
