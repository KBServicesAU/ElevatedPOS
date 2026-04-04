'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { platformFetch } from '@/lib/api';
import { RefreshCw } from 'lucide-react';

interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  orgId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  data: AuditLog[];
  total: number;
}

const LIMIT = 50;

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const [filterOrgId, setFilterOrgId] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterResourceType, setFilterResourceType] = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (currentOffset: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(currentOffset),
      });
      if (filterOrgId) params.set('orgId', filterOrgId);
      if (filterAction) params.set('action', filterAction);
      if (filterResourceType) params.set('resourceType', filterResourceType);

      const data = (await platformFetch(`platform/audit-logs?${params.toString()}`)) as AuditLogsResponse;
      setLogs(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filterOrgId, filterAction, filterResourceType]);

  useEffect(() => {
    setOffset(0);
    void load(0);
  }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void load(offset);
    }, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load, offset]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    void load(0);
  }

  function handlePageChange(newOffset: number) {
    setOffset(newOffset);
    void load(newOffset);
  }

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-gray-500 text-sm mt-1">Platform activity history — auto-refreshes every 30s</p>
        </div>
        <button
          onClick={() => void load(offset)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#111118] border border-[#1e1e2e] hover:border-indigo-500 text-gray-400 hover:text-white text-sm rounded transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <form onSubmit={handleFilterSubmit} className="flex gap-3 mb-4">
        <input
          type="text"
          value={filterOrgId}
          onChange={(e) => setFilterOrgId(e.target.value)}
          placeholder="Filter by Org ID..."
          className="flex-1 bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <input
          type="text"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          placeholder="Filter by Action..."
          className="flex-1 bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <input
          type="text"
          value={filterResourceType}
          onChange={(e) => setFilterResourceType(e.target.value)}
          placeholder="Filter by Resource Type..."
          className="flex-1 bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
        >
          Filter
        </button>
        {(filterOrgId || filterAction || filterResourceType) && (
          <button
            type="button"
            onClick={() => {
              setFilterOrgId('');
              setFilterAction('');
              setFilterResourceType('');
            }}
            className="px-4 py-2 bg-[#111118] border border-[#1e1e2e] text-gray-400 hover:text-white text-sm rounded transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Actor</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Action</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Resource Type</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Resource ID</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Org ID</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">IP</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-600">Loading...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-600">No audit log entries found</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-[#1e1e2e] hover:bg-[#1e1e2e]/30">
                  <td className="px-4 py-3">
                    <p className="text-white text-xs">
                      {log.actorName ?? log.actorEmail ?? log.actorId ?? '—'}
                    </p>
                    {log.actorName && log.actorEmail && (
                      <p className="text-gray-600 text-xs">{log.actorEmail}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded text-xs font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{log.resourceType ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                    {log.resourceId ? log.resourceId.slice(0, 12) + '...' : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                    {log.orgId ? log.orgId.slice(0, 12) + '...' : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{log.ipAddress ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-gray-500 text-sm">
            Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(offset - LIMIT)}
              disabled={offset === 0}
              className="px-3 py-1.5 bg-[#111118] border border-[#1e1e2e] text-gray-400 hover:text-white text-sm rounded disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-gray-400 text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(offset + LIMIT)}
              disabled={offset + LIMIT >= total}
              className="px-3 py-1.5 bg-[#111118] border border-[#1e1e2e] text-gray-400 hover:text-white text-sm rounded disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
