'use client';

/**
 * Terminal Logs — v2.7.48
 * ================================================================
 * Per-merchant view of every ANZ Worldline TIM API interaction. Built
 * for ANZ certification submission (cert evidence requires merchants
 * to download a full transaction log alongside test videos and
 * receipts) and ongoing operations (cardholder dispute resolution).
 *
 * Filters: date range, outcome, transaction type, device, location.
 * Detail panel shows full receipts + raw bridge JSON for forensic
 * replay. Export button streams the current filtered set as JSON or
 * CSV via the orders-service `/export` endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

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
  timCapabilities: unknown;
  raw: unknown;
  createdAt: string;
}

interface ListResponse {
  data: TerminalTx[];
  meta: { totalCount: number; hasMore: boolean; limit: number; offset: number };
}

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
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  declined: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  error: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  timeout: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

function formatAUD(cents: number | null): string {
  if (cents === null) return '—';
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-AU');
}

export function TerminalLogsClient() {
  const { toast } = useToast();
  const [rows, setRows] = useState<TerminalTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filters
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [outcome, setOutcome] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [locationId, setLocationId] = useState('');
  const [deviceId, setDeviceId] = useState('');

  // Pagination
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    if (outcome) params.set('outcome', outcome);
    if (transactionType) params.set('transactionType', transactionType);
    if (locationId) params.set('locationId', locationId);
    if (deviceId) params.set('deviceId', deviceId);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
  }, [from, to, outcome, transactionType, locationId, deviceId, offset]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ListResponse>(`terminal-transactions?${queryString}`);
      setRows(data.data ?? []);
      setTotalCount(data.meta?.totalCount ?? 0);
    } catch (err) {
      console.error('[terminal-logs] load failed', err);
      toast({
        title: 'Failed to load',
        description: err instanceof Error ? err.message : 'Could not fetch terminal logs.',
        variant: 'destructive',
      });
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [queryString, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onApplyFilters = () => {
    setOffset(0);
  };

  const onResetFilters = () => {
    setFrom('');
    setTo('');
    setOutcome('');
    setTransactionType('');
    setLocationId('');
    setDeviceId('');
    setOffset(0);
  };

  const onExport = (format: 'json' | 'csv') => {
    // Reuse the same query string but swap pagination off (the export
    // endpoint caps server-side at 10k rows). The proxy adds the org
    // bearer cookie so the merchant only ever sees their own log.
    const params = new URLSearchParams(queryString);
    params.delete('limit');
    params.delete('offset');
    params.set('format', format);
    const url = `/api/proxy/terminal-transactions/export?${params.toString()}`;
    window.location.href = url;
  };

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Terminal Logs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            ANZ Worldline TIM API audit log — every transaction attempt, success or failure.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onExport('json')}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
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
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 dark:bg-gray-900 rounded"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 dark:bg-gray-900 rounded"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Outcome</label>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 dark:bg-gray-900 rounded"
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
            onChange={(e) => setTransactionType(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 dark:bg-gray-900 rounded"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Device ID</label>
          <input
            type="text"
            placeholder="UUID"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 dark:bg-gray-900 rounded"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Location ID</label>
          <input
            type="text"
            placeholder="UUID"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 dark:bg-gray-900 rounded"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={onApplyFilters}
          className="px-3 py-2 text-sm bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded"
        >
          Apply
        </button>
        <button
          onClick={onResetFilters}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded"
        >
          Reset
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">When</th>
              <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Type</th>
              <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Outcome</th>
              <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Amount</th>
              <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Auth</th>
              <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Card</th>
              <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Reference</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No transactions match these filters.</td></tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="border-t border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40"
                >
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300 capitalize">{r.transactionType ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs uppercase ${OUTCOME_BADGE[r.outcome] ?? ''}`}>
                      {r.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{formatAUD(r.amountCents)}</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{r.authCode ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                    {r.cardType ?? '—'}{r.maskedPan ? ` ${r.maskedPan}` : ''}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{r.referenceId ?? '—'}</td>
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
            className="px-3 py-1 border border-gray-300 dark:border-gray-700 rounded disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={offset + rows.length >= totalCount}
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1 border border-gray-300 dark:border-gray-700 rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSelectedId(null)}>
          <div
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Transaction detail</h2>
                <p className="text-xs text-gray-500 mt-1">{selected.id}</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                Close
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><dt className="text-xs text-gray-500">When</dt><dd className="text-gray-800 dark:text-gray-200">{formatDate(selected.createdAt)}</dd></div>
              <div><dt className="text-xs text-gray-500">Type</dt><dd className="text-gray-800 dark:text-gray-200 capitalize">{selected.transactionType ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Outcome</dt><dd><span className={`px-2 py-0.5 rounded text-xs ${OUTCOME_BADGE[selected.outcome] ?? ''}`}>{selected.outcome}</span></dd></div>
              <div><dt className="text-xs text-gray-500">Amount</dt><dd className="text-gray-800 dark:text-gray-200">{formatAUD(selected.amountCents)}</dd></div>
              <div><dt className="text-xs text-gray-500">Auth Code</dt><dd className="text-gray-800 dark:text-gray-200">{selected.authCode ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Card</dt><dd className="text-gray-800 dark:text-gray-200">{selected.cardType ?? '—'}{selected.maskedPan ? ` ${selected.maskedPan}` : ''}</dd></div>
              <div><dt className="text-xs text-gray-500">Transaction Ref</dt><dd className="text-gray-800 dark:text-gray-200 break-all">{selected.transactionRef ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">RRN</dt><dd className="text-gray-800 dark:text-gray-200">{selected.rrn ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Reference</dt><dd className="text-gray-800 dark:text-gray-200">{selected.referenceId ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Duration</dt><dd className="text-gray-800 dark:text-gray-200">{selected.durationMs ? `${selected.durationMs} ms` : '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Device</dt><dd className="text-gray-800 dark:text-gray-200 break-all">{selected.deviceId ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Location</dt><dd className="text-gray-800 dark:text-gray-200 break-all">{selected.locationId ?? '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Order</dt><dd className="text-gray-800 dark:text-gray-200 break-all">{selected.orderId ?? '—'}</dd></div>
            </dl>

            {selected.outcome !== 'approved' && (
              <div className="mb-4 border border-red-200 dark:border-red-900/40 rounded p-3 bg-red-50/40 dark:bg-red-900/10">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Failure detail</h3>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-gray-500">Category</dt><dd className="text-red-700 dark:text-red-300">{selected.errorCategory ?? '—'}</dd></div>
                  <div><dt className="text-gray-500">Code</dt><dd className="text-red-700 dark:text-red-300">{selected.errorCode ?? '—'}</dd></div>
                  <div><dt className="text-gray-500">Step</dt><dd className="text-red-700 dark:text-red-300">{selected.errorStep ?? '—'}</dd></div>
                  <div className="col-span-2"><dt className="text-gray-500">Message</dt><dd className="text-red-700 dark:text-red-300">{selected.errorMessage ?? '—'}</dd></div>
                </dl>
              </div>
            )}

            {selected.merchantReceipt && (
              <details className="mb-3">
                <summary className="text-sm font-semibold cursor-pointer text-gray-700 dark:text-gray-300">Merchant receipt</summary>
                <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 whitespace-pre-wrap">{selected.merchantReceipt}</pre>
              </details>
            )}
            {selected.customerReceipt && (
              <details className="mb-3">
                <summary className="text-sm font-semibold cursor-pointer text-gray-700 dark:text-gray-300">Customer receipt</summary>
                <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 whitespace-pre-wrap">{selected.customerReceipt}</pre>
              </details>
            )}
            <details>
              <summary className="text-sm font-semibold cursor-pointer text-gray-700 dark:text-gray-300">Raw bridge JSON</summary>
              <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-x-auto">{JSON.stringify(selected.raw, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
