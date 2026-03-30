'use client';

import { useState, useMemo } from 'react';
import { Plus, AlertTriangle, TrendingDown, ArrowUpDown, ClipboardList, History, Download, Search, Edit2, X, Loader2, Minus } from 'lucide-react';
import { useStock, usePurchaseOrders } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import type { StockItem, PurchaseOrder } from '@/lib/api';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/formatting';

function stockStatus(item: StockItem): 'Critical' | 'Low' | 'OK' {
  if (item.onHand === 0) return 'Critical';
  if (item.onHand <= item.reorderPoint) return 'Low';
  return 'OK';
}

// ─── Stock Movements Types & Mock Data ────────────────────────────────────────

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

const MOCK_MOVEMENTS: StockMovement[] = [
  { id: 'mv-1', date: '2024-03-14T10:22:00Z', productName: 'Cherry Tomatoes (1kg)', sku: 'VEG-CT1KG', type: 'receipt', qtyChange: 20, location: 'Main Store', reference: 'PO-2024-0041', user: 'Jane Doe' },
  { id: 'mv-2', date: '2024-03-14T11:05:00Z', productName: 'Baby Spinach (500g)', sku: 'VEG-BSP500', type: 'receipt', qtyChange: 15, location: 'Main Store', reference: 'PO-2024-0041', user: 'Jane Doe' },
  { id: 'mv-3', date: '2024-03-14T12:30:00Z', productName: 'Arborio Rice (5kg)', sku: 'DRY-AR5KG', type: 'sale', qtyChange: -3, location: 'Main Store', reference: 'ORD-8812', user: 'POS Terminal 1' },
  { id: 'mv-4', date: '2024-03-13T09:15:00Z', productName: 'Olive Oil Extra Virgin (1L)', sku: 'OIL-EVOO1L', type: 'adjustment', qtyChange: -1, location: 'Main Store', reference: 'ADJ-003', user: 'Mark Chen' },
  { id: 'mv-5', date: '2024-03-13T14:45:00Z', productName: 'Cherry Tomatoes (1kg)', sku: 'VEG-CT1KG', type: 'transfer', qtyChange: -5, location: 'Main Store → Cold Room', reference: 'TRF-0017', user: 'Jane Doe' },
  { id: 'mv-6', date: '2024-03-12T16:00:00Z', productName: 'Sparkling Water (500ml 24pk)', sku: 'BEV-SW500-24', type: 'return', qtyChange: 2, location: 'Main Store', reference: 'ORD-8799', user: 'POS Terminal 2' },
  { id: 'mv-7', date: '2024-03-12T11:20:00Z', productName: 'Broccoli (1kg)', sku: 'VEG-BRO1KG', type: 'sale', qtyChange: -4, location: 'Main Store', reference: 'ORD-8791', user: 'POS Terminal 1' },
  { id: 'mv-8', date: '2024-03-11T09:00:00Z', productName: 'Carrots (1kg)', sku: 'VEG-CAR1KG', type: 'receipt', qtyChange: 30, location: 'Main Store', reference: 'PO-2024-0043', user: 'Jane Doe' },
];

const MOVEMENT_TYPE_BADGE: Record<MovementType, string> = {
  receipt: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  adjustment: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  transfer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  sale: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  return: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

// ─── Stock Adjust Modal ────────────────────────────────────────────────────────

const ADJUST_REASONS = [
  { value: 'received', label: 'Stock received' },
  { value: 'damaged', label: 'Damaged / spoiled' },
  { value: 'expired', label: 'Expired' },
  { value: 'count_correction', label: 'Count correction (stocktake)' },
  { value: 'theft', label: 'Theft / shrinkage' },
  { value: 'return_to_supplier', label: 'Return to supplier' },
  { value: 'other', label: 'Other' },
];

function StockAdjustModal({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('count_correction');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const qtyNum = parseInt(qty, 10);
  const newQty = !isNaN(qtyNum) && qty !== ''
    ? direction === 'increase' ? item.onHand + qtyNum : item.onHand - qtyNum
    : null;
  const isValid = !isNaN(qtyNum) && qtyNum > 0 && (direction === 'increase' || qtyNum <= item.onHand);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
          {/* Current qty banner */}
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
            <span className="text-sm text-gray-500">Current stock</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">{item.onHand} {item.unit ?? 'units'}</span>
          </div>

          {/* Direction */}
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

          {/* Quantity */}
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
                New stock level: <span className={`font-semibold ${newQty < 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>{newQty} {item.unit ?? 'units'}</span>
              </p>
            )}
            {direction === 'decrease' && qtyNum > item.onHand && (
              <p className="mt-1 text-xs text-red-600">Cannot remove more than current stock ({item.onHand})</p>
            )}
          </div>

          {/* Reason */}
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

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Counted during weekly stocktake"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
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

// ─── Stock Movements Tab ──────────────────────────────────────────────────────

function StockMovementsTab() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<MovementType | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filtered = useMemo(() => {
    return MOCK_MOVEMENTS.filter((m) => {
      if (search && !m.productName.toLowerCase().includes(search.toLowerCase()) && !m.sku.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (dateFrom && m.date < dateFrom) return false;
      if (dateTo && m.date > dateTo + 'T23:59:59Z') return false;
      return true;
    });
  }, [search, typeFilter, dateFrom, dateTo]);

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
    { value: 'all', label: 'All Types' },
    { value: 'receipt', label: 'Receipt' },
    { value: 'adjustment', label: 'Adjustment' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'sale', label: 'Sale' },
    { value: 'return', label: 'Return' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
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

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                  No movements match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ActiveTab = 'stock' | 'movements';

export function InventoryClient() {
  const queryClient = useQueryClient();
  const { data: stockData, isLoading: stockLoading } = useStock();
  const { data: posData, isLoading: posLoading } = usePurchaseOrders();
  const [activeTab, setActiveTab] = useState<ActiveTab>('stock');
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null);

  const stockItems = stockData?.data ?? [];
  const purchaseOrders = posData?.data ?? [];

  const critical = stockItems.filter((i) => stockStatus(i) === 'Critical').length;
  const low = stockItems.filter((i) => stockStatus(i) === 'Low').length;

  return (
    <div className="space-y-6">
      {/* Stock Adjust Modal */}
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
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <ArrowUpDown className="h-4 w-4" /> Stock Transfer
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
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
              {critical} item{critical !== 1 ? 's' : ''} critically low, {low} item{low !== 1 ? 's' : ''} below
              reorder point.
            </p>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800 w-fit">
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
          {/* Stock table */}
          <div className="lg:col-span-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Stock Levels</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Item</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">On Hand</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Reorder At</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {stockLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {Array.from({ length: 5 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5">
                            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: j === 4 ? '60px' : '80%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : stockItems.map((item: StockItem) => {
                      const status = stockStatus(item);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
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
                              onClick={() => setAdjustItem(item)}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400 transition-colors"
                            >
                              <Edit2 className="h-3 w-3" /> Adjust
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                {!stockLoading && stockItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                      No stock items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pending POs */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Purchase Orders</h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {posLoading ? (
                <div className="p-5 space-y-3">
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
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 py-3 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700">
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
