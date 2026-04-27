'use client';

/**
 * Godmode Logs (unified) — v2.7.48-univlog
 * ================================================================
 * Replaces /terminal-logs with a two-tab view:
 *   • Transactions — every payment attempt across every provider
 *     (anz / tyro / stripe / cash / gift_card / layby / split / qr).
 *   • Activity     — every server mutation captured by the
 *     @nexus/fastify-audit plugin registered in each backend service.
 *
 * Both tabs filter by merchant + date range. Activity additionally
 * filters by actor, action, and entity_type. JSON / CSV export per
 * tab.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { platformFetch } from '@/lib/api';

type Tab = 'transactions' | 'activity';

// ── Transaction types (matches services/orders terminal_transactions) ─────────

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
  transactionType: string | null;
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

// ── Audit types (matches services/auth system_audit_logs) ─────────────────────

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

interface OrgRef { id: string; name: string }

// ── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_OPTIONS = [
  { value: '', label: 'All providers' },
  { value: 'anz', label: 'ANZ Worldline' },
  { value: 'tyro', label: 'Tyro' },
  { value: 'stripe', label: 'Stripe Terminal' },
  { value: 'cash', label: 'Cash' },
  { value: 'gift_card', label: 'Gift card' },
  { value: 'layby', label: 'Layby' },
  { value: 'split', label: 'Split' },
  { value: 'qr', label: 'QR' },
  { value: 'card', label: 'Card (kiosk fallback)' },
];

const OUTCOME_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'error', label: 'Error' },
  { value: 'timeout', label: 'Timeout' },
];

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
  { value: 'godmode_staff', label: 'Godmode staff' },
  { value: 'system', label: 'System' },
  { value: 'customer', label: 'Customer' },
];

const OUTCOME_BADGE: Record<string, string> = {
  approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  declined: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  error: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  timeout: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  update: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  delete: 'bg-red-500/20 text-red-400 border-red-500/30',
  login: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  logout: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  auth_fail: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

function formatAUD(cents: number | null): string {
  if (cents === null) return '—';
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-AU');
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GodmodeLogsPage() {
  const [tab, setTab] = useState<Tab>('transactions');

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Logs</h1>
        <p className="text-gray-500 text-sm mt-1">
          Cross-org audit trail. Transactions = every payment attempt; Activity = every server mutation.
        </p>
      </div>

      <div className="flex border-b border-[#1e1e2e] mb-6">
        <TabButton active={tab === 'transactions'} onClick={() => setTab('transactions')}>
          Transactions
        </TabButton>
        <TabButton active={tab === 'activity'} onClick={() => setTab('activity')}>
          Activity
        </TabButton>
      </div>

      {tab === 'transactions' ? <TransactionsTab /> : <ActivityTab />}
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-indigo-500 text-white'
          : 'border-transparent text-gray-500 hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

// ── Transactions tab ──────────────────────────────────────────────────────────

function TransactionsTab() {
  const [rows, setRows] = useState<TerminalTx[]>([]);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TerminalTx | null>(null);

  const [orgId, setOrgId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [provider, setProvider] = useState('');
  const [outcome, setOutcome] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (orgId) params.set('orgId', orgId);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    if (provider) params.set('provider', provider);
    if (outcome) params.set('outcome', outcome);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
  }, [orgId, from, to, provider, outcome, offset]);

  useEffect(() => {
    void (async () => {
      try {
        const data = (await platformFetch('platform/organisations?limit=200')) as { data?: OrgRef[] };
        const map: Record<string, string> = {};
        for (const o of data.data ?? []) map[o.id] = o.name;
        setOrgs(map);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = (await platformFetch(`godmode/terminal/transactions?${queryString}`)) as {
        data: TerminalTx[]; meta: { totalCount: number };
      };
      setRows(data.data ?? []);
      setTotalCount(data.meta?.totalCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions.');
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { void load(); }, [load]);

  const onExport = (format: 'json' | 'csv' | 'timapi') => {
    const params = new URLSearchParams(queryString);
    params.delete('limit'); params.delete('offset');
    params.set('format', format);
    window.location.href = `/api/proxy/godmode/terminal/transactions/export?${params.toString()}`;
  };

  return (
    <>
      <div className="flex items-end justify-end gap-2 mb-4">
        <button onClick={() => onExport('json')} className="px-3 py-2 text-sm border border-[#1e1e2e] text-gray-300 rounded hover:bg-[#1e1e2e]">
          Export JSON
        </button>
        <button onClick={() => onExport('csv')} className="px-3 py-2 text-sm border border-[#1e1e2e] text-gray-300 rounded hover:bg-[#1e1e2e]">
          Export CSV
        </button>
        <button
          onClick={() => onExport('timapi')}
          className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
          title="SIX/Worldline TimApi-format log file — ANZ certification submission format"
        >
          Export TIM API Log
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <FilterSelect label="Org" value={orgId} onChange={(v) => { setOrgId(v); setOffset(0); }}>
          <option value="">All orgs</option>
          {Object.entries(orgs).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </FilterSelect>
        <FilterDate label="From" value={from} onChange={(v) => { setFrom(v); setOffset(0); }} />
        <FilterDate label="To" value={to} onChange={(v) => { setTo(v); setOffset(0); }} />
        <FilterSelect label="Provider" value={provider} onChange={(v) => { setProvider(v); setOffset(0); }}>
          {PROVIDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>
        <FilterSelect label="Outcome" value={outcome} onChange={(v) => { setOutcome(v); setOffset(0); }}>
          {OUTCOME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>
      </div>

      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">When</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Merchant</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Provider</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Outcome</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Card</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-600">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-600">No transactions match these filters.</td></tr>
            ) : (
              rows.map((r) => {
                const orgName = orgs[r.orgId] ?? `${r.orgId.slice(0, 8)}…`;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-b border-[#1e1e2e] cursor-pointer hover:bg-[#1e1e2e]/30"
                  >
                    <td className="px-6 py-3 text-gray-300 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-6 py-3 text-gray-300">{orgName}</td>
                    <td className="px-6 py-3 text-gray-300 uppercase text-xs">{r.provider}</td>
                    <td className="px-6 py-3 text-gray-300 capitalize">{r.transactionType ?? '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded border text-xs uppercase ${OUTCOME_BADGE[r.outcome] ?? ''}`}>
                        {r.outcome}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-300">{formatAUD(r.amountCents)}</td>
                    <td className="px-6 py-3 text-gray-300">{r.cardType ?? '—'}{r.maskedPan ? ` ${r.maskedPan}` : ''}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Paginator offset={offset} setOffset={setOffset} limit={limit} count={rows.length} total={totalCount} />

      {selected && <TransactionDetailModal tx={selected} orgs={orgs} onClose={() => setSelected(null)} />}
    </>
  );
}

function TransactionDetailModal({
  tx, orgs, onClose,
}: { tx: TerminalTx; orgs: Record<string, string>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#111118] border border-[#1e1e2e] rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Transaction detail</h2>
            <p className="text-xs text-gray-500 mt-1">{tx.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">Close</button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
          <DetailField label="Merchant" value={orgs[tx.orgId] ?? tx.orgId} />
          <DetailField label="When" value={formatDate(tx.createdAt)} />
          <DetailField label="Provider" value={tx.provider.toUpperCase()} />
          <DetailField label="Type" value={tx.transactionType ?? '—'} />
          <DetailField label="Outcome" value={tx.outcome} />
          <DetailField label="Amount" value={formatAUD(tx.amountCents)} />
          <DetailField label="Auth Code" value={tx.authCode ?? '—'} />
          <DetailField label="Card" value={`${tx.cardType ?? '—'}${tx.maskedPan ? ' ' + tx.maskedPan : ''}`} />
          <DetailField label="Transaction Ref" value={tx.transactionRef ?? '—'} />
          <DetailField label="RRN" value={tx.rrn ?? '—'} />
        </dl>
        {tx.outcome !== 'approved' && (
          <div className="mb-4 border border-red-500/30 rounded p-3 bg-red-500/10">
            <h3 className="text-sm font-semibold text-red-400 mb-2">Failure detail</h3>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <DetailField label="Category" value={tx.errorCategory ?? '—'} />
              <DetailField label="Code" value={tx.errorCode ?? '—'} />
              <DetailField label="Step" value={tx.errorStep ?? '—'} />
              <div className="col-span-2"><dt className="text-gray-500">Message</dt><dd className="text-red-300">{tx.errorMessage ?? '—'}</dd></div>
            </dl>
          </div>
        )}
        {tx.merchantReceipt && (
          <details className="mb-3">
            <summary className="text-sm font-semibold cursor-pointer text-gray-300">Merchant receipt</summary>
            <pre className="mt-2 text-xs bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3 whitespace-pre-wrap text-gray-300">{tx.merchantReceipt}</pre>
          </details>
        )}
        {tx.customerReceipt && (
          <details className="mb-3">
            <summary className="text-sm font-semibold cursor-pointer text-gray-300">Customer receipt</summary>
            <pre className="mt-2 text-xs bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3 whitespace-pre-wrap text-gray-300">{tx.customerReceipt}</pre>
          </details>
        )}
        <details>
          <summary className="text-sm font-semibold cursor-pointer text-gray-300">Raw bridge JSON</summary>
          <pre className="mt-2 text-xs bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3 overflow-x-auto text-gray-300">{JSON.stringify(tx.raw, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

// ── Activity tab ──────────────────────────────────────────────────────────────

function ActivityTab() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const [orgId, setOrgId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actorType, setActorType] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (orgId) params.set('orgId', orgId);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    if (actorType) params.set('actorType', actorType);
    if (action) params.set('action', action);
    if (entityType) params.set('entityType', entityType);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
  }, [orgId, from, to, actorType, action, entityType, offset]);

  useEffect(() => {
    void (async () => {
      try {
        const data = (await platformFetch('platform/organisations?limit=200')) as { data?: OrgRef[] };
        const map: Record<string, string> = {};
        for (const o of data.data ?? []) map[o.id] = o.name;
        setOrgs(map);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = (await platformFetch(`godmode/audit-logs?${queryString}`)) as {
        data: AuditLog[]; meta: { totalCount: number };
      };
      setRows(data.data ?? []);
      setTotalCount(data.meta?.totalCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity.');
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { void load(); }, [load]);

  const onExport = (format: 'json' | 'csv') => {
    const params = new URLSearchParams(queryString);
    params.delete('limit'); params.delete('offset');
    params.set('format', format);
    window.location.href = `/api/proxy/godmode/audit-logs/export?${params.toString()}`;
  };

  return (
    <>
      <div className="flex items-end justify-end gap-2 mb-4">
        <button onClick={() => onExport('json')} className="px-3 py-2 text-sm border border-[#1e1e2e] text-gray-300 rounded hover:bg-[#1e1e2e]">
          Export JSON
        </button>
        <button onClick={() => onExport('csv')} className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded">
          Export CSV
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <FilterSelect label="Org" value={orgId} onChange={(v) => { setOrgId(v); setOffset(0); }}>
          <option value="">All orgs</option>
          {Object.entries(orgs).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </FilterSelect>
        <FilterDate label="From" value={from} onChange={(v) => { setFrom(v); setOffset(0); }} />
        <FilterDate label="To" value={to} onChange={(v) => { setTo(v); setOffset(0); }} />
        <FilterSelect label="Actor" value={actorType} onChange={(v) => { setActorType(v); setOffset(0); }}>
          {ACTOR_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>
        <FilterSelect label="Action" value={action} onChange={(v) => { setAction(v); setOffset(0); }}>
          {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Entity</label>
          <input
            type="text"
            placeholder="order, product, …"
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setOffset(0); }}
            className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">When</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Merchant</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Service</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Actor</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Action</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Entity</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Endpoint</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-600">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-600">No activity matches these filters.</td></tr>
            ) : (
              rows.map((r) => {
                const orgName = r.orgId ? (orgs[r.orgId] ?? `${r.orgId.slice(0, 8)}…`) : '—';
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-b border-[#1e1e2e] cursor-pointer hover:bg-[#1e1e2e]/30"
                  >
                    <td className="px-6 py-3 text-gray-300 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-6 py-3 text-gray-300">{orgName}</td>
                    <td className="px-6 py-3 text-gray-300 text-xs">{r.service ?? '—'}</td>
                    <td className="px-6 py-3 text-gray-300">
                      <span className="text-xs text-gray-500">{r.actorType}</span>
                      <br />
                      <span>{r.actorName ?? '—'}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded border text-xs uppercase ${ACTION_BADGE[r.action] ?? ''}`}>
                        {r.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-300">
                      <span>{r.entityType}</span>
                      {r.entityName && <><br /><span className="text-xs text-gray-500">{r.entityName}</span></>}
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs truncate max-w-[200px]">{r.endpoint ?? '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Paginator offset={offset} setOffset={setOffset} limit={limit} count={rows.length} total={totalCount} />

      {selected && <ActivityDetailModal log={selected} orgs={orgs} onClose={() => setSelected(null)} />}
    </>
  );
}

function ActivityDetailModal({
  log, orgs, onClose,
}: { log: AuditLog; orgs: Record<string, string>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#111118] border border-[#1e1e2e] rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Activity detail</h2>
            <p className="text-xs text-gray-500 mt-1">{log.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">Close</button>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
          <DetailField label="Merchant" value={log.orgId ? (orgs[log.orgId] ?? log.orgId) : '—'} />
          <DetailField label="When" value={formatDate(log.createdAt)} />
          <DetailField label="Service" value={log.service ?? '—'} />
          <DetailField label="Actor" value={`${log.actorType}${log.actorName ? ` — ${log.actorName}` : ''}`} />
          <DetailField label="Action" value={log.action} />
          <DetailField label="Entity" value={`${log.entityType}${log.entityName ? ` — ${log.entityName}` : ''}`} />
          <DetailField label="Method" value={log.method ?? '—'} />
          <DetailField label="Status" value={log.statusCode ?? '—'} />
          <div className="col-span-2"><dt className="text-xs text-gray-500">Endpoint</dt><dd className="text-gray-200 break-all">{log.endpoint ?? '—'}</dd></div>
          <DetailField label="IP" value={log.ipAddress ?? '—'} />
          <DetailField label="User Agent" value={log.userAgent ?? '—'} />
          <DetailField label="Entity ID" value={log.entityId ?? '—'} />
          <DetailField label="Actor ID" value={log.actorId ?? '—'} />
        </dl>

        {log.notes && (
          <div className="mb-4 text-sm">
            <dt className="text-xs text-gray-500">Notes</dt>
            <dd className="text-gray-300">{log.notes}</dd>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Before</h3>
            <pre className="text-xs bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3 overflow-x-auto text-gray-300 max-h-96 overflow-y-auto">
              {log.beforeJson ? JSON.stringify(log.beforeJson, null, 2) : '— (not captured)'}
            </pre>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-2">After</h3>
            <pre className="text-xs bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3 overflow-x-auto text-gray-300 max-h-96 overflow-y-auto">
              {log.afterJson ? JSON.stringify(log.afterJson, null, 2) : '— (not captured)'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function FilterSelect({
  label, value, onChange, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
      >
        {children}
      </select>
    </div>
  );
}

function FilterDate({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
      />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-200 break-all">{value}</dd>
    </div>
  );
}

function Paginator({
  offset, setOffset, limit, count, total,
}: { offset: number; setOffset: (n: number) => void; limit: number; count: number; total: number }) {
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
      <span>
        {total === 0
          ? 'No results'
          : `Showing ${offset + 1}–${Math.min(offset + count, total)} of ${total}`}
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
          disabled={offset + count >= total}
          onClick={() => setOffset(offset + limit)}
          className="px-3 py-1 border border-[#1e1e2e] text-gray-300 rounded disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
