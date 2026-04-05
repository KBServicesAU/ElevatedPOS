'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus, X, CheckCircle, ClipboardList, AlertTriangle,
  TrendingDown, TrendingUp,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/formatting';
import { useToast } from '@/lib/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type StocktakeType = 'full' | 'cycle' | 'spot';
type StocktakeStatus = 'in_progress' | 'completed' | 'cancelled';

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
  startedBy: string;
  startedAt: string;
  completedAt?: string;
  status: StocktakeStatus;
  varianceTotal: number; // units
  items: CountItem[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────


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

// ─── New Stocktake Modal ──────────────────────────────────────────────────────

interface NewStocktakeModalProps {
  onClose: () => void;
  onCreate: (type: StocktakeType, locationId: string, locationName: string) => void;
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

  const types: { value: StocktakeType; label: string; description: string }[] = [
    { value: 'full', label: 'Full Count', description: 'Count every item in the store.' },
    { value: 'cycle', label: 'Cycle Count', description: 'Count a subset of items by category or zone.' },
    { value: 'spot', label: 'Spot Check', description: 'Quick check on specific items.' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Stocktake</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">Count Type</label>
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

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Location</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {locationOptions.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const locationName = locationOptions.find((l) => l.id === locationId)?.name ?? locationId;
              onCreate(type, locationId, locationName);
              onClose();
            }}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <ClipboardList className="h-4 w-4" /> Start Count
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Variance Report ──────────────────────────────────────────────────────────

interface VarianceReportProps {
  items: CountItem[];
  onClose: () => void;
}

function VarianceReport({ items, onClose }: VarianceReportProps) {
  const variantItems = items.filter((i) => i.countQty !== null && i.countQty !== i.systemQty);
  const totalVarianceValue = variantItems.reduce((sum, i) => {
    const diff = (i.countQty ?? 0) - i.systemQty;
    return sum + diff * i.unitCost;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Variance Report</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {variantItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-base font-medium text-gray-900 dark:text-white">No variances found</p>
              <p className="text-sm text-gray-500">All items matched system quantities.</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-900/20">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      {variantItems.length} item{variantItems.length !== 1 ? 's' : ''} with variance
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Total variance value: <span className={`font-bold ${totalVarianceValue < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {totalVarianceValue < 0 ? '-' : '+'}{formatCurrency(Math.abs(totalVarianceValue))}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 text-left text-xs font-medium uppercase text-gray-500">Product</th>
                    <th className="pb-2 text-right text-xs font-medium uppercase text-gray-500">System</th>
                    <th className="pb-2 text-right text-xs font-medium uppercase text-gray-500">Count</th>
                    <th className="pb-2 text-right text-xs font-medium uppercase text-gray-500">Variance</th>
                    <th className="pb-2 text-right text-xs font-medium uppercase text-gray-500">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {variantItems.map((item) => {
                    const diff = (item.countQty ?? 0) - item.systemQty;
                    const val = diff * item.unitCost;
                    return (
                      <tr key={item.id}>
                        <td className="py-2.5">
                          <p className="font-medium text-gray-900 dark:text-white">{item.productName}</p>
                          <p className="text-xs text-gray-400">{item.sku}</p>
                        </td>
                        <td className="py-2.5 text-right text-gray-600 dark:text-gray-400">{item.systemQty}</td>
                        <td className="py-2.5 text-right text-gray-600 dark:text-gray-400">{item.countQty}</td>
                        <td className={`py-2.5 text-right font-medium ${diff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </td>
                        <td className={`py-2.5 text-right font-medium ${val < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {val > 0 ? '+' : ''}{formatCurrency(val)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-6 py-4 dark:border-gray-800">
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function StocktakeClient({ currentUserName = 'Unknown' }: { currentUserName?: string }) {
  const { toast } = useToast();
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [countQtys, setCountQtys] = useState<Record<string, string>>({});
  const [completedItems, setCompletedItems] = useState<CountItem[] | null>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/proxy/stocktakes');
        if (res.ok) {
          const json = await res.json();
          setStocktakes(json.data ?? []);
        } else {
          setStocktakes([]);
        }
      } catch {
        setStocktakes([]);
      } finally {
        setIsLoading(false);
      }
    }
    async function loadLocations() {
      try {
        const res = await fetch('/api/proxy/locations');
        if (res.ok) {
          const json = await res.json() as { data?: { id: string; name: string }[] };
          setLocations(json.data ?? []);
        }
      } catch { /* use fallbacks */ }
    }
    void load();
    void loadLocations();
  }, []);

  const activeStocktake = useMemo(
    () => stocktakes.find((s) => s.status === 'in_progress'),
    [stocktakes],
  );

  const history = useMemo(
    () => stocktakes.filter((s) => s.status !== 'in_progress'),
    [stocktakes],
  );

  async function handleCreateStocktake(type: StocktakeType, locationId: string, locationName: string) {
    try {
      const res = await fetch('/api/proxy/stocktakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, countAll: type === 'full' }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const b = await res.json(); msg = b.message ?? b.error ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const json = await res.json() as { data?: Stocktake };
      const record = json.data ?? (json as unknown as Stocktake);
      setStocktakes((prev) => [{ ...record, items: record.items ?? [] }, ...prev]);
      setCountQtys({});
      toast({ title: 'Stocktake started', description: `${locationName} — ${type} count in progress.`, variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to start stocktake', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    }
  }

  async function handleComplete() {
    if (!activeStocktake) return;
    // Merge entered quantities into items
    const updatedItems: CountItem[] = activeStocktake.items.map((item) => ({
      ...item,
      countQty: countQtys[item.id] !== undefined ? parseFloat(countQtys[item.id]) : null,
    }));
    const varianceTotal = updatedItems.reduce((sum, i) => {
      if (i.countQty === null) return sum;
      return sum + (i.countQty - i.systemQty);
    }, 0);

    try {
      await fetch(`/api/proxy/stocktakes/${activeStocktake.id}/complete`, { method: 'POST' });
      setStocktakes((prev) =>
        prev.map((s) =>
          s.id === activeStocktake.id
            ? {
                ...s,
                status: 'completed',
                completedAt: new Date().toISOString(),
                varianceTotal,
                items: updatedItems,
              }
            : s,
        ),
      );
      setCompletedItems(updatedItems);
      setCountQtys({});
      toast({ title: 'Stocktake completed', description: `Variance: ${varianceTotal > 0 ? '+' : ''}${varianceTotal} units.`, variant: 'success' });
    } catch {
      toast({ title: 'Failed to complete stocktake', description: 'Could not save count. Please try again.', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Stocktake</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${history.length} completed count${history.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          disabled={!!activeStocktake}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={activeStocktake ? 'Complete the active count first' : undefined}
        >
          <Plus className="h-4 w-4" /> New Stocktake
        </button>
      </div>

      {/* Active stocktake */}
      {!isLoading && activeStocktake && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/10">
          <div className="flex items-center justify-between border-b border-amber-200 px-5 py-4 dark:border-amber-700/30">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  Active Count: {activeStocktake.countNumber}
                </p>
                <p className="text-xs text-gray-500">
                  {activeStocktake.type.charAt(0).toUpperCase() + activeStocktake.type.slice(1)} · {activeStocktake.location} · Started {formatDateTime(activeStocktake.startedAt)} by {activeStocktake.startedBy}
                </p>
              </div>
            </div>
            <button
              onClick={handleComplete}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4" /> Complete Count
            </button>
          </div>

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
              {activeStocktake.items.map((item) => {
                const rawCount = countQtys[item.id];
                const countVal = rawCount !== undefined ? parseFloat(rawCount) : null;
                const variance = countVal !== null ? countVal - item.systemQty : null;

                return (
                  <tr key={item.id} className="hover:bg-amber-50/60 dark:hover:bg-amber-900/5">
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">
                      {item.productName}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400">{item.sku}</td>
                    <td className="px-5 py-3.5 text-right text-sm text-gray-600 dark:text-gray-400">
                      {item.systemQty}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <input
                        type="number"
                        min="0"
                        placeholder="—"
                        value={rawCount ?? ''}
                        onChange={(e) =>
                          setCountQtys((q) => ({ ...q, [item.id]: e.target.value }))
                        }
                        className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
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
                          {variance < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : variance > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : null}
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
                      <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">{st.countNumber}</span>
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
                          st.varianceTotal < 0 ? 'text-red-600' : st.varianceTotal > 0 ? 'text-green-600' : 'text-gray-500'
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
          onCreate={(type, locationId, locationName) => { void handleCreateStocktake(type, locationId, locationName); }}
          locations={locations}
        />
      )}
      {completedItems && (
        <VarianceReport items={completedItems} onClose={() => setCompletedItems(null)} />
      )}
    </div>
  );
}
