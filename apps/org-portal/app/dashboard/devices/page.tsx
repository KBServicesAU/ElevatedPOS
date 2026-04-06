'use client';

import { useEffect, useState, useCallback } from 'react';
import { MonitorSmartphone, Search, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';

interface Device {
  id: string;
  name?: string;
  role?: string;
  status?: string;
  lastSeen?: string;
  organisation?: { id: string; businessName: string };
  orgName?: string;
}

interface ApiResponse {
  devices?: Device[];
  data?: Device[];
}

const ROLES = ['all', 'pos', 'kds', 'kiosk'] as const;
const STATUSES = ['all', 'active', 'inactive'] as const;

const PAGE_SIZE = 25;

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch('/api/proxy/platform/devices');
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
      if (Array.isArray(data)) {
        setDevices(data as Device[]);
      } else if (data && typeof data === 'object') {
        const d = data as ApiResponse;
        if (Array.isArray(d.devices)) setDevices(d.devices);
        else if (Array.isArray(d.data)) setDevices(d.data);
        else setDevices([]);
      } else {
        setDevices([]);
      }
    } catch (err) {
      setFetchError((err as Error).message ?? 'Failed to load devices');
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [roleFilter, statusFilter, search]);

  const filtered = devices.filter((d) => {
    const roleOk = roleFilter === 'all' || (d.role?.toLowerCase() ?? '') === roleFilter;
    const statusOk = statusFilter === 'all' || (d.status?.toLowerCase() ?? '') === statusFilter;
    const q = search.toLowerCase();
    const searchOk =
      !q ||
      (d.name ?? d.id).toLowerCase().includes(q) ||
      (d.organisation?.businessName ?? d.orgName ?? '').toLowerCase().includes(q) ||
      (d.role ?? '').toLowerCase().includes(q);
    return roleOk && statusOk && searchOk;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <MonitorSmartphone size={24} className="text-blue-700 dark:text-blue-400" />
            Devices
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Read-only device overview across all merchants
          </p>
        </div>
        <button
          onClick={() => void fetchDevices()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={16} />
          <input
            type="search"
            placeholder="Search by device name or merchant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">Role:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r === 'all' ? 'All roles' : r.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        {!loading && (
          <span className="text-sm text-gray-400 dark:text-gray-500 ml-auto whitespace-nowrap">
            {filtered.length} device{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-400 dark:text-gray-500">
            <Loader2 size={18} className="animate-spin" />
            Loading devices…
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-red-500 dark:text-red-400">
            <AlertCircle size={20} />
            <span>{fetchError}</span>
            <button
              onClick={() => void fetchDevices()}
              className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <MonitorSmartphone size={36} className="mx-auto text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {devices.length === 0 ? 'No devices found' : 'No devices match your search or filters'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Merchant
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Device
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {paginated.map((device) => (
                    <tr key={device.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {device.organisation?.businessName ?? device.orgName ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {device.name ?? device.id}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {device.role ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 uppercase">
                            {device.role}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm">
                        <StatusBadge status={device.status} />
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Page {page} of {totalPages} &mdash; {filtered.length} devices
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

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Support staff have read-only access to device data. Device revocation requires superadmin access.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = status?.toLowerCase() ?? '';
  const classes =
    s === 'active'
      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      : s === 'inactive'
      ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${classes}`}
    >
      {status ?? 'unknown'}
    </span>
  );
}
