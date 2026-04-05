'use client';

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useId,
} from 'react';
import {
  Plus, X, CheckCircle, ClipboardList, AlertTriangle,
  TrendingDown, TrendingUp, Search, Zap, ZapOff,
  Download, RefreshCw, Calendar,
} from 'lucide-react';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/formatting';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type StocktakeType = 'full' | 'cycle' | 'spot';
type StocktakeStatus = 'in_progress' | 'completed' | 'cancelled';
type CycleFrequency = 'weekly' | 'fortnightly' | 'monthly';

interface CountItem {
  id: string;
  productName: string;
  sku: string;
  systemQty: number;
  countQty: number | null;
  unitCost: number; // cents
}

interface Stocktake {
  id: string;
  countNumber: string;
  type: StocktakeType;
  location: string;
  locationId?: string;
  startedBy: string;
  startedAt: string;
  completedAt?: string;
  status: StocktakeStatus;
  varianceTotal: number; // units
  items: CountItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const TYPE_BADGE: Record<StocktakeType, string> = {
  full: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  cycle: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  spot: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const STATUS_BADGE: Record<StocktakeStatus, string> = {
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── New Stocktake Modal ──────────────────────────────────────────────────────

interface NewStocktakeModalProps {
  onClose: () => void;
  onCreate: (
    type: StocktakeType,
    locationId: string,
    locationName: string,
    cycleOptions?: { frequency: CycleFrequency; startDate: string },
  ) => void;
  locations: { id: string; name: string }[];
}

const FALLBACK_LOCATIONS = [
  { id: 'main-store', name: 'Main Store' },
  { id: 'cold-room', name: 'Cold Room' },
  { id: 'dry-storage', name: 'Dry Storage' },
  { id: 'cellar', name: 'Cellar' },
];

function NewStocktakeModal({ onClose, onCreate, locations }: NewStocktakeModalProps) {
  const [type, setType] = useState<StocktakeType>('cycle');
  const locationOptions = locations.length > 0 ? locations : FALLBACK_LOCATIONS;
  const [locationId, setLocationId] = useState(locationOptions[0]?.id ?? '');
  const [frequency, setFrequency] = useState<CycleFrequency>('weekly');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const idPrefix = useId();

  const types: { value: StocktakeType; label: string; description: string }[] = [
    { value: 'full', label: 'Full Count', description: 'Count every item in the store.' },
    { value: 'cycle', label: 'Cycle Count', description: 'Count a subset of items by category or zone.' },
    { value: 'spot', label: 'Spot Check', description: 'Quick check on specific items.' },
  ];

  const frequencyOptions: { value: CycleFrequency; label: string }[] = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'fortnightly', label: 'Fortnightly' },
    { value: 'monthly', label: 'Monthly' },
  ];

  function handleCreate() {
    const locationName = locationOptions.find((l) => l.id === locationId)?.name ?? locationId;
    const cycleOpts =
      type === 'cycle' ? { frequency, startDate } : undefined;
    onCreate(type, locationId, locationName, cycleOpts);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Stocktake</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Count Type */}
          <div>
            <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Count Type
            </label>
            <div className="space-y-2">
              {types.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    type === t.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t.label}</p>
                    {type === t.value && <CheckCircle className="h-4 w-4 text-indigo-600" />}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label
              htmlFor={`${idPrefix}-location`}
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Location
            </label>
            <select
              id={`${idPrefix}-location`}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {locationOptions.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          {/* Cycle Count scheduling fields */}
          {type === 'cycle' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-4 dark:border-blue-800/40 dark:bg-blue-900/10">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                <Calendar className="h-4 w-4" />
                Recurring Schedule
              </div>

              <div>
                <label
                  htmlFor={`${idPrefix}-frequency`}
                  className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300"
                >
                  Frequency
                </label>
                <select
                  id={`${idPrefix}-frequency`}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as CycleFrequency)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {frequencyOptions.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor={`${idPrefix}-start-date`}
                  className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300"
                >
                  Start Date
                </label>
                <input
                  id={`${idPrefix}-start-date`}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <ClipboardList className="h-4 w-4" />
            {type === 'cycle' ? 'Schedule & Start' : 'Start Count'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Variance Report Modal ────────────────────────────────────────────────────

interface VarianceReportProps {
  stocktake: Stocktake;
  items: CountItem[];
  onClose: () => void;
  onAdjustStock: (stocktakeId: string) => Promise<void>;
}

function VarianceReport({ stocktake, items, onClose, onAdjustStock }: VarianceReportProps) {
  const [adjusting, setAdjusting] = useState(false);
  const [confirmingAdjust, setConfirmingAdjust] = useState(false);

  const countedItems = items.filter((i) => i.countQty !== null);
  const variantItems = countedItems.filter((i) => i.countQty !== i.systemQty);
  const totalVarianceValue = variantItems.reduce((sum, i) => {
    const diff = (i.countQty ?? 0) - i.systemQty;
    return sum + diff * i.unitCost;
  }, 0);

  function handleExportCsv() {
    const header = ['Product', 'SKU', 'System Qty', 'Counted Qty', 'Variance', 'Unit Cost', '$ Variance'];
    const rows = variantItems.map((item) => {
      const diff = (item.countQty ?? 0) - item.systemQty;
      const val = diff * item.unitCost;
      return [
        item.productName,
        item.sku,
        String(item.systemQty),
        String(item.countQty ?? ''),
        String(diff),
        formatCurrency(item.unitCost),
        formatCurrency(val),
      ];
    });
    downloadCsv(`variance-report-${stocktake.countNumber}.csv`, [header, ...rows]);
  }

  async function handleAdjustStock() {
    setAdjusting(true);
    try {
      await onAdjustStock(stocktake.id);
      setConfirmingAdjust(false);
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Variance Report</h2>
            <p className="text-xs text-gray-500">{stocktake.countNumber} · {stocktake.location}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 mb-1">Items Counted</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{countedItems.length}</p>
              <p className="text-xs text-gray-400">of {items.length} total</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700/40 dark:bg-amber-900/10">
              <p className="text-xs text-amber-600 mb-1 dark:text-amber-400">Items with Variance</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{variantItems.length}</p>
              <p className="text-xs text-amber-500">
                {countedItems.length > 0
                  ? `${Math.round((variantItems.length / countedItems.length) * 100)}% of counted`
                  : 'no items counted'}
              </p>
            </div>
            <div className={`rounded-xl border p-4 ${
              totalVarianceValue < 0
                ? 'border-red-200 bg-red-50 dark:border-red-700/40 dark:bg-red-900/10'
                : 'border-green-200 bg-green-50 dark:border-green-700/40 dark:bg-green-900/10'
            }`}>
              <p className={`text-xs mb-1 ${totalVarianceValue < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                Total $ Variance
              </p>
              <p className={`text-2xl font-bold ${totalVarianceValue < 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                {totalVarianceValue < 0 ? '-' : '+'}{formatCurrency(Math.abs(totalVarianceValue))}
              </p>
              <p className={`text-xs ${totalVarianceValue < 0 ? 'text-red-500' : 'text-green-500'}`}>
                {totalVarianceValue < 0 ? 'stock loss' : 'stock gain'}
              </p>
            </div>
          </div>

          {/* Variance table */}
          {variantItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-base font-medium text-gray-900 dark:text-white">No variances found</p>
              <p className="text-sm text-gray-500">All counted items matched system quantities.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">SKU</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">System</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Count</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Variance</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Unit Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">$ Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {variantItems.map((item) => {
                    const diff = (item.countQty ?? 0) - item.systemQty;
                    const val = diff * item.unitCost;
                    const isLoss = diff < 0;
                    return (
                      <tr
                        key={item.id}
                        className={`${
                          isLoss
                            ? 'bg-red-50/40 dark:bg-red-900/5'
                            : 'bg-green-50/40 dark:bg-green-900/5'
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                          {item.productName}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{item.sku}</td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{item.systemQty}</td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{item.countQty}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${isLoss ? 'text-red-600' : 'text-green-600'}`}>
                          <span className="inline-flex items-center gap-1">
                            {isLoss
                              ? <TrendingDown className="h-3.5 w-3.5" />
                              : <TrendingUp className="h-3.5 w-3.5" />}
                            {diff > 0 ? '+' : ''}{diff}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(item.unitCost)}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${isLoss ? 'text-red-600' : 'text-green-600'}`}>
                          {val > 0 ? '+' : ''}{formatCurrency(val)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Adjust stock confirmation */}
          {confirmingAdjust && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/40 dark:bg-amber-900/10">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    This will update stock levels for {variantItems.length} product{variantItems.length !== 1 ? 's' : ''}. Continue?
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                    Inventory will be adjusted to match counted quantities. This cannot be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleAdjustStock}
                      disabled={adjusting}
                      className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                    >
                      {adjusting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                      {adjusting ? 'Applying…' : 'Yes, Adjust Stock'}
                    </button>
                    <button
                      onClick={() => setConfirmingAdjust(false)}
                      className="rounded-lg border border-amber-300 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800 shrink-0">
          <div className="flex gap-2">
            {variantItems.length > 0 && (
              <>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <Download className="h-4 w-4" /> Export CSV
                </button>
                {!confirmingAdjust && (
                  <button
                    onClick={() => setConfirmingAdjust(true)}
                    className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/10 dark:text-amber-400"
                  >
                    <RefreshCw className="h-4 w-4" /> Adjust Stock
                  </button>
                )}
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Active Stocktake Count View ──────────────────────────────────────────────

interface ActiveCountViewProps {
  stocktake: Stocktake;
  countQtys: Record<string, string>;
  flashedItemId: string | null;
  scanMode: boolean;
  onToggleScanMode: () => void;
  onCountChange: (itemId: string, value: string) => void;
  onSaveItem: (itemId: string, qty: number) => void;
  onComplete: () => void;
  onCancel: () => void;
  completing: boolean;
  cancelling: boolean;
}

function ActiveCountView({
  stocktake,
  countQtys,
  flashedItemId,
  scanMode,
  onToggleScanMode,
  onCountChange,
  onSaveItem,
  onComplete,
  onCancel,
  completing,
  cancelling,
}: ActiveCountViewProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-focus the search bar
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return stocktake.items;
    return stocktake.items.filter(
      (item) =>
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q),
    );
  }, [stocktake.items, searchQuery]);

  function handleSearch(query: string) {
    setSearchQuery(query);
    // If exactly one result, flash it and focus its qty input
    const q = query.trim().toLowerCase();
    if (!q) return;
    const matches = stocktake.items.filter(
      (item) =>
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q),
    );
    if (matches.length === 1) {
      const match = matches[0];
      // Small delay to allow the filtered table to render
      setTimeout(() => {
        rowRefs.current[match.id]?.focus();
        rowRefs.current[match.id]?.select();
      }, 50);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return;
      const matches = filteredItems;
      if (matches.length === 1) {
        const match = matches[0];
        if (scanMode) {
          // +1 to count
          const current = countQtys[match.id] !== undefined ? parseFloat(countQtys[match.id]) : (match.countQty ?? 0);
          const next = (isNaN(current) ? 0 : current) + 1;
          onCountChange(match.id, String(next));
          onSaveItem(match.id, next);
        } else {
          rowRefs.current[match.id]?.focus();
          rowRefs.current[match.id]?.select();
        }
        // Clear search after action in scan mode
        if (scanMode) setSearchQuery('');
      }
    }
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-amber-200 px-5 py-4 dark:border-amber-700/30">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">
              Active Count: {stocktake.countNumber}
            </p>
            <p className="text-xs text-gray-500">
              {stocktake.type.charAt(0).toUpperCase() + stocktake.type.slice(1)} ·{' '}
              {stocktake.location} · Started {formatDateTime(stocktake.startedAt)} by {stocktake.startedBy}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Scan mode toggle */}
          <button
            onClick={onToggleScanMode}
            title={scanMode ? 'Disable Scan Mode' : 'Enable Scan Mode'}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              scanMode
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {scanMode ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
            Scan Mode
          </button>
          <button
            onClick={onCancel}
            disabled={cancelling}
            className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-700/50 dark:bg-transparent dark:hover:bg-red-900/10"
          >
            {cancelling ? <RefreshCw className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Cancel
          </button>
          <button
            onClick={onComplete}
            disabled={completing}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {completing
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <CheckCircle className="h-4 w-4" />}
            {completing ? 'Completing…' : 'Complete Count'}
          </button>
        </div>
      </div>

      {/* Scan / Search bar */}
      <div className="border-b border-amber-200 px-5 py-3 dark:border-amber-700/30">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={
              scanMode
                ? 'Scan barcode or search by name / SKU — Enter to +1 qty…'
                : 'Search by product name or SKU…'
            }
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-4 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          {scanMode && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400">
              +1 on Enter
            </span>
          )}
        </div>
        {searchQuery && (
          <p className="mt-1.5 text-xs text-gray-500">
            {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
            {filteredItems.length > 0 && (
              <button
                onClick={() => setSearchQuery('')}
                className="ml-2 text-indigo-500 hover:underline"
              >
                Clear
              </button>
            )}
          </p>
        )}
      </div>

      {/* Items table */}
      <table className="w-full">
        <thead>
          <tr className="border-b border-amber-100 dark:border-amber-700/20">
            <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Product</th>
            <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">SKU</th>
            <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">System Qty</th>
            <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Count Qty</th>
            <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Variance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-100 dark:divide-amber-700/10">
          {filteredItems.length === 0 && (
            <tr>
              <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">
                No items match your search.
              </td>
            </tr>
          )}
          {filteredItems.map((item) => {
            const rawCount = countQtys[item.id];
            const countVal =
              rawCount !== undefined
                ? parseFloat(rawCount)
                : item.countQty !== null
                ? item.countQty
                : null;
            const variance = countVal !== null ? countVal - item.systemQty : null;
            const isFlashed = flashedItemId === item.id;

            return (
              <tr
                key={item.id}
                className={`transition-colors ${
                  isFlashed
                    ? 'bg-indigo-100 dark:bg-indigo-900/30'
                    : 'hover:bg-amber-50/60 dark:hover:bg-amber-900/5'
                }`}
              >
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">
                  {item.productName}
                </td>
                <td className="px-5 py-3.5 font-mono text-sm text-gray-400">{item.sku}</td>
                <td className="px-5 py-3.5 text-right text-sm text-gray-600 dark:text-gray-400">
                  {item.systemQty}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <input
                    ref={(el) => { rowRefs.current[item.id] = el; }}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="—"
                    value={rawCount ?? (item.countQty !== null ? String(item.countQty) : '')}
                    onChange={(e) => onCountChange(item.id, e.target.value)}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) onSaveItem(item.id, val);
                    }}
                    className={`w-20 rounded-lg border px-2 py-1.5 text-right text-sm transition-colors ${
                      isFlashed
                        ? 'border-indigo-400 ring-2 ring-indigo-300'
                        : 'border-gray-300 dark:border-gray-700'
                    } bg-white dark:bg-gray-800 dark:text-white`}
                  />
                </td>
                <td className="px-5 py-3.5 text-right">
                  {variance !== null ? (
                    <span
                      className={`inline-flex items-center gap-1 text-sm font-medium ${
                        variance < 0
                          ? 'text-red-600'
                          : variance > 0
                          ? 'text-green-600'
                          : 'text-gray-500'
                      }`}
                    >
                      {variance < 0 ? (
                        <TrendingDown className="h-3.5 w-3.5" />
                      ) : variance > 0 ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : null}
                      {variance > 0 ? '+' : ''}{variance}
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
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StocktakeClient({ currentUserName = 'Unknown' }: { currentUserName?: string }) {
  const { toast } = useToast();
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  // Map from itemId → raw string value entered by the user (overrides server countQty)
  const [countQtys, setCountQtys] = useState<Record<string, string>>({});
  const [completedStocktake, setCompletedStocktake] = useState<Stocktake | null>(null);
  const [completedItems, setCompletedItems] = useState<CountItem[] | null>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [flashedItemId, setFlashedItemId] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load stocktakes + locations on mount ───────────────────────────────────

  useEffect(() => {
    async function loadStocktakes() {
      try {
        const json = await apiFetch<{ data: Stocktake[] }>('stocktakes');
        const list: Stocktake[] = (json.data ?? []).map((s) => ({ ...s, items: s.items ?? [] }));
        setStocktakes(list);

        // Load items for the in-progress stocktake
        const active = list.find((s) => s.status === 'in_progress');
        if (active) {
          try {
            const itemsJson = await apiFetch<{ data: CountItem[] }>(`stocktakes/${active.id}/items`);
            const items: CountItem[] = itemsJson.data ?? [];
            setStocktakes((prev) =>
              prev.map((s) => (s.id === active.id ? { ...s, items } : s)),
            );
            // Pre-populate countQtys from server data
            const initial: Record<string, string> = {};
            for (const item of items) {
              if (item.countQty !== null) initial[item.id] = String(item.countQty);
            }
            setCountQtys(initial);
          } catch {
            // Non-fatal — continue with empty items
          }
        }
      } catch (err) {
        toast({
          title: 'Failed to load stocktakes',
          description: getErrorMessage(err),
          variant: 'destructive',
        });
        setStocktakes([]);
      } finally {
        setIsLoading(false);
      }
    }

    async function loadLocations() {
      try {
        const json = await apiFetch<{ data: { id: string; name: string }[] }>('locations');
        setLocations(json.data ?? []);
      } catch {
        // Use fallbacks defined in the modal
      }
    }

    void loadStocktakes();
    void loadLocations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeStocktake = useMemo(
    () => stocktakes.find((s) => s.status === 'in_progress'),
    [stocktakes],
  );

  const history = useMemo(
    () => stocktakes.filter((s) => s.status !== 'in_progress'),
    [stocktakes],
  );

  // ── Flash helper ──────────────────────────────────────────────────────────

  function flashItem(itemId: string) {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashedItemId(itemId);
    flashTimerRef.current = setTimeout(() => setFlashedItemId(null), 1500);
  }

  // ── Create stocktake ──────────────────────────────────────────────────────

  async function handleCreateStocktake(
    type: StocktakeType,
    locationId: string,
    locationName: string,
    cycleOptions?: { frequency: CycleFrequency; startDate: string },
  ) {
    try {
      if (type === 'cycle' && cycleOptions) {
        // Create a recurring schedule first
        await apiFetch('stocktakes/schedule', {
          method: 'POST',
          body: JSON.stringify({ type, locationId, ...cycleOptions }),
        });
        toast({
          title: 'Cycle count scheduled',
          description: `${cycleOptions.frequency} count scheduled for ${locationName} starting ${cycleOptions.startDate}.`,
          variant: 'success',
        });
      }

      const json = await apiFetch<{ data?: Stocktake }>('stocktakes', {
        method: 'POST',
        body: JSON.stringify({ type, locationId }),
      });
      const record: Stocktake = {
        ...((json.data ?? json) as Stocktake),
        items: ((json.data ?? json) as Stocktake).items ?? [],
      };

      // Load items for the new stocktake
      try {
        const itemsJson = await apiFetch<{ data: CountItem[] }>(`stocktakes/${record.id}/items`);
        record.items = itemsJson.data ?? [];
      } catch {
        // Non-fatal
      }

      setStocktakes((prev) => [record, ...prev]);
      setCountQtys({});
      toast({
        title: 'Stocktake started',
        description: `${locationName} — ${type} count in progress.`,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Failed to start stocktake',
        description: getErrorMessage(err),
        variant: 'destructive',
      });
    }
  }

  // ── Save a single item count ──────────────────────────────────────────────

  const handleSaveItem = useCallback(
    async (itemId: string, qty: number) => {
      if (!activeStocktake) return;
      flashItem(itemId);
      try {
        await apiFetch(`stocktakes/${activeStocktake.id}/items/${itemId}`, {
          method: 'PUT',
          body: JSON.stringify({ countQty: qty }),
        });
        // Update items in state
        setStocktakes((prev) =>
          prev.map((s) =>
            s.id === activeStocktake.id
              ? {
                  ...s,
                  items: s.items.map((i) =>
                    i.id === itemId ? { ...i, countQty: qty } : i,
                  ),
                }
              : s,
          ),
        );
      } catch {
        // Non-fatal — the value is still tracked locally in countQtys
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeStocktake?.id],
  );

  // ── Complete stocktake ────────────────────────────────────────────────────

  async function handleComplete() {
    if (!activeStocktake) return;
    setCompleting(true);
    try {
      await apiFetch(`stocktakes/${activeStocktake.id}/complete`, { method: 'POST' });

      const updatedItems: CountItem[] = activeStocktake.items.map((item) => ({
        ...item,
        countQty:
          countQtys[item.id] !== undefined
            ? parseFloat(countQtys[item.id])
            : item.countQty,
      }));
      const varianceTotal = updatedItems.reduce((sum, i) => {
        if (i.countQty === null) return sum;
        return sum + (i.countQty - i.systemQty);
      }, 0);

      const completedRecord: Stocktake = {
        ...activeStocktake,
        status: 'completed',
        completedAt: new Date().toISOString(),
        varianceTotal,
        items: updatedItems,
      };

      setStocktakes((prev) =>
        prev.map((s) => (s.id === activeStocktake.id ? completedRecord : s)),
      );
      setCompletedStocktake(completedRecord);
      setCompletedItems(updatedItems);
      setCountQtys({});
      toast({
        title: 'Stocktake completed',
        description: `Variance: ${varianceTotal > 0 ? '+' : ''}${varianceTotal} units.`,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Failed to complete stocktake',
        description: getErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setCompleting(false);
    }
  }

  // ── Cancel stocktake ──────────────────────────────────────────────────────

  async function handleCancel() {
    if (!activeStocktake) return;
    if (!window.confirm('Cancel this stocktake? All progress will be lost.')) return;
    setCancelling(true);
    try {
      await apiFetch(`stocktakes/${activeStocktake.id}/cancel`, { method: 'POST' });
      setStocktakes((prev) =>
        prev.map((s) =>
          s.id === activeStocktake.id ? { ...s, status: 'cancelled' } : s,
        ),
      );
      setCountQtys({});
      toast({ title: 'Stocktake cancelled', variant: 'default' });
    } catch (err) {
      toast({
        title: 'Failed to cancel stocktake',
        description: getErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  }

  // ── Adjust stock ──────────────────────────────────────────────────────────

  async function handleAdjustStock(stocktakeId: string) {
    await apiFetch(`stocktakes/${stocktakeId}/apply-adjustments`, { method: 'POST' });
    toast({
      title: 'Stock adjusted',
      description: 'Inventory levels have been updated to match counted quantities.',
      variant: 'success',
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Stocktake</h2>
          <p className="text-sm text-gray-500">
            {isLoading
              ? 'Loading…'
              : `${history.length} completed count${history.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          disabled={!!activeStocktake}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={activeStocktake ? 'Complete or cancel the active count first' : undefined}
        >
          <Plus className="h-4 w-4" /> New Stocktake
        </button>
      </div>

      {/* Active stocktake */}
      {!isLoading && activeStocktake && (
        <ActiveCountView
          stocktake={activeStocktake}
          countQtys={countQtys}
          flashedItemId={flashedItemId}
          scanMode={scanMode}
          onToggleScanMode={() => setScanMode((v) => !v)}
          onCountChange={(itemId, value) =>
            setCountQtys((q) => ({ ...q, [itemId]: value }))
          }
          onSaveItem={handleSaveItem}
          onComplete={handleComplete}
          onCancel={handleCancel}
          completing={completing}
          cancelling={cancelling}
        />
      )}

      {/* History table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">Count History</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Count #</th>
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Location</th>
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Started By</th>
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Started At</th>
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Variance (units)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '70%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : history.map((st) => (
                  <tr key={st.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-4">
                      <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                        {st.countNumber}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TYPE_BADGE[st.type]}`}>
                        {st.type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">{st.location}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">{st.startedBy}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">{formatDate(st.startedAt)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[st.status]}`}>
                        {st.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span
                        className={`text-sm font-medium ${
                          st.varianceTotal < 0
                            ? 'text-red-600'
                            : st.varianceTotal > 0
                            ? 'text-green-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {st.varianceTotal > 0 ? '+' : ''}{st.varianceTotal}
                      </span>
                    </td>
                  </tr>
                ))}
            {!isLoading && history.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                  No completed stocktakes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showNewModal && (
        <NewStocktakeModal
          onClose={() => setShowNewModal(false)}
          onCreate={(type, locationId, locationName, cycleOptions) => {
            void handleCreateStocktake(type, locationId, locationName, cycleOptions);
          }}
          locations={locations}
        />
      )}
      {completedItems && completedStocktake && (
        <VarianceReport
          stocktake={completedStocktake}
          items={completedItems}
          onClose={() => {
            setCompletedItems(null);
            setCompletedStocktake(null);
          }}
          onAdjustStock={handleAdjustStock}
        />
      )}
    </div>
  );
}
