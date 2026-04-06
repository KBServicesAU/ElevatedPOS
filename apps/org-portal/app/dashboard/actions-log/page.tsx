'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ScrollText,
  Search,
  RefreshCw,
  AlertCircle,
  Loader2,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: string;
  action: string;
  actorName?: string;
  actorEmail?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  orgId?: string;
  orgName?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

interface ApiAuditLogResponse {
  logs?: AuditLogEntry[];
  data?: AuditLogEntry[];
  actions?: AuditLogEntry[];
  entries?: AuditLogEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

const ACTION_CATEGORIES: { value: string; label: string }[] = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'password_reset', label: 'Password Reset' },
  { value: 'employee_update', label: 'Employee Update' },
  { value: 'employee_create', label: 'Employee Create' },
  { value: 'employee_delete', label: 'Employee Delete' },
  { value: 'device_register', label: 'Device Register' },
  { value: 'device_revoke', label: 'Device Revoke' },
  { value: 'org_update', label: 'Org Update' },
  { value: 'signup_link_create', label: 'Signup Link Create' },
  { value: 'note_create', label: 'Note Create' },
  { value: 'note_delete', label: 'Note Delete' },
];

async function apiFetch(path: string): Promise<unknown> {
  const res = await fetch(`/api/proxy/${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
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
  return data;
}

function actionBadgeClass(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('delete') || a.includes('revoke') || a.includes('remove'))
    return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
  if (a.includes('create') || a.includes('register') || a.includes('add'))
    return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
  if (a.includes('update') || a.includes('reset') || a.includes('edit'))
    return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
  if (a.includes('login') || a.includes('logout'))
    return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
  return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Expanded metadata row
// ---------------------------------------------------------------------------

function MetadataRow({ entry }: { entry: AuditLogEntry }) {
  const meta = entry.metadata;
  if (!meta || Object.keys(meta).length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-5 py-3">
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">No additional metadata.</p>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={6} className="px-5 py-0">
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg my-2 overflow-hidden">
          <table className="min-w-full">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {Object.entries(meta).map(([key, value]) => (
                <tr key={key}>
                  <td className="px-4 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 w-48 align-top">
                    {key}
                  </td>
                  <td className="px-4 py-1.5 text-xs text-gray-700 dark:text-gray-300 font-mono break-all">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                  </td>
                </tr>
              ))}
              {entry.ipAddress && (
                <tr>
                  <td className="px-4 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 w-48">
                    IP Address
                  </td>
                  <td className="px-4 py-1.5 text-xs text-gray-700 dark:text-gray-300 font-mono">
                    {entry.ipAddress}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Log entry row
// ---------------------------------------------------------------------------

function LogRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = (entry.metadata && Object.keys(entry.metadata).length > 0) || entry.ipAddress;

  return (
    <>
      <tr
        className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded((v) => !v)}
      >
        <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {hasDetails ? (
              expanded ? (
                <ChevronDown size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
              )
            ) : (
              <span className="w-3.5" />
            )}
            {new Date(entry.createdAt).toLocaleString()}
          </div>
        </td>
        <td className="px-5 py-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${actionBadgeClass(
              entry.action
            )}`}
          >
            {formatAction(entry.action)}
          </span>
        </td>
        <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">
          {entry.actorName ?? entry.actorEmail ?? entry.actorId ?? '—'}
        </td>
        <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
          {entry.targetType ? (
            <span className="text-xs font-mono">{entry.targetType}</span>
          ) : (
            '—'
          )}
        </td>
        <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
          {entry.targetName ?? (entry.targetId ? entry.targetId.slice(0, 8) + '…' : '—')}
        </td>
        <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
          {entry.orgName ?? (entry.orgId ? entry.orgId.slice(0, 8) + '…' : '—')}
        </td>
      </tr>
      {expanded && <MetadataRow entry={entry} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ActionsLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      const qs = params.toString();

      const data = await apiFetch(`platform/audit-logs${qs ? `?${qs}` : ''}`);
      if (Array.isArray(data)) {
        setEntries(data as AuditLogEntry[]);
      } else if (data && typeof data === 'object') {
        const d = data as ApiAuditLogResponse;
        if (Array.isArray(d.logs)) setEntries(d.logs);
        else if (Array.isArray(d.entries)) setEntries(d.entries);
        else if (Array.isArray(d.actions)) setEntries(d.actions);
        else if (Array.isArray(d.data)) setEntries(d.data);
        else setEntries([]);
      } else {
        setEntries([]);
      }
      setPage(1);
    } catch (err) {
      setFetchError((err as Error).message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, dateFrom, dateTo]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  const filtered = entries.filter((entry) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      entry.action.toLowerCase().includes(q) ||
      (entry.actorName ?? '').toLowerCase().includes(q) ||
      (entry.actorEmail ?? '').toLowerCase().includes(q) ||
      (entry.targetName ?? '').toLowerCase().includes(q) ||
      (entry.targetType ?? '').toLowerCase().includes(q) ||
      (entry.orgName ?? '').toLowerCase().includes(q) ||
      (entry.targetId ?? '').toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ScrollText size={24} className="text-blue-700 dark:text-blue-400" />
            Actions Log
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Audit trail of support and system actions
          </p>
        </div>
        <button
          onClick={() => void fetchLogs()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={16} />
            <input
              type="search"
              placeholder="Search by actor, action, target…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* Action filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {ACTION_CATEGORIES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Toggle advanced filters */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              showFilters
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Filter size={14} />
            Date Range
          </button>

          {!loading && (
            <span className="text-sm text-gray-400 dark:text-gray-500 ml-auto whitespace-nowrap">
              {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}
            </span>
          )}
        </div>

        {/* Date range filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-400 dark:text-gray-500">
            <Loader2 size={18} className="animate-spin" />
            Loading audit log…
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-red-500 dark:text-red-400">
            <AlertCircle size={20} />
            <span>{fetchError}</span>
            <button
              onClick={() => void fetchLogs()}
              className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500 gap-3">
            <ScrollText size={36} className="opacity-30" />
            <p className="text-sm">
              {entries.length === 0
                ? 'No audit log entries found.'
                : 'No entries match your search or filters.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actor
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Target Type
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Target
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Organisation
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {paginated.map((entry) => (
                    <LogRow key={entry.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Page {page} of {totalPages} &mdash; {filtered.length} entries
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
