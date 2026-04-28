'use client';

/**
 * Payment & Connect — consolidated payment settings hub.
 *
 * Replaces the previously scattered payment settings found in:
 *   - Settings → Payments
 *   - Integrations → Tyro EFTPOS / ANZ Worldline
 *   - Settings → Terminal
 *   - Payments → Stripe (this file, previously only Stripe Connect)
 *   - Payments → Stripe Terminal (previously payments/stripe/page.tsx)
 *
 * Tabs:
 *   Methods     — which payment types are enabled, per-method surcharge/rounding
 *   Terminals   — Tyro EFTPOS, ANZ Worldline, Stripe Terminal API keys
 *   Compliance  — AU EFTPOS surcharging rules, cash rounding, tipping
 *   Stripe      — Stripe Connect account onboarding & status
 *   Recovery    — ANZ Worldline crash-recovery for unresolved payment intents
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CreditCard, Save, RefreshCw, CheckCircle,
  AlertCircle, XCircle, Loader2, Info,
  Zap, Link2Off, DollarSign, Percent,
  Monitor, Trash2, Plus, Package, MapPin, Image, ShoppingCart,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { resolvePayment, type UnresolvedPayment } from '@/lib/payments';
import {
  runTimPairLifecycle,
  ANZ_DEFAULT_PORT,
  ANZ_DEFAULT_INTEGRATOR_ID,
} from '@/lib/payments/anz-pair-lifecycle';
import type { TyroConfig } from '@/lib/tyro-provider';

// ─── Shared primitives ────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';

const darkInputCls =
  'w-full rounded-lg border border-[#2a3a55] bg-[#0a1628] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none';

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'methods' | 'terminals' | 'compliance' | 'elevatedpay' | 'hardware' | 'recovery';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'methods',     label: 'Payment Methods', icon: '💳' },
  { id: 'terminals',   label: 'Terminals',        icon: '🖥️' },
  { id: 'compliance',  label: 'Compliance',       icon: '⚖️' },
  { id: 'elevatedpay', label: 'ElevatedPOS Pay',  icon: '🔗' },
  { id: 'hardware',    label: 'Card Readers',     icon: '📟' },
  { id: 'recovery',    label: 'Recovery',         icon: '🛡️' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1 — Payment Methods
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_METHODS = [
  { id: 'cash',     label: 'Cash',            description: 'Physical cash payments',              enabled: true,  surcharge: '',    rounding: '0.05' },
  { id: 'card',     label: 'Card (EFTPOS)',    description: 'Credit and debit card via terminal',  enabled: true,  surcharge: '1.5', rounding: '' },
  { id: 'giftcard', label: 'Gift Card',        description: 'ElevatedPOS-issued gift cards',       enabled: true,  surcharge: '',    rounding: '' },
  { id: 'account',  label: 'Account / Credit', description: 'Customer account credit',            enabled: false, surcharge: '',    rounding: '' },
  { id: 'layby',    label: 'Lay-by',           description: 'Pay over time with deposits',         enabled: false, surcharge: '',    rounding: '' },
  { id: 'bnpl',     label: 'BNPL',             description: 'Buy now, pay later (Afterpay, Zip)',  enabled: false, surcharge: '1.9', rounding: '' },
];

type Method = typeof DEFAULT_METHODS[number];

function MethodsTab() {
  const { toast } = useToast();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [methods, setMethods]   = useState<Method[]>(DEFAULT_METHODS);

  useEffect(() => {
    apiFetch<{ methods?: Method[] }>('settings/payment-methods')
      .then((data) => { if (data?.methods?.length) setMethods(data.methods); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle  = (id: string) => setMethods((ms) => ms.map((m) => m.id === id ? { ...m, enabled: !m.enabled } : m));
  const setField = (id: string, k: string, v: string) => setMethods((ms) => ms.map((m) => m.id === id ? { ...m, [k]: v } : m));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('settings/payment-methods', { method: 'PUT', body: JSON.stringify({ methods }) });
      toast({ title: 'Payment methods saved', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Enable or disable payment methods available at the POS. Configure surcharges and rounding per method.
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>

      {loading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))
      ) : (
        <div className="space-y-3">
          {methods.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border p-4 transition-colors ${
                m.enabled
                  ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-800 dark:bg-indigo-900/10'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <DollarSign className={`h-5 w-5 ${m.enabled ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{m.label}</p>
                    <p className="text-xs text-gray-500">{m.description}</p>
                  </div>
                </div>
                <Toggle checked={m.enabled} onChange={() => toggle(m.id)} />
              </div>

              {m.enabled && (
                <div className="mt-3 flex flex-wrap gap-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                  {(m.id === 'card' || m.id === 'bnpl') && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 dark:text-gray-400">Surcharge %:</label>
                      <input
                        className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        type="number" step="0.1" min="0"
                        value={m.surcharge}
                        onChange={(e) => setField(m.id, 'surcharge', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  )}
                  {m.id === 'cash' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 dark:text-gray-400">Cash rounding:</label>
                      <select
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        value={m.rounding}
                        onChange={(e) => setField(m.id, 'rounding', e.target.value)}
                      >
                        <option value="">None</option>
                        <option value="0.05">$0.05 intervals</option>
                        <option value="0.10">$0.10 intervals</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2 — Terminals
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Tyro ────────────────────────────────────────────────────────────────────

function TyroPanel() {
  const { toast } = useToast();
  const sanitise = (v: string) => /^[0-9-]*$/.test(v) ? v : v.replace(/[^0-9-]/g, '');

  const [loading, setLoading]           = useState(true);
  const [merchantId, setMerchantId]     = useState('');
  const [terminalId, setTerminalId]     = useState('');
  const [surcharge, setSurcharge]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [pairing, setPairing]           = useState(false);
  const [connected, setConnected]       = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{
          provider?: string;
          metadata?: { merchantId?: string; terminalId?: string; tyroHandlesSurcharge?: boolean };
        }>('terminal/credentials?provider=tyro');
        if (data.provider === 'tyro' && data.metadata) {
          setMerchantId(data.metadata.merchantId ?? '');
          setTerminalId(data.metadata.terminalId ?? '');
          setSurcharge(data.metadata.tyroHandlesSurcharge ?? false);
          setConnected(!!data.metadata.merchantId);
        }
      } catch { /* not configured yet */ }
      finally { setLoading(false); }
    })();
  }, []);

  async function handleSave() {
    if (!merchantId || !terminalId) {
      toast({ title: 'Merchant ID and Terminal ID are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('terminal/credentials', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'tyro',
          label: `Tyro Terminal ${terminalId}`,
          terminalIp: '',
          terminalPort: 0,
          metadata: { merchantId, terminalId, tyroHandlesSurcharge: surcharge },
        }),
      });
      setConnected(true);
      toast({ title: 'Tyro settings saved', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handlePair() {
    if (!merchantId || !terminalId) {
      toast({ title: 'Enter Merchant ID and Terminal ID first', variant: 'destructive' });
      return;
    }
    setPairing(true);
    try {
      const { loadTyroScript, pairTyroTerminal } = await import('@/lib/tyro-provider');
      const cfgRes = await fetch('/api/tyro/config');
      const cfgData = await cfgRes.json() as { apiKey?: string; testMode?: boolean };
      await loadTyroScript(cfgData.testMode ?? true);
      const result = await pairTyroTerminal({
        apiKey: cfgData.apiKey ?? '',
        merchantId,
        terminalId,
        testMode: cfgData.testMode ?? true,
        tyroHandlesSurcharge: surcharge,
      } satisfies TyroConfig);
      if (result.status === 'success' || result.status === 'PAIRED') {
        toast({ title: 'Tyro terminal paired', variant: 'success' });
      } else {
        toast({ title: 'Pairing failed', description: result.message ?? 'Unknown error', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Pairing error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setPairing(false);
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4 rounded-xl border border-[#1e2a40] bg-[#0f172a] p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Tyro EFTPOS</h3>
          <p className="text-xs text-gray-400">Browser-based integrated EFTPOS — no IP required</p>
        </div>
        {connected && (
          <span className="rounded-full bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-400">
            Connected
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-400">Merchant ID</label>
          <input
            id="tyro-mid" name="tyro-mid" type="text" inputMode="numeric"
            autoComplete="off" data-lpignore="true" data-1p-ignore="true"
            value={merchantId}
            onChange={(e) => setMerchantId(sanitise(e.target.value))}
            placeholder="e.g. 400012345"
            className={darkInputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Terminal ID</label>
          <input
            id="tyro-tid" name="tyro-tid" type="text" inputMode="numeric"
            autoComplete="off" data-lpignore="true" data-1p-ignore="true"
            value={terminalId}
            onChange={(e) => setTerminalId(sanitise(e.target.value))}
            placeholder="e.g. 1"
            className={darkInputCls}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
        <div>
          <p className="text-sm text-white">Tyro handles surcharging</p>
          <p className="text-xs text-gray-500">Let the terminal apply card surcharges (ACCC compliant)</p>
        </div>
        <Toggle checked={surcharge} onChange={setSurcharge} />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handlePair}
          disabled={pairing || !merchantId || !terminalId}
          className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-semibold text-gray-300 hover:border-white/30 hover:text-white disabled:opacity-50"
        >
          {pairing ? 'Pairing…' : 'Pair Terminal'}
        </button>
      </div>
    </div>
  );
}

// ─── ANZ Worldline ───────────────────────────────────────────────────────────
// runTimPairLifecycle + constants now live in @/lib/payments/anz-pair-lifecycle
// so the POS settings modal and this dashboard page share the same proven
// implementation. `DEFAULT_ANZ_PORT` in this file is aliased to the exported
// `ANZ_DEFAULT_PORT` for backwards compatibility with call sites below.

const DEFAULT_ANZ_PORT = ANZ_DEFAULT_PORT;

// ─── Shared: ANZ terminal row shape ───────────────────────────────────────────

interface AnzTerminalRow {
  id:           string;
  label:        string | null;
  terminalIp:   string;
  terminalPort: number;
  isActive:     boolean;
  metadata: {
    autoCommit?:            boolean;
    printMerchantReceipt?:  boolean;
    printCustomerReceipt?:  boolean;
  };
}

// ─── ANZ multi-terminal panel ─────────────────────────────────────────────────

function ANZPanel() {
  const { toast } = useToast();
  const [loading, setLoading]   = useState(true);
  const [terminals, setTerminals] = useState<AnzTerminalRow[]>([]);
  const [editing, setEditing]   = useState<AnzTerminalRow | 'new' | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadTerminals = useCallback(async () => {
    try {
      const res = await apiFetch<{
        data?: Array<{ id: string; provider: string; terminalIp?: string; terminalPort?: number; label?: string; isActive?: boolean; metadata?: Record<string, unknown> }>;
      }>('terminal/credentials');

      const anz = (res.data ?? [])
        .filter((c) => c.provider === 'anz' && c.isActive !== false && c.terminalIp)
        .map((c): AnzTerminalRow => {
          // Trust the stored port. SIXml-over-WebSocket defaults to 7784 for
          // real Castles terminals but the ANZ EftSimulator can be configured
          // to listen on any port (commonly 80 for its WebSocket mode). The
          // admin picks the port when they register the terminal — don't
          // silently rewrite their choice.
          const port = c.terminalPort && c.terminalPort > 0 ? c.terminalPort : DEFAULT_ANZ_PORT;
          const meta = (c.metadata ?? {}) as AnzTerminalRow['metadata'];
          return {
            id:           c.id,
            label:        c.label ?? null,
            terminalIp:   c.terminalIp!,
            terminalPort: port,
            isActive:     c.isActive !== false,
            metadata: {
              autoCommit:           Boolean(meta.autoCommit),
              printMerchantReceipt: Boolean(meta.printMerchantReceipt),
              printCustomerReceipt: Boolean(meta.printCustomerReceipt),
            },
          };
        });
      setTerminals(anz);
    } catch {
      setTerminals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTerminals(); }, [loadTerminals]);

  async function handleSave(draft: {
    id?: string;
    label: string;
    terminalIp: string;
    terminalPort: number;
    metadata: AnzTerminalRow['metadata'];
  }) {
    const payload = {
      ...(draft.id ? { id: draft.id } : {}),
      provider:     'anz' as const,
      terminalIp:   draft.terminalIp.trim(),
      terminalPort: draft.terminalPort,
      label:        draft.label.trim() || undefined,
      metadata:     draft.metadata,
    };
    try {
      await apiFetch('terminal/credentials', {
        method: 'POST',
        body:   JSON.stringify(payload),
      });
      toast({ title: draft.id ? 'Terminal updated' : 'Terminal added', variant: 'success' });
      setEditing(null);
      await loadTerminals();
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      await apiFetch(`terminal/credentials/${id}`, { method: 'DELETE' });
      toast({ title: 'Terminal removed' });
      await loadTerminals();
    } catch {
      toast({ title: 'Remove failed', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTest(row: AnzTerminalRow) {
    if (!row.terminalIp.trim()) {
      toast({ title: 'Enter a terminal IP address first', variant: 'destructive' });
      return;
    }

    setTestingId(row.id);
    try {
      const { viaBridge } = await runTimPairLifecycle(row.terminalIp.trim(), row.terminalPort || DEFAULT_ANZ_PORT);
      toast({
        title: 'Terminal reachable ✓',
        description: viaBridge
          ? `Pair flow completed via Hardware Bridge → ${row.terminalIp}:${row.terminalPort}`
          : `Pair flow completed (connect → login → activate) against ${row.terminalIp}:${row.terminalPort}`,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Connection failed',
        description: err instanceof Error ? err.message : 'Check IP and port',
        variant: 'destructive',
      });
    } finally {
      setTestingId(null);
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4 rounded-xl border border-[#1e2a40] bg-[#0f172a] p-5">
      {confirmDeleteId && (() => {
        const row = terminals.find((t) => t.id === confirmDeleteId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-2xl bg-[#0f172a] border border-[#1e2a40] p-6 max-w-sm w-full mx-4">
              <h3 className="font-bold text-white mb-2">Remove ANZ terminal?</h3>
              <p className="text-sm text-gray-400 mb-4">
                {row?.label
                  ? `"${row.label}" (${row.terminalIp}:${row.terminalPort}) will be removed.`
                  : `${row?.terminalIp}:${row?.terminalPort} will be removed.`}
                {' '}Registers currently using this terminal will fall back to the org default until reassigned.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDeleteId(null)} className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-300 hover:bg-white/5">Cancel</button>
                <button onClick={() => void handleDelete(confirmDeleteId)} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700">Remove</button>
              </div>
            </div>
          </div>
        );
      })()}

      {editing && (
        <AnzTerminalEditorModal
          initial={editing === 'new' ? null : editing}
          onSave={(draft) => void handleSave(draft)}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white">ANZ Worldline Terminals</h3>
          <p className="text-xs text-gray-400">
            TIM API (SIXml over WebSocket) — default port {DEFAULT_ANZ_PORT}. Set each terminal to ECR / Integrated mode.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Add Terminal
        </button>
      </div>

      {terminals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-gray-400 mb-2">No ANZ Worldline terminals configured.</p>
          <p className="text-xs text-gray-500">
            Click <span className="font-medium text-indigo-400">Add Terminal</span> to register your first Castles S1F2 or EftSimulator.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {terminals.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-900/30">
                  <CreditCard className="h-4 w-4 text-indigo-300" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {row.label || 'Unlabeled terminal'}
                  </p>
                  <p className="truncate font-mono text-xs text-gray-400">
                    {row.terminalIp}:{row.terminalPort}
                    {row.metadata.autoCommit && <span className="ml-2 text-amber-400">· auto-commit</span>}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => void handleTest(row)}
                  disabled={testingId === row.id}
                  className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:border-white/30 hover:text-white disabled:opacity-50"
                  title="Test Connection"
                >
                  {testingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Test
                </button>
                <button
                  onClick={() => setEditing(row)}
                  className="rounded-lg border border-white/10 p-1.5 text-gray-400 hover:border-white/30 hover:text-white"
                  title="Edit"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(row.id)}
                  disabled={deletingId === row.id}
                  className="rounded-lg border border-white/10 p-1.5 text-gray-400 hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                  title="Remove"
                >
                  {deletingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 rounded-xl border border-blue-800/30 bg-blue-900/10 p-3 text-xs text-blue-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Each register picks which terminal to use from{' '}
          <span className="font-medium">POS → Settings → ANZ Terminal</span>.
          Place <code className="rounded bg-blue-900/30 px-1">timapi.js</code> and{' '}
          <code className="rounded bg-blue-900/30 px-1">timapi.wasm</code> in{' '}
          <code className="rounded bg-blue-900/30 px-1">/public/timapi/</code> and set{' '}
          <code className="rounded bg-blue-900/30 px-1">ANZ_INTEGRATOR_ID</code> in your environment. Obtain from the{' '}
          <a href="https://start.portal.anzworldline-solutions.com.au/" target="_blank" rel="noopener noreferrer" className="underline">
            ANZ Worldline portal
          </a>.
        </p>
      </div>
    </div>
  );
}

// ─── ANZ terminal editor modal ────────────────────────────────────────────────

function AnzTerminalEditorModal({
  initial,
  onSave,
  onCancel,
}: {
  initial: AnzTerminalRow | null;
  onSave: (draft: {
    id?: string;
    label: string;
    terminalIp: string;
    terminalPort: number;
    metadata: AnzTerminalRow['metadata'];
  }) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [label,         setLabel]         = useState(initial?.label ?? '');
  const [terminalIp,    setTerminalIp]    = useState(initial?.terminalIp ?? '');
  const [terminalPort,  setTerminalPort]  = useState(String(initial?.terminalPort ?? DEFAULT_ANZ_PORT));
  const [autoCommit,    setAutoCommit]    = useState(initial?.metadata.autoCommit ?? false);
  const [printMerchant, setPrintMerchant] = useState(initial?.metadata.printMerchantReceipt ?? false);
  const [printCustomer, setPrintCustomer] = useState(initial?.metadata.printCustomerReceipt ?? false);
  const [saving,        setSaving]        = useState(false);

  const isEdit = initial != null;

  function submit() {
    if (!terminalIp.trim()) {
      toast({ title: 'Terminal IP is required', variant: 'destructive' });
      return;
    }
    const port = Number(terminalPort);
    if (!port || port < 1 || port > 65535) {
      toast({ title: 'Enter a valid port (1–65535)', variant: 'destructive' });
      return;
    }
    setSaving(true);
    onSave({
      ...(initial?.id ? { id: initial.id } : {}),
      label,
      terminalIp: terminalIp.trim(),
      terminalPort: port,
      metadata: {
        autoCommit,
        printMerchantReceipt: printMerchant,
        printCustomerReceipt: printCustomer,
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-[#1e2a40] bg-[#0f172a] p-6">
        <div>
          <h3 className="text-lg font-bold text-white">
            {isEdit ? 'Edit terminal' : 'Add ANZ terminal'}
          </h3>
          <p className="text-xs text-gray-400">
            {isEdit ? 'Update connection details for this terminal.' : 'Register a new Castles S1F2, EftSimulator, or other SIXml-compatible terminal.'}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-400">Terminal Label (optional)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Counter 1"
            className={darkInputCls}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs text-gray-400">Terminal IP Address *</label>
            <input
              value={terminalIp}
              onChange={(e) => setTerminalIp(e.target.value)}
              placeholder="192.168.1.100"
              className={darkInputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">SIXml Port</label>
            <input
              value={terminalPort}
              onChange={(e) => setTerminalPort(e.target.value)}
              placeholder={String(DEFAULT_ANZ_PORT)}
              type="number"
              className={darkInputCls}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={!autoCommit}
              onChange={(e) => setAutoCommit(!e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-indigo-500"
            />
            <div>
              <p className="text-sm font-medium text-white">Require explicit commit (recommended)</p>
              <p className="text-xs text-gray-500">Prevents duplicate charges if the POS crashes between authorization and completion.</p>
            </div>
          </label>
          <div className="border-t border-white/5 pt-2">
            <p className="mb-2 text-xs font-medium text-gray-400">Terminal receipt printing</p>
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={printMerchant}
                  onChange={(e) => setPrintMerchant(e.target.checked)}
                  className="h-4 w-4 rounded accent-indigo-500"
                />
                <span className="text-sm text-white">Print merchant receipt on terminal</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={printCustomer}
                  onChange={(e) => setPrintCustomer(e.target.checked)}
                  className="h-4 w-4 rounded accent-indigo-500"
                />
                <span className="text-sm text-white">Print customer receipt on terminal</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? 'Save' : 'Add Terminal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stripe Terminal ─────────────────────────────────────────────────────────

// ─── ElevatedPOS Pay Terminal (Tap to Pay via platform account) ───────────────

function ElevatedPOSTerminalPanel() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ enabled?: boolean }>('terminal/credentials?provider=tap-to-pay')
      .then((d) => { if (d.enabled !== undefined) setEnabled(d.enabled); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('terminal/credentials', {
        method: 'POST',
        body: JSON.stringify({ provider: 'tap-to-pay', enabled }),
      });
      toast({ title: enabled ? 'Tap to Pay enabled' : 'Tap to Pay disabled', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
          <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Tap to Pay</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            NFC contactless payments using the device&apos;s built-in reader
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3 dark:border-gray-800">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Tap to Pay</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Processes payments through your ElevatedPOS Pay account. No additional setup required once your account is active.
          </p>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>
    </div>
  );
}

function TerminalsTab() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Configure your EFTPOS terminals and payment processor credentials. Each terminal type is independent.
      </p>
      <TyroPanel />
      <ANZPanel />
      <ElevatedPOSTerminalPanel />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3 — Compliance
// ═══════════════════════════════════════════════════════════════════════════════

function ComplianceTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const [eftposSurchargeEnabled, setEftposSurchargeEnabled] = useState(false);
  const [surchargeType, setSurchargeType]   = useState<'percent' | 'fixed'>('percent');
  const [surchargeAmount, setSurchargeAmount] = useState('1.5');
  const [cashRoundingEnabled, setCashRoundingEnabled] = useState(true);
  const [tippingEnabled, setTippingEnabled] = useState(false);
  const [tipPercentages, setTipPercentages] = useState(['10', '15', '18']);
  const [customTipEnabled, setCustomTipEnabled] = useState(true);

  useEffect(() => {
    apiFetch<{
      eftposSurcharge?: { enabled: boolean; type: 'percent' | 'fixed'; amount: number };
      cashRounding?: { enabled: boolean };
      tipping?: { enabled: boolean; percentages: number[]; allowCustom: boolean };
    }>('settings/payments')
      .then((d) => {
        if (d.eftposSurcharge) {
          setEftposSurchargeEnabled(d.eftposSurcharge.enabled);
          setSurchargeType(d.eftposSurcharge.type ?? 'percent');
          setSurchargeAmount(String(d.eftposSurcharge.amount ?? 1.5));
        }
        if (d.cashRounding) setCashRoundingEnabled(d.cashRounding.enabled);
        if (d.tipping) {
          setTippingEnabled(d.tipping.enabled);
          if (d.tipping.percentages?.length) setTipPercentages(d.tipping.percentages.map(String));
          setCustomTipEnabled(d.tipping.allowCustom);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('settings/payments', {
        method: 'PUT',
        body: JSON.stringify({
          eftposSurcharge: { enabled: eftposSurchargeEnabled, type: surchargeType, amount: parseFloat(surchargeAmount) || 0 },
          cashRounding: { enabled: cashRoundingEnabled },
          tipping: { enabled: tippingEnabled, percentages: tipPercentages.map((p) => parseFloat(p) || 0), allowCustom: customTipEnabled },
        }),
      });
      toast({ title: 'Compliance settings saved', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Australian regulatory requirements for EFTPOS surcharging, cash rounding, and tipping.
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>

      {/* EFTPOS Surcharge */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">EFTPOS Surcharge</p>
            <p className="text-xs text-gray-500">Pass card processing fee to customers at checkout</p>
          </div>
          <Toggle checked={eftposSurchargeEnabled} onChange={setEftposSurchargeEnabled} />
        </div>

        {eftposSurchargeEnabled && (
          <div className="mt-4 space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Surcharge Type</label>
                <select className={inputCls} value={surchargeType} onChange={(e) => setSurchargeType(e.target.value as 'percent' | 'fixed')}>
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount ($)</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {surchargeType === 'percent' ? 'Amount (%)' : 'Amount ($)'}
                </label>
                <div className="relative">
                  <input
                    className={inputCls + (surchargeType === 'percent' ? ' pr-8' : ' pl-7')}
                    type="number" step="0.01" min="0"
                    value={surchargeAmount}
                    onChange={(e) => setSurchargeAmount(e.target.value)}
                    placeholder={surchargeType === 'percent' ? '1.5' : '0.50'}
                  />
                  {surchargeType === 'percent'
                    ? <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    : <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>
                  }
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
              <span className="mt-0.5 text-amber-500">⚠</span>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                ACCC regulations require surcharges to not exceed your actual card processing cost.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Cash Rounding */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Cash Rounding</p>
            <p className="text-xs text-gray-500">Round cash transactions to nearest $0.05 (required by Reserve Bank of Australia)</p>
          </div>
          <Toggle checked={cashRoundingEnabled} onChange={setCashRoundingEnabled} />
        </div>
        {cashRoundingEnabled && (
          <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500 dark:border-gray-800">
            Card and digital payments are not rounded — only cash.
          </p>
        )}
      </div>

      {/* Tipping */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Tipping Prompts</p>
            <p className="text-xs text-gray-500">Offer customers suggested tip amounts before payment</p>
          </div>
          <Toggle checked={tippingEnabled} onChange={setTippingEnabled} />
        </div>

        {tippingEnabled && (
          <div className="mt-4 space-y-4 border-t border-gray-100 pt-3 dark:border-gray-800">
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Suggested percentages</p>
              <div className="flex items-center gap-2">
                {tipPercentages.map((pct, idx) => (
                  <div key={idx} className="relative">
                    <input
                      className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 pr-7 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      type="number" min="0" max="100"
                      value={pct}
                      onChange={(e) => {
                        const next = [...tipPercentages];
                        next[idx] = e.target.value;
                        setTipPercentages(next);
                      }}
                    />
                    <Percent className="absolute right-2 top-2 h-3.5 w-3.5 text-gray-400" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow custom tip amount</p>
                <p className="text-xs text-gray-500">Let customers enter any tip amount</p>
              </div>
              <Toggle checked={customTipEnabled} onChange={setCustomTipEnabled} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 4 — ElevatedPOS Pay (white-labelled payments hub)
// Uses Stripe Connect Embedded Components — no Stripe branding in surrounding UI
// ═══════════════════════════════════════════════════════════════════════════════

interface ConnectAccount {
  stripeAccountId: string;
  status: 'pending' | 'onboarding' | 'active' | 'restricted' | 'disabled';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  businessName?: string;
  platformFeePercent: number;
}

const STATUS_COLORS: Record<string, string> = {
  active:     'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  onboarding: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  restricted: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  pending:    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  disabled:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

type ElevatedPaySubTab = 'onboarding' | 'transactions' | 'payouts' | 'balance' | 'account' | 'reports' | 'financing';

function ElevatedPOSPayTab() {
  const { toast } = useToast();
  const [account, setAccount]       = useState<ConnectAccount | null>(null);
  const [loading, setLoading]       = useState(true);
  const [subTab, setSubTab]         = useState<ElevatedPaySubTab>('onboarding');
  const [instanceReady, setInstanceReady] = useState(false);

  // v2.7.59 — `handleCompleteSetup` and the `syncing` state were removed
  // along with the legacy yellow "Action required" banner. They drove a
  // redirect to connect.stripe.com via `connect/sync-account`, which took
  // the merchant out of the dashboard. The embedded `account_onboarding`
  // component below handles the same fields inline, keeping the
  // experience white-labelled. The server-side `connect/sync-account`
  // endpoint is intentionally left in place until we're sure no other
  // surface (mobile, godmode, partner-portal) calls it.

  // Refs for Stripe Connect Embedded Component mount points
  const notifBannerRef   = useRef<HTMLDivElement>(null);
  const onboardingRef    = useRef<HTMLDivElement>(null);
  const transactionsRef  = useRef<HTMLDivElement>(null);
  const payoutsRef       = useRef<HTMLDivElement>(null);
  const balanceRef       = useRef<HTMLDivElement>(null);
  const accountRef       = useRef<HTMLDivElement>(null);
  const reportsRef       = useRef<HTMLDivElement>(null);
  const financingRef     = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeInstanceRef = useRef<any>(null);

  // Fetch account status
  useEffect(() => {
    apiFetch<ConnectAccount | null>('connect/account-status')
      .then((data) => setAccount(data))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, []);

  // Initialise Stripe Connect Embedded Components once account is known
  useEffect(() => {
    if (loading) return;

    async function init() {
      try {
        const { loadConnectAndInitialize } = await import('@stripe/connect-js');

        const instance = loadConnectAndInitialize({
          publishableKey: process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? '',
          fetchClientSecret: async () => {
            const data = await apiFetch<{ clientSecret: string }>('connect/account-session', { method: 'POST' });
            return data.clientSecret;
          },
          appearance: {
            overlays: 'dialog',
            variables: {
              colorPrimary: '#6366f1',
              colorBackground: '#ffffff',
              colorText: '#111827',
              fontFamily: 'Inter, system-ui, sans-serif',
              borderRadius: '8px',
            },
          },
        });

        stripeInstanceRef.current = instance;
        setInstanceReady(true);
      } catch (err) {
        console.error('Failed to initialise ElevatedPOS Pay:', err);
        toast({ title: 'Could not initialise payment components', variant: 'destructive' });
      }
    }

    void init();
  }, [loading, toast]);

  // Mount notification-banner once — always visible at top regardless of sub-tab
  useEffect(() => {
    const instance = stripeInstanceRef.current;
    if (!instance || !instanceReady) return;
    const el = notifBannerRef.current;
    if (!el || el.childElementCount > 0) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const banner = (instance as any).create('notification-banner');
      banner.mount(el);
    } catch (e) {
      console.warn('Failed to mount notification-banner:', e);
    }
  }, [instanceReady]);

  // Mount the correct component when instance is ready or subTab changes
  useEffect(() => {
    const instance = stripeInstanceRef.current;
    if (!instance || !instanceReady) return;

    const pairs: [ElevatedPaySubTab, React.RefObject<HTMLDivElement>, string][] = [
      ['onboarding',   onboardingRef,   'account-onboarding'],
      ['transactions', transactionsRef, 'payments'],
      ['payouts',      payoutsRef,      'payouts'],
      ['balance',      balanceRef,      'balances'],
      ['account',      accountRef,      'account-management'],
      ['reports',      reportsRef,      'reporting-chart'],
      ['financing',    financingRef,    'capital-overview'],
    ];

    for (const [tab, ref, componentName] of pairs) {
      const el = ref.current;
      if (!el) continue;
      if (tab !== subTab) {
        // Clear inactive mount points so they re-mount fresh on next visit
        el.innerHTML = '';
        continue;
      }
      if (el.childElementCount > 0) continue; // already mounted
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const component = (instance as any).create(componentName);
        component.mount(el);
      } catch (e) {
        console.warn(`Failed to mount ${componentName}:`, e);
      }
    }
  }, [instanceReady, subTab]);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48" />
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
    </div>
  );

  const isActive = account?.chargesEnabled && account?.status === 'active';

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-xl">🔗</span> ElevatedPOS Pay
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Accept payments, manage payouts, and monitor your balance — all in one place.
          </p>
        </div>
        {account && (
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${STATUS_COLORS[account.status] ?? ''}`}>
            {account.status === 'onboarding' ? 'Setup required' : account.status}
          </span>
        )}
      </div>

      {/* No account yet — prompt to set up */}
      {!account && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center max-w-lg dark:border-gray-800 dark:bg-gray-900">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">💳</span>
          </div>
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Activate ElevatedPOS Pay</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm leading-relaxed">
            Set up your payment account to accept card payments, receive payouts directly to your bank, and access detailed transaction history.
          </p>
          <div
            ref={onboardingRef}
            className="min-h-[400px]"
          />
          {!instanceReady && (
            <div className="flex items-center justify-center gap-2 text-gray-400 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading setup form…</span>
            </div>
          )}
        </div>
      )}

      {/* Notification banner — always mounted when Stripe instance is ready (shows pending action alerts) */}
      {account && instanceReady && (
        <div ref={notifBannerRef} className="min-h-[0px]" />
      )}

      {/* Account exists — show sub-tabs */}
      {account && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: account.chargesEnabled ? '✅' : '⏳', label: 'Payments',   sub: account.chargesEnabled ? 'Active' : 'Pending setup' },
              { icon: account.payoutsEnabled ? '✅' : '⏳', label: 'Payouts',    sub: account.payoutsEnabled ? 'Active' : 'Pending setup' },
              { icon: '💰',                                  label: 'Platform fee', sub: `${(account.platformFeePercent ?? 0) / 100}% per transaction` },
            ].map((item) => (
              <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl mb-1">{item.icon}</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-gray-500">{item.sub}</p>
              </div>
            ))}
          </div>

          {/*
            v2.7.59 — removed the legacy "Action required" yellow banner that
            redirected to connect.stripe.com via `handleCompleteSetup`. That
            path took the merchant out of the dashboard for the rest of
            their setup, defeating the whole point of using Stripe Connect
            Embedded Components. The embedded `account_onboarding`
            component mounted further down (driven by the 'onboarding'
            sub-tab, which is the default for new accounts) handles the
            same fields — business type, ABN, bank account, owner
            details, terms acceptance — entirely inside the dashboard.
            Stripe's embedded `notification_banner` component (mounted
            above the sub-tabs when the instance is ready) surfaces any
            action-required alerts in-page without a redirect.

            `handleCompleteSetup` and the `connect/sync-account` endpoint
            it calls are intentionally left in place for now; they can be
            removed in a follow-up commit once we're confident no other
            code path exercises them.
          */}

          {/* Sub-tab bar — only show extra tabs when active */}
          <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800 w-fit">
            {(account.status === 'onboarding' || !isActive) && (
              <button
                onClick={() => setSubTab('onboarding')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${subTab === 'onboarding' ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
              >
                Setup
              </button>
            )}
            {isActive && (
              <>
                <button
                  onClick={() => setSubTab('transactions')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${subTab === 'transactions' ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                >
                  Transactions
                </button>
                <button
                  onClick={() => setSubTab('payouts')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${subTab === 'payouts' ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                >
                  Payouts
                </button>
                <button
                  onClick={() => setSubTab('balance')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${subTab === 'balance' ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                >
                  Balance
                </button>
                <button
                  onClick={() => setSubTab('account')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${subTab === 'account' ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                >
                  Account
                </button>
                <button
                  onClick={() => setSubTab('reports')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${subTab === 'reports' ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                >
                  Reports
                </button>
                <button
                  onClick={() => setSubTab('financing')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${subTab === 'financing' ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                >
                  Financing
                </button>
              </>
            )}
          </div>

          {/* Embedded component mount points */}
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
            {!instanceReady ? (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-16">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : (
              <>
                <div ref={onboardingRef}   className={subTab === 'onboarding'   ? 'min-h-[500px]' : 'hidden'} />
                <div ref={transactionsRef} className={subTab === 'transactions' ? 'min-h-[500px]' : 'hidden'} />
                <div ref={payoutsRef}      className={subTab === 'payouts'      ? 'min-h-[500px]' : 'hidden'} />
                <div ref={balanceRef}      className={subTab === 'balance'      ? 'min-h-[500px]' : 'hidden'} />
                <div ref={accountRef}      className={subTab === 'account'      ? 'min-h-[500px]' : 'hidden'} />
                <div ref={reportsRef}      className={subTab === 'reports'      ? 'min-h-[500px]' : 'hidden'} />
                <div ref={financingRef}    className={subTab === 'financing'    ? 'min-h-[500px]' : 'hidden'} />
              </>
            )}
          </div>

          {/* Quick links */}
          {isActive && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { href: '/dashboard/subscriptions', icon: '🔄', label: 'Subscriptions', sub: 'Manage recurring billing' },
                { href: '/dashboard/invoices',       icon: '🧾', label: 'Invoices',      sub: 'Send invoices to customers' },
                { href: '/dashboard/catalog',        icon: '🛍️', label: 'Web Store',    sub: 'Manage online store products' },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-2xl border border-gray-200 bg-white p-5 hover:border-indigo-300 hover:shadow-sm transition-all dark:border-gray-800 dark:bg-gray-900 dark:hover:border-indigo-700 group"
                >
                  <div className="text-2xl mb-3">{link.icon}</div>
                  <h3 className="font-semibold mb-1 text-gray-900 dark:text-white group-hover:text-indigo-600">{link.label}</h3>
                  <p className="text-sm text-gray-500">{link.sub}</p>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 5 — Card Readers (Stripe Terminal hardware management)
// ═══════════════════════════════════════════════════════════════════════════════

interface StripeReader {
  id: string;
  object: 'terminal.reader';
  label: string;
  status: 'online' | 'offline';
  device_type: string;
  serial_number: string;
  location?: string | null;
  ip_address?: string | null;
  base_url?: string | null;
}

interface StripeLocation {
  id: string;
  display_name: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  image: string;
  features: string[];
  available: boolean;
}

function HardwareTab() {
  const { toast } = useToast();

  // ── Readers ────────────────────────────────────────────────────────────────
  const [readers, setReaders]         = useState<StripeReader[]>([]);
  const [readersLoading, setRLoading] = useState(true);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  // Register form
  const [showRegister, setShowRegister]     = useState(false);
  const [regCode, setRegCode]               = useState('');
  const [regLabel, setRegLabel]             = useState('');
  const [regLocation, setRegLocation]       = useState('');
  const [registering, setRegistering]       = useState(false);

  // ── Locations ──────────────────────────────────────────────────────────────
  const [locations, setLocations]           = useState<StripeLocation[]>([]);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocName, setNewLocName]           = useState('');
  const [newLocLine1, setNewLocLine1]         = useState('');
  const [newLocCity, setNewLocCity]           = useState('');
  const [newLocState, setNewLocState]         = useState('');
  const [newLocPostal, setNewLocPostal]       = useState('');
  const [newLocCountry, setNewLocCountry]     = useState('AU');
  const [savingLocation, setSavingLocation]   = useState(false);

  // ── Splash screen ──────────────────────────────────────────────────────────
  const [splashUrl, setSplashUrl]         = useState('');
  const [currentSplash, setCurrentSplash] = useState<string | null>(null);
  const [savingSplash, setSavingSplash]   = useState(false);

  // ── Catalog & orders ───────────────────────────────────────────────────────
  const [catalog, setCatalog]         = useState<CatalogItem[]>([]);
  const [catalogLoading, setCLoading] = useState(true);
  const [cart, setCart]               = useState<Record<string, number>>({});
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderName, setOrderName]     = useState('');
  const [orderEmail, setOrderEmail]   = useState('');
  const [orderPhone, setOrderPhone]   = useState('');
  const [orderLine1, setOrderLine1]   = useState('');
  const [orderCity, setOrderCity]     = useState('');
  const [orderState, setOrderState]   = useState('');
  const [orderPostal, setOrderPostal] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);

  // ── Active panel ───────────────────────────────────────────────────────────
  const [panel, setPanel] = useState<'readers' | 'catalog' | 'branding'>('readers');

  const loadReaders = useCallback(async () => {
    setRLoading(true);
    try {
      const data = await apiFetch<{ readers: StripeReader[] }>('connect/terminal/readers');
      setReaders(data.readers ?? []);
    } catch { setReaders([]); }
    finally { setRLoading(false); }
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      const data = await apiFetch<{ locations: StripeLocation[] }>('connect/terminal/locations');
      setLocations(data.locations ?? []);
    } catch { setLocations([]); }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCLoading(true);
    try {
      const data = await apiFetch<{ catalog: CatalogItem[] }>('connect/hardware/catalog');
      setCatalog(data.catalog ?? []);
    } catch { setCatalog([]); }
    finally { setCLoading(false); }
  }, []);

  const loadSplash = useCallback(async () => {
    try {
      const data = await apiFetch<{ config: { splashscreen?: { landscape_url?: string } } | null }>('connect/terminal/config');
      setCurrentSplash(data.config?.splashscreen?.landscape_url ?? null);
      setSplashUrl(data.config?.splashscreen?.landscape_url ?? '');
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    void loadReaders();
    void loadLocations();
    void loadCatalog();
    void loadSplash();
  }, [loadReaders, loadLocations, loadCatalog, loadSplash]);

  const handleDeleteReader = async (id: string) => {
    if (!confirm('Remove this reader from your account?')) return;
    setDeletingId(id);
    try {
      await apiFetch(`connect/terminal/readers/${id}`, { method: 'DELETE' });
      toast({ title: 'Reader removed', variant: 'success' });
      await loadReaders();
    } catch {
      toast({ title: 'Failed to remove reader', variant: 'destructive' });
    } finally { setDeletingId(null); }
  };

  const handleRegister = async () => {
    if (!regCode.trim()) return;
    setRegistering(true);
    try {
      await apiFetch('connect/terminal/readers', {
        method: 'POST',
        body: JSON.stringify({
          registration_code: regCode.trim(),
          ...(regLabel.trim() ? { label: regLabel.trim() } : {}),
          ...(regLocation ? { location: regLocation } : {}),
        }),
      });
      toast({ title: 'Reader registered', variant: 'success' });
      setRegCode(''); setRegLabel(''); setRegLocation('');
      setShowRegister(false);
      await loadReaders();
    } catch (err) {
      const e = err as { message?: string };
      toast({ title: e.message ?? 'Registration failed', variant: 'destructive' });
    } finally { setRegistering(false); }
  };

  const handleAddLocation = async () => {
    if (!newLocName.trim() || !newLocLine1.trim()) return;
    setSavingLocation(true);
    try {
      await apiFetch('connect/terminal/locations', {
        method: 'POST',
        body: JSON.stringify({
          display_name: newLocName.trim(),
          address: { line1: newLocLine1, city: newLocCity, state: newLocState, postal_code: newLocPostal, country: newLocCountry },
        }),
      });
      toast({ title: 'Location created', variant: 'success' });
      setShowAddLocation(false);
      setNewLocName(''); setNewLocLine1(''); setNewLocCity(''); setNewLocState(''); setNewLocPostal('');
      await loadLocations();
    } catch {
      toast({ title: 'Failed to create location', variant: 'destructive' });
    } finally { setSavingLocation(false); }
  };

  const handleSaveSplash = async () => {
    if (!splashUrl.trim() && !currentSplash) return;
    setSavingSplash(true);
    try {
      await apiFetch('connect/terminal/config', {
        method: 'PUT',
        body: JSON.stringify(
          splashUrl.trim()
            ? { splash_screen_url: splashUrl.trim() }
            : { clear_splash_screen: true },
        ),
      });
      toast({ title: splashUrl.trim() ? 'Splash screen updated' : 'Splash screen cleared', variant: 'success' });
      await loadSplash();
    } catch {
      toast({ title: 'Failed to update splash screen', variant: 'destructive' });
    } finally { setSavingSplash(false); }
  };

  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartTotal = cartItems.reduce((sum, [id, qty]) => {
    const item = catalog.find((c) => c.id === id);
    return sum + (item?.price_cents ?? 0) * qty;
  }, 0);

  const handlePlaceOrder = async () => {
    if (!orderName || !orderEmail || !orderLine1) return;
    setPlacingOrder(true);
    try {
      const res = await apiFetch<{ order: { message?: string } }>('connect/hardware/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cartItems.map(([id, qty]) => ({ catalog_object_id: id, quantity: qty })),
          shipping: {
            name: orderName, email: orderEmail, phone: orderPhone || undefined,
            address: { line1: orderLine1, city: orderCity, state: orderState, postal_code: orderPostal, country: 'AU' },
          },
        }),
      });
      toast({ title: 'Order submitted!', variant: 'success' });
      setCart({}); setShowOrderForm(false);
      alert(res.order?.message ?? 'Order received. Our team will be in touch shortly.');
    } catch {
      toast({ title: 'Order failed', variant: 'destructive' });
    } finally { setPlacingOrder(false); }
  };

  const fmtPrice = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-xl">📟</span> Card Readers
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage your Stripe card readers, locations, and reader branding.
          </p>
        </div>
      </div>

      {/* Panel tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800 w-fit">
        {[
          { id: 'readers',  label: 'Readers',  Icon: Monitor },
          { id: 'catalog',  label: 'Order Hardware', Icon: ShoppingCart },
          { id: 'branding', label: 'Branding', Icon: Image },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setPanel(id as typeof panel)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${panel === id ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Panel: Readers ──────────────────────────────────────────────────── */}
      {panel === 'readers' && (
        <div className="space-y-4">
          {/* Readers list */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Registered Readers</h3>
            <div className="flex gap-2">
              <button
                onClick={() => void loadReaders()}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${readersLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setShowRegister(!showRegister)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Register Reader
              </button>
            </div>
          </div>

          {/* Register form */}
          {showRegister && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-800 dark:bg-indigo-900/10 space-y-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Register a new reader</p>
              <p className="text-xs text-gray-500">Find the registration code on the reader&apos;s screen (Settings → Generate pairing code) or the quick-start guide.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Registration Code *</label>
                  <input className={darkInputCls} placeholder="e.g. FURR-HAUT" value={regCode} onChange={(e) => setRegCode(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Label (optional)</label>
                  <input className={darkInputCls} placeholder="e.g. Counter 1" value={regLabel} onChange={(e) => setRegLabel(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Location (optional)</label>
                  <select className={darkInputCls} value={regLocation} onChange={(e) => setRegLocation(e.target.value)}>
                    <option value="">— No location —</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.display_name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowRegister(false)} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                <button
                  onClick={() => void handleRegister()}
                  disabled={!regCode.trim() || registering}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Register
                </button>
              </div>
            </div>
          )}

          {/* Readers list */}
          {readersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : readers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center dark:border-gray-700">
              <Monitor className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-sm text-gray-500">No readers registered yet</p>
              <p className="text-xs text-gray-400 mt-1">Click &quot;Register Reader&quot; to add your first card reader.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {readers.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center gap-3">
                    <div className={`h-2.5 w-2.5 rounded-full ${r.status === 'online' ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{r.label || r.serial_number}</p>
                      <p className="text-xs text-gray-500">{r.device_type} · {r.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium capitalize ${r.status === 'online' ? 'text-green-600' : 'text-gray-400'}`}>{r.status}</span>
                    <button
                      onClick={() => void handleDeleteReader(r.id)}
                      disabled={deletingId === r.id}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                      title="Remove reader"
                    >
                      {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Locations */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Locations
              </h3>
              <button
                onClick={() => setShowAddLocation(!showAddLocation)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <Plus className="h-3 w-3" /> Add Location
              </button>
            </div>

            {showAddLocation && (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Display Name *</label>
                    <input className={darkInputCls} placeholder="e.g. Main Street Store" value={newLocName} onChange={(e) => setNewLocName(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Street Address *</label>
                    <input className={darkInputCls} placeholder="123 Main St" value={newLocLine1} onChange={(e) => setNewLocLine1(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">City</label>
                    <input className={darkInputCls} placeholder="Sydney" value={newLocCity} onChange={(e) => setNewLocCity(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">State</label>
                    <input className={darkInputCls} placeholder="NSW" value={newLocState} onChange={(e) => setNewLocState(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Postcode</label>
                    <input className={darkInputCls} placeholder="2000" value={newLocPostal} onChange={(e) => setNewLocPostal(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Country</label>
                    <input className={darkInputCls} value={newLocCountry} onChange={(e) => setNewLocCountry(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowAddLocation(false)} className="rounded-lg px-3 py-1.5 text-sm text-gray-500">Cancel</button>
                  <button
                    onClick={() => void handleAddLocation()}
                    disabled={!newLocName.trim() || !newLocLine1.trim() || savingLocation}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {savingLocation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save Location
                  </button>
                </div>
              </div>
            )}

            {locations.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-600">No locations yet. Add one to group readers by store.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {locations.map((l) => (
                  <div key={l.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-900">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{l.display_name}</p>
                    {l.address && <p className="text-xs text-gray-500 mt-0.5">{[l.address.line1, l.address.city, l.address.state].filter(Boolean).join(', ')}</p>}
                    <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{l.id}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Panel: Order Hardware ───────────────────────────────────────────── */}
      {panel === 'catalog' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Order genuine Stripe card readers shipped directly to you. Our team processes orders within 1–2 business days.
          </p>

          {catalogLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1,2,3].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />)}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-5 flex flex-col ${
                    item.available
                      ? 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                      : 'border-gray-100 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900'
                  }`}
                >
                  <div className="flex-1">
                    <div className="w-full h-32 bg-gray-100 dark:bg-gray-800 rounded-xl mb-4 flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image} alt={item.name} className="max-h-full max-w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{item.name}</h3>
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">{item.description}</p>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {item.features.map((f) => (
                        <span key={f} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">{f}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100 dark:border-gray-800">
                    <p className="font-semibold text-gray-900 dark:text-white">{fmtPrice(item.price_cents)}</p>
                    {item.available ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCart((c) => ({ ...c, [item.id]: Math.max(0, (c[item.id] ?? 0) - 1) }))}
                          className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 flex items-center justify-center font-bold"
                        >−</button>
                        <span className="w-5 text-center text-sm font-medium text-gray-900 dark:text-white">{cart[item.id] ?? 0}</span>
                        <button
                          onClick={() => setCart((c) => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }))}
                          className="w-7 h-7 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center font-bold"
                        >+</button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Unavailable</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cart summary */}
          {cartItems.length > 0 && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-5 dark:border-indigo-800 dark:bg-indigo-900/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Package className="h-4 w-4 text-indigo-600" /> Order Summary
                </h3>
                <p className="font-semibold text-gray-900 dark:text-white">{fmtPrice(cartTotal)}</p>
              </div>
              {cartItems.map(([id, qty]) => {
                const item = catalog.find((c) => c.id === id);
                if (!item) return null;
                return (
                  <div key={id} className="flex items-center justify-between text-sm py-1">
                    <span className="text-gray-700 dark:text-gray-300">{item.name} × {qty}</span>
                    <span className="text-gray-500">{fmtPrice(item.price_cents * qty)}</span>
                  </div>
                );
              })}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowOrderForm(true)}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <ShoppingCart className="h-4 w-4" /> Checkout
                </button>
              </div>
            </div>
          )}

          {/* Order form modal */}
          {showOrderForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 p-6 space-y-4 shadow-2xl">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Shipping Details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Full Name *</label>
                    <input className={darkInputCls} value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Email *</label>
                    <input className={darkInputCls} type="email" value={orderEmail} onChange={(e) => setOrderEmail(e.target.value)} placeholder="jane@business.com.au" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Phone</label>
                    <input className={darkInputCls} type="tel" value={orderPhone} onChange={(e) => setOrderPhone(e.target.value)} placeholder="+61 4xx xxx xxx" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Street Address *</label>
                    <input className={darkInputCls} value={orderLine1} onChange={(e) => setOrderLine1(e.target.value)} placeholder="123 Main St" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">City</label>
                    <input className={darkInputCls} value={orderCity} onChange={(e) => setOrderCity(e.target.value)} placeholder="Sydney" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">State</label>
                    <input className={darkInputCls} value={orderState} onChange={(e) => setOrderState(e.target.value)} placeholder="NSW" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Postcode</label>
                    <input className={darkInputCls} value={orderPostal} onChange={(e) => setOrderPostal(e.target.value)} placeholder="2000" />
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button onClick={() => setShowOrderForm(false)} className="rounded-xl px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                  <button
                    onClick={() => void handlePlaceOrder()}
                    disabled={!orderName || !orderEmail || !orderLine1 || placingOrder}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {placingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                    Place Order — {fmtPrice(cartTotal)}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Panel: Branding ─────────────────────────────────────────────────── */}
      {panel === 'branding' && (
        <div className="space-y-6 max-w-xl">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                <Image className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Reader Splash Screen</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Your logo or branded image is shown on the reader display when idle.
                  Use a landscape JPEG or PNG at least 1280×800px. The URL must be publicly accessible over HTTPS.
                </p>
              </div>
            </div>

            {currentSplash && (
              <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentSplash}
                  alt="Current splash screen"
                  className="w-full object-cover max-h-36"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <p className="px-3 py-2 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 truncate">{currentSplash}</p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Image URL</label>
              <input
                className={darkInputCls}
                type="url"
                placeholder="https://yourcdn.com/reader-splash.png"
                value={splashUrl}
                onChange={(e) => setSplashUrl(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-gray-500">Leave blank and save to remove the custom splash screen.</p>
            </div>

            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
              <p className="text-xs text-yellow-800 dark:text-yellow-300">
                <strong>Note:</strong> Physical reader casing logo (on the device hardware itself) is only available for Enterprise Stripe accounts with high reader volume. The splash screen is applied to the reader&apos;s display software only.
              </p>
            </div>

            <div className="flex gap-3">
              {currentSplash && (
                <button
                  onClick={() => { setSplashUrl(''); void handleSaveSplash(); }}
                  disabled={savingSplash}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
              )}
              <button
                onClick={() => void handleSaveSplash()}
                disabled={savingSplash || !splashUrl.trim()}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingSplash ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Splash Screen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 6 — Recovery
// ═══════════════════════════════════════════════════════════════════════════════

function StateBadge({ state }: { state: string }) {
  const cfg: Record<string, { color: string; label: string }> = {
    created:                 { color: 'bg-slate-700 text-slate-300',        label: 'Created' },
    initializing_terminal:   { color: 'bg-blue-900/50 text-blue-300',       label: 'Init' },
    awaiting_terminal_ready: { color: 'bg-blue-900/50 text-blue-300',       label: 'Connecting' },
    sent_to_terminal:        { color: 'bg-indigo-900/50 text-indigo-300',   label: 'Sent' },
    awaiting_cardholder:     { color: 'bg-yellow-900/50 text-yellow-300',   label: 'Awaiting Card' },
    authorizing:             { color: 'bg-purple-900/50 text-purple-300',   label: 'Authorizing' },
    approved_pending_commit: { color: 'bg-purple-900/50 text-purple-300',   label: 'Pending Commit' },
    approved:                { color: 'bg-green-900/50 text-green-300',     label: 'Approved' },
    declined:                { color: 'bg-red-900/50 text-red-300',         label: 'Declined' },
    cancel_requested:        { color: 'bg-slate-700 text-slate-300',        label: 'Cancelling' },
    cancelled:               { color: 'bg-slate-700 text-slate-300',        label: 'Cancelled' },
    failed_retryable:        { color: 'bg-red-900/50 text-red-300',         label: 'Failed' },
    failed_terminal:         { color: 'bg-red-900/50 text-red-300',         label: 'Terminal Error' },
    unknown_outcome:         { color: 'bg-yellow-900/60 text-yellow-200 font-bold', label: 'Unknown Outcome' },
    recovery_required:       { color: 'bg-orange-900/60 text-orange-200',   label: 'Recovery Required' },
  };
  const { color, label } = cfg[state] ?? { color: 'bg-slate-700 text-slate-300', label: state };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${color}`}>{label}</span>;
}

function formatAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RecoveryTab() {
  const { toast }   = useToast();
  const [intents, setIntents]     = useState<UnresolvedPayment[]>([]);
  const [loading, setLoading]     = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/eftpos/recovery', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as { data: UnresolvedPayment[] };
        setIntents(data.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleResolve = async (id: string, resolution: 'approved' | 'declined' | 'cancelled', note: string) => {
    setResolving(id);
    try {
      await resolvePayment(id, resolution, note);
      toast({ title: `Marked as ${resolution}`, variant: 'success' });
      await load();
    } catch {
      toast({ title: 'Failed to resolve', variant: 'destructive' });
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ANZ Worldline transactions that didn&apos;t reach a terminal state. Check the ANZ portal before resolving.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-[#1e2a40] bg-[#0f172a]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : intents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <p className="text-sm text-gray-400">No unresolved payment intents</p>
            <p className="text-xs text-gray-600">All transactions from the last 24 hours are in a terminal state.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e2a40]">
            {intents.map((intent) => (
              <div key={intent.id} className="p-4">
                <div className="mb-2 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <StateBadge state={intent.state} />
                      <span className="text-xs text-gray-500">{formatAgo(intent.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-white">
                      ${(intent.amountCents / 100).toFixed(2)} — Order {intent.posOrderId}
                    </p>
                    <p className="text-xs text-gray-500">
                      {intent.terminalIp}{intent.terminalLabel ? ` · ${intent.terminalLabel}` : ''}
                    </p>
                    <p className="font-mono text-[10px] text-gray-600">{intent.id}</p>
                  </div>
                </div>

                {(intent.state === 'unknown_outcome' || intent.state === 'recovery_required') && (
                  <div className="mb-3 rounded-lg border border-yellow-700/30 bg-yellow-900/15 px-3 py-2 text-xs text-yellow-300">
                    <strong>Action required:</strong> Check the ANZ Worldline portal to confirm whether this transaction was processed.
                    Do NOT re-attempt the payment until confirmed.
                  </div>
                )}

                {resolving === intent.id ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void handleResolve(intent.id, 'approved', 'Operator confirmed via ANZ portal')}
                      className="flex items-center gap-1 rounded-lg border border-green-700/40 bg-green-900/20 px-3 py-1.5 text-xs font-semibold text-green-300 hover:bg-green-900/40"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Mark Approved
                    </button>
                    <button
                      onClick={() => void handleResolve(intent.id, 'declined', 'Operator confirmed not charged')}
                      className="flex items-center gap-1 rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/40"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Mark Declined
                    </button>
                    <button
                      onClick={() => void handleResolve(intent.id, 'cancelled', 'Operator confirmed cancelled')}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-white"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      Mark Cancelled
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* State reference */}
      <details className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
          Payment State Reference
        </summary>
        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-3 text-xs text-gray-500">Terminal states are final — non-terminal states appear above for recovery.</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {[
              'created','initializing_terminal','awaiting_terminal_ready',
              'sent_to_terminal','awaiting_cardholder','authorizing',
              'approved_pending_commit','approved','declined',
              'cancel_requested','cancelled','failed_retryable',
              'failed_terminal','unknown_outcome','recovery_required',
            ].map((s) => <StateBadge key={s} state={s} />)}
          </div>
        </div>
      </details>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Root Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('methods');

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payment &amp; Connect</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Manage payment methods, terminal hardware, compliance settings, and your ElevatedPOS Pay account.
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'methods'     && <MethodsTab />}
      {tab === 'terminals'   && <TerminalsTab />}
      {tab === 'compliance'  && <ComplianceTab />}
      {tab === 'elevatedpay' && <ElevatedPOSPayTab />}
      {tab === 'hardware'    && <HardwareTab />}
      {tab === 'recovery'    && <RecoveryTab />}
    </div>
  );
}
