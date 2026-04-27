'use client';

/**
 * Godmode Terminal Logs — v2.7.48
 * ================================================================
 * Cross-org view of every ANZ Worldline TIM API interaction. Built
 * for ANZ certification submission (cert reviewers want to drill in
 * across the whole platform) and ongoing operations (support staff
 * triaging cardholder disputes that span multiple merchants).
 *
 * Authn: relies on the godmode_token cookie set at /login. The proxy
 * forwards it as a Bearer to the orders service which checks
 * `type: 'platform'` on the JWT before serving these rows.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { platformFetch } from '@/lib/api';

interface TerminalTx {
  id: string;
  orgId: string;
  locationId: string | null;
  deviceId: string | null;
  orderId: string | null;
  referenceId: string | null;
  provider: string;
  outcome: 'approved' | 'declined' | 'cancelled' | 'error' | 'timeout';
  amountCents: number | null;
  transactionType:
    | 'purchase'
    | 'refund'
    | 'reversal'
    | 'reconcile'
    | 'logon'
    | 'logoff'
    | null;
  transactionRef: string | null;
  authCode: string | null;
  rrn: string | null;
  maskedPan: string | null;
  cardType: string | null;
  errorCategory: string | null;
  errorCode: number | null;
  errorMessage: string | null;
  errorStep: string | null;
  merchantReceipt: string | null;
  customerReceipt: string | null;
  durationMs: number | null;
  createdAt: string;
  raw: unknown;
}

interface ListResponse {
  data: TerminalTx[];
  meta: { totalCount: number; hasMore: boolean; limit: number; offset: number };
}

interface OrgRef { id: string; name: string }

const OUTCOME_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'error', label: 'Error' },
  { value: 'timeout', label: 'Timeout' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'refund', label: 'Refund' },
  { value: 'reversal', label: 'Reversal' },
  { value: 'reconcile', label: 'Reconcile' },
  { value: 'logon', label: 'Logon' },
  { value: 'logoff', label: 'Logoff' },
];

const OUTCOME_BADGE: Record<string, string> = {
  approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  declined: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  error: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  timeout: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

function formatAUD(cents: number | null): string {
  if (cents === null) return '—';
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-AU');
}

export default function GodmodeTerminalLogsPage() {
  const [rows, setRows] = useState<TerminalTx[]>([]);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filters
  const [orgId, setOrgId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [outcome, setOutcome] = useState('');
  const [transactionType, setTransactionType] = useState('');

  const [offset, setOffset] = useState(0);
  const limit = 50;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (orgId) params.set('orgId', orgId);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    if (outcome) params.set('outcome', outcome);
    if (transactionType) params.set('transactionType', transactionType);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
  }, [orgId, from, to, outcome, transactionType, offset]);

  // Org lookup table — feeds the merchant-name column. platform/organisations
  // is the canonical list and is already paginated; we pull a lot here so
  // the table doesn't show "—" for any org. v2.7.48 (cert evidence).
  useEffect(() => {
    void (async () => {
      try {
        const data = (await platformFetch('platform/organisations?limit=200')) as { data?: OrgRef[] };
        const map: Record<string, string> = {};
        for (const o of data.data ?? []) map[o.id] = o.name;
        setOrgs(map);
      } catch {
        // non-fatal — table renders without merchant name
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = (await platformFetch(`godmode/terminal/transactions?${queryString}`)) as ListResponse;
      setRows(data.data ?? []);
      setTotalCount(data.meta?.totalCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terminal logs.');
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  const onExport = (format: 'json' | 'csv') => {
    const params = new URLSearchParams(queryString);
    params.delete('limit');
    params.delete('offset');
    params.set('format', format);
    window.location.href = `/api/proxy/godmode/terminal/transactions/export?${params.toString()}`;
  };

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Terminal Logs</h1>
          <p className="text-gray-500 text-sm mt-1">
            Cross-org ANZ Worldline TIM API audit log. Every transaction attempt across the platform.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onExport('json')} className="px-3 py-2 text-sm border border-[#1e1e2e] text-gray-300 rounded hover:bg-[#1e1e2e]">
            Export JSON
          </button>
          <button onClick={() => onExport('csv')} className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded">
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Org</label>
          <select
            value={orgId}
            onChange={(e) => { setOrgId(e.target.value); setOffset(0); }}
            className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="">All orgs</option>
            {Object.entries(orgs).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setOffset(0); }}
            className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setOffset(0); }}
            className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Outcome</label>
          <select
            value={outcome}
            onChange={(e) => { setOutcome(e.target.value); setOffset(0); }}
            className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            {OUTCOME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Type</label>
          <select
            value={transactionType}
            onChange={(e) => { setTransactionType(e.target.value); setOffset(0); }}
            className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">When</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Merchant</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Outcome</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Auth</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Card</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Reference</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-600">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-600">No transactions match these filters.</td></tr>
            ) : (
              rows.map((r) => {
                const orgName = orgs[r.orgId] ?? `${r.orgId.slice(0, 8)}…`;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="border-b border-[#1e1e2e] cursor-pointer hover:bg-[#1e1e2e]/30"
                  >
                    <td className="px-6 py-3 text-gray-300 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-6 py-3 text-gray-300">{orgName}</td>
                    <td className="px-6 py-3 text-gray-300 capitalize">{r.transactionType ?? '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded border text-xs uppercase ${OUTCOME_BADGE[r.outcome] ?? ''}`}>
                        {r.outcome}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-300">{formatAUD(r.amountCents)}</td>
                    <td className="px-6 py-3 text-gray-300">{r.authCode ?? '—'}</td>
                    <td className="px-6 py-3 text-gray-300">{r.cardType ?? '—'}{r.maskedPan ? ` ${r.maskedPan}` : ''}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{r.referenceId ?? '—'}</td>
                  </tr>
                );
              })
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
            className="px-3 py-1 border border-[#1e1e2e] text-gray-300 rounded disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={offset + rows.length >= totalCount}
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1 border border-[#1e1e2e] text-gray-300 rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedId(null)}>
          <div
            className="bg-[#111118] border border-[#1e1e2e] rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Transaction detail</h2>
                <p className="text-xs text-gray-500 mt-1">{selected.id}</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-white">Close</button>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><dt className="text-xs text-gray-500">Merchant</dt><dd className="text-gray-200">{orgs[selected.orgId] ?? selected.orgId}</dd></div>
              <div><dt className="text-xs text-gray-500">When</dt><dd className="text-gray-200">{formatDate(selected.createdAt)}</dd></div>
              <div><dt className="text-xs text-gray-500">Type</dt><dd className="text-gray-200 capitalize">{selected.transactionType ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Outcome</dt><dd><span className={`px-2 py-0.5 rounded border text-xs ${OUTCOME_BADGE[selected.outcome] ?? ''}`}>{selected.outcome}</span></dd></div>
              <div><dt className="text-xs text-gray-500">Amount</dt><dd className="text-gray-200">{formatAUD(selected.amountCents)}</dd></div>
              <div><dt className="text-xs text-gray-500">Auth Code</dt><dd className="text-gray-200">{selected.authCode ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Card</dt><dd className="text-gray-200">{selected.cardType ?? '—'}{selected.maskedPan ? ` ${selected.maskedPan}` : ''}</dd></div>
              <div><dt className="text-xs text-gray-500">Transaction Ref</dt><dd className="text-gray-200 break-all">{selected.transactionRef ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">RRN</dt><dd className="text-gray-200">{selected.rrn ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Reference</dt><dd className="text-gray-200">{selected.referenceId ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Duration</dt><dd className="text-gray-200">{selected.durationMs ? `${selected.durationMs} ms` : '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Device</dt><dd className="text-gray-200 break-all">{selected.deviceId ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Location</dt><dd className="text-gray-200 break-all">{selected.locationId ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Order</dt><dd className="text-gray-200 break-all">{selected.orderId ?? '—'}</dd></div>
            </dl>

            {selected.outcome !== 'approved' && (
              <div className="mb-4 border border-red-500/30 rounded p-3 bg-red-500/10">
                <h3 className="text-sm font-semibold text-red-400 mb-2">Failure detail</h3>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-gray-500">Category</dt><dd className="text-red-300">{selected.errorCategory ?? '—'}</dd></div>
                  <div><dt className="text-gray-500">Code</dt><dd className="text-red-300">{selected.errorCode ?? '—'}</dd></div>
                  <div><dt className="text-gray-500">Step</dt><dd className="text-red-300">{selected.errorStep ?? '—'}</dd></div>
                  <div className="col-span-2"><dt className="text-gray-500">Message</dt><dd className="text-red-300">{selected.errorMessage ?? '—'}</dd></div>
                </dl>
              </div>
            )}

            {selected.merchantReceipt && (
              <details className="mb-3">
                <summary className="text-sm font-semibold cursor-pointer text-gray-300">Merchant receipt</summary>
                <pre className="mt-2 text-xs bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3 whitespace-pre-wrap text-gray-300">{selected.merchantReceipt}</pre>
              </details>
            )}
            {selected.customerReceipt && (
              <details className="mb-3">
                <summary className="text-sm font-semibold cursor-pointer text-gray-300">Customer receipt</summary>
                <pre className="mt-2 text-xs bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3 whitespace-pre-wrap text-gray-300">{selected.customerReceipt}</pre>
              </details>
            )}
            <details>
              <summary className="text-sm font-semibold cursor-pointer text-gray-300">Raw bridge JSON</summary>
              <pre className="mt-2 text-xs bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3 overflow-x-auto text-gray-300">{JSON.stringify(selected.raw, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
