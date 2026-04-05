'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutGrid, List, Plus, RefreshCw, Loader2, X,
  Users, Clock, ShoppingCart, CheckCircle, Brush,
  Merge, MousePointer, ExternalLink,
} from 'lucide-react';
import { useToast } from '@/lib/use-toast';
import { timeAgo, getErrorMessage } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

interface TableSection {
  id: string;
  name: string;
}

interface TableRow {
  id: string;
  name: string;
  capacity: number;
  section: string;
  sectionName?: string;
  status: TableStatus;
  currentOrderId?: string | null;
  seatedAt?: string | null;
}

interface OrderSummary {
  id: string;
  orderNumber: string;
  subtotal: number;
  items: { name: string; qty: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TableStatus, string> = {
  available: 'bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300',
  occupied:  'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300',
  reserved:  'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300',
  cleaning:  'bg-gray-100 border-gray-300 text-gray-600 dark:bg-gray-700/40 dark:border-gray-600 dark:text-gray-400',
};

const STATUS_DOT: Record<TableStatus, string> = {
  available: 'bg-green-500',
  occupied:  'bg-amber-500',
  reserved:  'bg-blue-500',
  cleaning:  'bg-gray-400',
};

const STATUS_LABEL: Record<TableStatus, string> = {
  available: 'Available',
  occupied:  'Occupied',
  reserved:  'Reserved',
  cleaning:  'Cleaning',
};

// ─── Duration helper ──────────────────────────────────────────────────────────

function seatedDuration(iso: string | null | undefined): string {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function proxyFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── AddTableModal ────────────────────────────────────────────────────────────

interface AddTableModalProps {
  sections: TableSection[];
  onClose: () => void;
  onSaved: () => void;
}

function AddTableModal({ sections, onClose, onSaved }: AddTableModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [section, setSection] = useState(sections[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: 'Table name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await proxyFetch('tables', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), capacity, section }),
      });
      toast({ title: 'Table added', variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: 'Failed to add table', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Add Table</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Table name / number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Table 12, Bar Seat 3"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Capacity</label>
            <input
              type="number"
              min={1}
              max={20}
              value={capacity}
              onChange={(e) => setCapacity(Math.min(20, Math.max(1, Number(e.target.value))))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Section</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {sections.length === 0 && <option value="">No sections</option>}
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Table
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TableDetailPanel ─────────────────────────────────────────────────────────

interface TableDetailPanelProps {
  table: TableRow;
  onClose: () => void;
  onStatusChanged: () => void;
}

function TableDetailPanel({ table, onClose, onStatusChanged }: TableDetailPanelProps) {
  const { toast } = useToast();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (table.status === 'occupied' && table.currentOrderId) {
      setLoadingOrder(true);
      proxyFetch<{ data: OrderSummary }>(`orders/${table.currentOrderId}`)
        .then((res) => setOrder(res.data ?? null))
        .catch(() => setOrder(null))
        .finally(() => setLoadingOrder(false));
    } else {
      setOrder(null);
    }
  }, [table.id, table.currentOrderId, table.status]);

  async function updateStatus(status: TableStatus) {
    setUpdatingStatus(true);
    try {
      await proxyFetch(`tables/${table.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast({ title: 'Status updated', description: `${table.name} marked as ${STATUS_LABEL[status]}.`, variant: 'success' });
      onStatusChanged();
    } catch (err) {
      toast({ title: 'Failed to update status', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{table.name}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{table.sectionName ?? table.section}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 p-5">
        {/* Status + capacity */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-100 p-3.5 dark:border-gray-800">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Status</p>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[table.status]}`} />
              <span className="text-sm font-medium text-gray-900 dark:text-white">{STATUS_LABEL[table.status]}</span>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 p-3.5 dark:border-gray-800">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Capacity</p>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">{table.capacity} seats</span>
            </div>
          </div>
        </div>

        {/* Seated duration */}
        {table.status === 'occupied' && table.seatedAt && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
            <Clock className="h-4 w-4 flex-shrink-0 text-amber-500" />
            <div>
              <p className="text-xs text-amber-700 dark:text-amber-400">Seated {timeAgo(table.seatedAt)}</p>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Duration: {seatedDuration(table.seatedAt)}</p>
            </div>
          </div>
        )}

        {/* Current order */}
        {table.status === 'occupied' && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Current Order</p>
            {loadingOrder ? (
              <div className="space-y-2 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                {[1, 2].map((i) => (
                  <div key={i} className="flex animate-pulse justify-between">
                    <div className="h-4 w-36 rounded bg-gray-100 dark:bg-gray-700" />
                    <div className="h-4 w-10 rounded bg-gray-100 dark:bg-gray-700" />
                  </div>
                ))}
              </div>
            ) : order ? (
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-800/50">
                  <p className="text-xs font-medium text-gray-500 font-mono">{order.orderNumber}</p>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(order.items ?? []).slice(0, 6).map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2">
                      <p className="text-sm text-gray-700 dark:text-gray-300">{item.name}</p>
                      <span className="text-xs font-medium text-gray-500">×{item.qty}</span>
                    </div>
                  ))}
                  {(order.items ?? []).length > 6 && (
                    <p className="px-4 py-2 text-xs text-gray-400">+{order.items.length - 6} more items</p>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 dark:border-gray-800">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Subtotal</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    ${Number(order.subtotal ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : table.currentOrderId ? (
              <p className="text-sm text-gray-400 px-1">Could not load order details.</p>
            ) : (
              <p className="text-sm text-gray-400 px-1">No active order.</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Actions</p>
          <a
            href={`/pos?tableId=${table.id}`}
            className="flex w-full items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
          >
            <div className="flex items-center gap-2.5">
              <ShoppingCart className="h-4 w-4" />
              New Order
            </div>
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </a>

          {table.status !== 'cleaning' && (
            <button
              onClick={() => updateStatus('cleaning')}
              disabled={updatingStatus}
              className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brush className="h-4 w-4 text-gray-400" />}
              Mark as Cleaning
            </button>
          )}

          {table.status !== 'available' && (
            <button
              onClick={() => updateStatus('available')}
              disabled={updatingStatus}
              className="flex w-full items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-60 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
            >
              {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Mark as Available
            </button>
          )}
        </div>

        {/* View order link */}
        {table.currentOrderId && (
          <a
            href={`/dashboard/orders?orderId=${table.currentOrderId}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ExternalLink className="h-4 w-4" />
            View Order in Orders
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TablesClient() {
  const { toast } = useToast();

  // Data
  const [tables, setTables] = useState<TableRow[]>([]);
  const [sections, setSections] = useState<TableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // UI state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeSection, setActiveSection] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailTable, setDetailTable] = useState<TableRow | null>(null);
  const [merging, setMerging] = useState(false);

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [tablesRes, sectionsRes] = await Promise.all([
        proxyFetch<{ data: TableRow[] }>('tables').catch(() => ({ data: [] })),
        proxyFetch<{ data: TableSection[] }>('tables/sections').catch(() => ({ data: [] })),
      ]);

      const sectionMap: Record<string, string> = {};
      for (const s of sectionsRes.data ?? []) sectionMap[s.id] = s.name;

      const enriched = (tablesRes.data ?? []).map((t) => ({
        ...t,
        sectionName: sectionMap[t.section] ?? t.section,
      }));

      setTables(enriched);
      setSections(sectionsRes.data ?? []);

      // Keep detail panel in sync
      if (detailTable) {
        const updated = enriched.find((t) => t.id === detailTable.id);
        if (updated) setDetailTable(updated);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [detailTable]);

  useEffect(() => {
    void fetchData(false);
    refreshTimer.current = setInterval(() => { void fetchData(true); }, 30_000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const sectionTabs = [{ id: 'all', name: 'All' }, ...sections];

  const visibleTables = activeSection === 'all'
    ? tables
    : tables.filter((t) => t.section === activeSection);

  const availableCount = tables.filter((t) => t.status === 'available').length;
  const occupiedCount  = tables.filter((t) => t.status === 'occupied').length;

  // ── Select mode ────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // ── Merge ──────────────────────────────────────────────────────────────────

  async function handleMerge() {
    if (selectedIds.size < 2) return;
    setMerging(true);
    try {
      await proxyFetch('tables/merge', {
        method: 'POST',
        body: JSON.stringify({ tableIds: Array.from(selectedIds) }),
      });
      toast({ title: 'Tables merged', variant: 'success' });
      exitSelectMode();
      void fetchData(true);
    } catch (err) {
      toast({ title: 'Merge failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setMerging(false);
    }
  }

  // ── Table click ────────────────────────────────────────────────────────────

  function handleTableClick(table: TableRow) {
    if (selectMode) {
      toggleSelect(table.id);
    } else {
      setDetailTable(table);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full gap-0">
      {/* ── Main area ── */}
      <div className={`flex flex-1 flex-col space-y-5 transition-all ${detailTable ? 'mr-80' : ''}`}>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Table Management</h2>
            {loading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (
              <p className="text-sm text-gray-500">
                {tables.length} tables &middot;{' '}
                <span className="text-green-600 dark:text-green-400">{availableCount} available</span>
                {' '}&middot;{' '}
                <span className="text-amber-600 dark:text-amber-400">{occupiedCount} occupied</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Select mode toggle */}
            <button
              onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                selectMode
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              <MousePointer className="h-4 w-4" />
              {selectMode ? 'Exit Select' : 'Select'}
            </button>

            {/* Merge button — visible when 2+ selected */}
            {selectMode && selectedIds.size >= 2 && (
              <button
                onClick={handleMerge}
                disabled={merging}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
                Merge ({selectedIds.size})
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={() => void fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>

            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800">
              <button
                onClick={() => setViewMode('grid')}
                className={`rounded-md p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                title="Floor plan view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`rounded-md p-1.5 transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Add table */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Table
            </button>
          </div>
        </div>

        {/* Select mode banner */}
        {selectMode && (
          <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-900/20">
            <div className="flex items-center gap-2.5">
              <MousePointer className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                Select 2 or more tables to merge them
                {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
              </span>
            </div>
            <button onClick={exitSelectMode} className="text-xs text-indigo-500 underline hover:text-indigo-700">
              Cancel
            </button>
          </div>
        )}

        {/* Status legend */}
        <div className="flex flex-wrap gap-3">
          {(Object.keys(STATUS_LABEL) as TableStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[s]}`} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{STATUS_LABEL[s]}</span>
            </div>
          ))}
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit overflow-x-auto dark:border-gray-800 dark:bg-gray-900">
          {sectionTabs.map(({ id, name }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                activeSection === id
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {/* ── Floor Plan (Grid) View ── */}
        {viewMode === 'grid' && (
          <div>
            {loading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" style={{ height: 110 }} />
                ))}
              </div>
            ) : visibleTables.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 py-16 dark:border-gray-700">
                <LayoutGrid className="mb-3 h-8 w-8 text-gray-300" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No tables in this section</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" /> Add Table
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {visibleTables.map((table) => {
                  const isSelected = selectedIds.has(table.id);
                  const isActive = detailTable?.id === table.id;
                  return (
                    <button
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-4 text-center transition-all hover:shadow-md ${
                        STATUS_COLORS[table.status]
                      } ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2' : ''} ${
                        isActive && !selectMode ? 'ring-2 ring-indigo-500 ring-offset-2' : ''
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                          ✓
                        </span>
                      )}
                      <p className="text-sm font-bold leading-tight">{table.name}</p>
                      <div className="mt-1.5 flex items-center gap-1 opacity-75">
                        <Users className="h-3 w-3" />
                        <span className="text-xs">{table.capacity}</span>
                      </div>
                      <span className="mt-2 inline-block rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium dark:bg-black/20">
                        {STATUS_LABEL[table.status]}
                      </span>
                      {table.status === 'occupied' && table.seatedAt && (
                        <p className="mt-1 text-[10px] opacity-75">{seatedDuration(table.seatedAt)}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── List View ── */}
        {viewMode === 'list' && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            {loading ? (
              <div className="p-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="mb-3 flex animate-pulse gap-4">
                    <div className="h-5 w-24 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-5 w-16 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-5 w-20 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-5 w-20 rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    {selectMode && <th className="w-10 px-4 py-3" />}
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Capacity</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Section</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Order #</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Seated At</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Duration</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {visibleTables.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-400">
                        No tables found.
                      </td>
                    </tr>
                  ) : (
                    visibleTables.map((table) => (
                      <tr
                        key={table.id}
                        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                          selectedIds.has(table.id) ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                        }`}
                        onClick={() => handleTableClick(table)}
                      >
                        {selectMode && (
                          <td className="px-4 py-3.5">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(table.id)}
                              onChange={() => toggleSelect(table.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                            />
                          </td>
                        )}
                        <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white">{table.name}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {table.capacity}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{table.sectionName ?? table.section}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[table.status]}`} />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{STATUS_LABEL[table.status]}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm text-gray-500 dark:text-gray-400">
                          {table.currentOrderId ? (
                            <a
                              href={`/dashboard/orders?orderId=${table.currentOrderId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              View Order
                            </a>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                          {table.seatedAt ? timeAgo(table.seatedAt) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                          {seatedDuration(table.seatedAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailTable(table); }}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Detail Panel (right slide-in) ── */}
      {detailTable && (
        <div className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
          <TableDetailPanel
            table={detailTable}
            onClose={() => setDetailTable(null)}
            onStatusChanged={() => void fetchData(true)}
          />
        </div>
      )}

      {/* ── Add Table Modal ── */}
      {showAddModal && (
        <AddTableModal
          sections={sections}
          onClose={() => setShowAddModal(false)}
          onSaved={() => void fetchData(true)}
        />
      )}
    </div>
  );
}
