'use client';

/**
 * Audit Logs (org-portal) — v2.7.48-univlog
 * ================================================================
 * Per-merchant view of every server mutation captured by the
 * @nexus/fastify-audit plugin registered in each backend service.
 * Filters: date range, actor, action, entity type. Detail panel
 * shows the full before/after JSON diff. Export streams the current
 * filter set as JSON or CSV from the auth-service /export endpoint.
 *
 * Routed via /api/proxy/audit-logs → AUTH_API_URL/api/v1/audit-logs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

interface AuditLog {
  id: string;
  orgId: string | null;
  actorType: 'employee' | 'device' | 'godmode_staff' | 'system' | 'customer';
  actorId: string | null;
  actorName: string | null;
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'auth_fail';
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  endpoint: string | null;
  method: string | null;
  statusCode: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  service: string | null;
  notes: string | null;
  createdAt: string;
}

interface ListResponse {
  data: AuditLog[];
  meta: { totalCount: number; hasMore: boolean; limit: number; offset: number };
}

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'auth_fail', label: 'Auth failure' },
];

const ACTOR_TYPE_OPTIONS = [
  { value: '', label: 'All actors' },
  { value: 'employee', label: 'Employee' },
  { value: 'device', label: 'Device' },
  { value: 'godmode_staff', label: 'Support staff' },
  { value: 'system', label: 'System' },
  { value: 'customer', label: 'Customer' },
];

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  update: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  delete: 'bg-red-50 text-red-700 ring-red-600/20',
  login: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  logout: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  auth_fail: 'bg-orange-50 text-orange-700 ring-orange-600/20',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-AU');
}

export function AuditLogsClient() {
  const { toast } = useToast();

  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actorType, setActorType] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    if (actorType) params.set('actorType', actorType);
    if (action) params.set('action', action);
    if (entityType) params.set('entityType', entityType);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
  }, [from, to, actorType, action, entityType, offset]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await apiFetch(`audit-logs?${queryString}`)) as ListResponse;
      setRows(data.data ?? []);
      setTotalCount(data.meta?.totalCount ?? 0);
    } catch (err) {
      toast({
        title: 'Failed to load audit logs',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [queryString, toast]);

  useEffect(() => { void load(); }, [load]);

  const onExport = (format: 'json' | 'csv') => {
    const params = new URLSearchParams(queryString);
    params.delete('limit'); params.delete('offset');
    params.set('format', format);
    window.location.href = `/api/proxy/audit-logs/export?${params.toString()}`;
  };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Every server change in your organisation — order updates, product edits, employee logins, settings changes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onExport('json')}
            className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
          >
            Export JSON
          </button>
          <button
            onClick={() => onExport('csv')}
            className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setOffset(0); }}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setOffset(0); }}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Actor</label>
          <select
            value={actorType}
            onChange={(e) => { setActorType(e.target.value); setOffset(0); }}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            {ACTOR_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Action</label>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setOffset(0); }}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Entity</label>
          <input
            type="text"
            placeholder="order, product, …"
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setOffset(0); }}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">When</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Service</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Actor</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Action</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Entity</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Endpoint</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No activity matches these filters.</td></tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-6 py-3 text-gray-900 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-6 py-3 text-gray-600 text-xs">{r.service ?? '—'}</td>
                  <td className="px-6 py-3 text-gray-900">
                    <span className="text-xs text-gray-500">{r.actorType}</span>
                    <br />
                    <span>{r.actorName ?? '—'}</span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded ring-1 ring-inset text-xs uppercase ${ACTION_BADGE[r.action] ?? ''}`}>
                      {r.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-900">
                    <span>{r.entityType}</span>
                    {r.entityName && <><br /><span className="text-xs text-gray-500">{r.entityName}</span></>}
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs truncate max-w-[200px]">{r.endpoint ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
        <span>
          {totalCount === 0
            ? 'No results'
            : `Showing ${offset + 1}–${Math.min(offset + rows.length, totalCount)} of ${totalCount}`}
        </span>
        <div className="flex gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1 border border-gray-300 text-gray-700 rounded disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={offset + rows.length >= totalCount}
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1 border border-gray-300 text-gray-700 rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div
            className="bg-white border border-gray-200 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Activity detail</h2>
                <p className="text-xs text-gray-500 mt-1">{selected.id}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700">Close</button>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
              <Field label="When" value={formatDate(selected.createdAt)} />
              <Field label="Service" value={selected.service ?? '—'} />
              <Field label="Actor" value={`${selected.actorType}${selected.actorName ? ` — ${selected.actorName}` : ''}`} />
              <Field label="Action" value={selected.action} />
              <Field label="Entity" value={`${selected.entityType}${selected.entityName ? ` — ${selected.entityName}` : ''}`} />
              <Field label="Method" value={selected.method ?? '—'} />
              <Field label="Status" value={selected.statusCode ?? '—'} />
              <div className="col-span-2"><dt className="text-xs text-gray-500">Endpoint</dt><dd className="text-gray-900 break-all">{selected.endpoint ?? '—'}</dd></div>
              <Field label="IP" value={selected.ipAddress ?? '—'} />
              <Field label="Entity ID" value={selected.entityId ?? '—'} />
            </dl>

            {selected.notes && (
              <div className="mb-4 text-sm">
                <dt className="text-xs text-gray-500">Notes</dt>
                <dd className="text-gray-700">{selected.notes}</dd>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Before</h3>
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto text-gray-700 max-h-96 overflow-y-auto">
                  {selected.beforeJson ? JSON.stringify(selected.beforeJson, null, 2) : '— (not captured)'}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">After</h3>
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto text-gray-700 max-h-96 overflow-y-auto">
                  {selected.afterJson ? JSON.stringify(selected.afterJson, null, 2) : '— (not captured)'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-900 break-all">{value}</dd>
    </div>
  );
}
