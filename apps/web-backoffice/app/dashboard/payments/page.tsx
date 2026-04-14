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

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Save, RefreshCw, CheckCircle,
  AlertCircle, XCircle, Loader2, Info, Eye, EyeOff,
  Zap, Link2Off, DollarSign, Percent,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { resolvePayment, type UnresolvedPayment } from '@/lib/payments';
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

type Tab = 'methods' | 'terminals' | 'compliance' | 'stripe' | 'recovery';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'methods',    label: 'Payment Methods', icon: '💳' },
  { id: 'terminals',  label: 'Terminals',        icon: '🖥️' },
  { id: 'compliance', label: 'Compliance',       icon: '⚖️' },
  { id: 'stripe',     label: 'Stripe Connect',   icon: '🔗' },
  { id: 'recovery',   label: 'Recovery',         icon: '🛡️' },
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

function ANZPanel() {
  const { toast } = useToast();
  const [loading, setLoading]           = useState(true);
  const [terminalIp, setTerminalIp]     = useState('');
  const [terminalPort, setTerminalPort] = useState('80');
  const [terminalLabel, setTerminalLabel] = useState('');
  const [autoCommit, setAutoCommit]     = useState(false);
  const [printMerchant, setPrintMerchant] = useState(false);
  const [printCustomer, setPrintCustomer] = useState(false);
  const [connected, setConnected]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [testing, setTesting]           = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{
          terminalIp?: string; terminalPort?: number; terminalLabel?: string;
          autoCommit?: boolean; printMerchantReceipt?: boolean; printCustomerReceipt?: boolean;
        }>('terminal/credentials');
        if (data.terminalIp) {
          setTerminalIp(data.terminalIp);
          const p = data.terminalPort;
          setTerminalPort(String(p && p !== 8080 && p !== 4100 ? p : 80));
          setTerminalLabel(data.terminalLabel ?? '');
          setAutoCommit(data.autoCommit ?? false);
          setPrintMerchant(data.printMerchantReceipt ?? false);
          setPrintCustomer(data.printCustomerReceipt ?? false);
          setConnected(true);
        }
      } catch { /* not configured */ }
      finally { setLoading(false); }
    })();
  }, []);

  async function handleSave() {
    if (!terminalIp.trim()) { toast({ title: 'Terminal IP is required', variant: 'destructive' }); return; }
    const port = Number(terminalPort);
    if (!port || port < 1 || port > 65535) { toast({ title: 'Enter a valid port (1–65535)', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await apiFetch('terminal/credentials', {
        method: 'POST',
        body: JSON.stringify({
          terminalIp: terminalIp.trim(),
          terminalPort: port,
          terminalLabel: terminalLabel.trim() || undefined,
          autoCommit,
          printMerchantReceipt: printMerchant,
          printCustomerReceipt: printCustomer,
        }),
      });
      setConnected(true);
      toast({ title: 'ANZ Worldline settings saved', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await apiFetch('terminal/anz/test', { method: 'POST' });
      toast({ title: 'Connection successful', description: 'Terminal is reachable', variant: 'success' });
    } catch (err) {
      toast({ title: 'Connection failed', description: err instanceof Error ? err.message : 'Check IP and port', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('terminal/credentials', { method: 'DELETE' });
      setTerminalIp(''); setTerminalPort('80'); setTerminalLabel(''); setConnected(false);
      toast({ title: 'ANZ Worldline disconnected' });
    } catch {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4 rounded-xl border border-[#1e2a40] bg-[#0f172a] p-5">
      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-2xl bg-[#0f172a] border border-[#1e2a40] p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-white mb-2">Disconnect ANZ Worldline?</h3>
            <p className="text-sm text-gray-400 mb-4">The saved terminal credentials will be removed. You can reconfigure at any time.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDisconnect(false)} className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-300 hover:bg-white/5">Cancel</button>
              <button onClick={handleDisconnect} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700">Disconnect</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">ANZ Worldline</h3>
          <p className="text-xs text-gray-400">TIM API WebSocket — port 80. Set terminal to ECR / Integrated mode.</p>
        </div>
        {connected && (
          <span className="rounded-full bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-400">
            Connected
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-gray-400">Terminal IP Address</label>
          <input value={terminalIp} onChange={(e) => setTerminalIp(e.target.value)} placeholder="192.168.1.100" className={darkInputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Port</label>
          <input value={terminalPort} onChange={(e) => setTerminalPort(e.target.value)} placeholder="80" type="number" className={darkInputCls} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-400">Terminal Label (optional)</label>
        <input value={terminalLabel} onChange={(e) => setTerminalLabel(e.target.value)} placeholder="e.g. Counter 1" className={darkInputCls} />
      </div>

      <div className="space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={!autoCommit} onChange={(e) => setAutoCommit(!e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-indigo-500" />
          <div>
            <p className="text-sm font-medium text-white">Require explicit commit (recommended)</p>
            <p className="text-xs text-gray-500">Prevents duplicate charges if the POS crashes between authorization and completion.</p>
          </div>
        </label>
        <div className="border-t border-white/5 pt-2">
          <p className="mb-2 text-xs font-medium text-gray-400">Terminal receipt printing</p>
          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={printMerchant} onChange={(e) => setPrintMerchant(e.target.checked)} className="h-4 w-4 rounded accent-indigo-500" />
              <span className="text-sm text-white">Print merchant receipt</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={printCustomer} onChange={(e) => setPrintCustomer(e.target.checked)} className="h-4 w-4 rounded accent-indigo-500" />
              <span className="text-sm text-white">Print customer receipt</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        {connected && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-white/30 hover:text-white disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Test Connection
          </button>
        )}
        {connected && (
          <button
            onClick={() => setConfirmDisconnect(true)}
            disabled={disconnecting}
            className="ml-auto flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 disabled:opacity-50"
          >
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4" />}
            Disconnect
          </button>
        )}
      </div>

      <div className="flex gap-3 rounded-xl border border-blue-800/30 bg-blue-900/10 p-3 text-xs text-blue-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Place <code className="rounded bg-blue-900/30 px-1">timapi.js</code> and{' '}
          <code className="rounded bg-blue-900/30 px-1">timapi.wasm</code> in{' '}
          <code className="rounded bg-blue-900/30 px-1">/public/timapi/</code> and set{' '}
          <code className="rounded bg-blue-900/30 px-1">ANZ_INTEGRATOR_ID</code> in your environment.{' '}
          Obtain from the{' '}
          <a href="https://start.portal.anzworldline-solutions.com.au/" target="_blank" rel="noopener noreferrer" className="underline">
            ANZ Worldline portal
          </a>.
        </p>
      </div>
    </div>
  );
}

// ─── Stripe Terminal ─────────────────────────────────────────────────────────

function StripeTerminalPanel() {
  const { toast } = useToast();
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey]         = useState('');
  const [secretKeyMask, setSecretKeyMask] = useState('');
  const [showSecret, setShowSecret]       = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ publishableKey?: string; secretKeyMask?: string }>('terminal/credentials?provider=stripe');
        if (data.publishableKey) setPublishableKey(data.publishableKey);
        if (data.secretKeyMask)  setSecretKeyMask(data.secretKeyMask);
      } catch { /* not configured */ }
      finally { setLoading(false); }
    })();
  }, []);

  async function handleSave() {
    if (!publishableKey.trim()) { toast({ title: 'Publishable key is required', variant: 'destructive' }); return; }
    if (!publishableKey.trim().startsWith('pk_')) { toast({ title: 'Publishable key must start with pk_live_ or pk_test_', variant: 'destructive' }); return; }
    if (secretKey && !secretKey.trim().startsWith('sk_')) { toast({ title: 'Secret key must start with sk_live_ or sk_test_', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await apiFetch('terminal/credentials', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'stripe',
          publishableKey: publishableKey.trim(),
          ...(secretKey.trim() ? { secretKey: secretKey.trim() } : {}),
        }),
      });
      setSecretKey('');
      toast({ title: 'Stripe Terminal settings saved', variant: 'success' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4 rounded-xl border border-[#1e2a40] bg-[#0f172a] p-5">
      <div>
        <h3 className="font-semibold text-white">Stripe Terminal</h3>
        <p className="text-xs text-gray-400">Tap to Pay on Android — uses the device&apos;s own NFC reader</p>
      </div>

      <div className="flex gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs text-indigo-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
        <p>
          Get your API keys from{' '}
          <a href="https://dashboard.stripe.com/developers/api-keys" target="_blank" rel="noreferrer" className="underline">
            dashboard.stripe.com → Developers → API Keys
          </a>.
          Use live keys for production and test keys for staging.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-400">Publishable Key <span className="text-red-400">*</span></label>
        <input value={publishableKey} onChange={(e) => setPublishableKey(e.target.value)} placeholder="pk_live_... or pk_test_..." className={darkInputCls} />
        <p className="mt-1 text-xs text-gray-600">Used by the POS app to initialize the Stripe Terminal SDK.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-400">Secret Key</label>
        {secretKeyMask && !secretKey && (
          <p className="mb-1 font-mono text-xs text-gray-400">Current: {secretKeyMask}</p>
        )}
        <div className="relative">
          <input
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            type={showSecret ? 'text' : 'password'}
            placeholder={secretKeyMask ? 'Enter new key to replace…' : 'sk_live_... or sk_test_...'}
            className={darkInputCls + ' pr-10'}
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-600">Leave blank to keep existing key.</p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
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
      <StripeTerminalPanel />
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
// Tab 4 — Stripe Connect
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

function StripeConnectTab() {
  const [account, setAccount]   = useState<ConnectAccount | null>(null);
  const [loading, setLoading]   = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [orgId, setOrgId]       = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((me: { orgId?: string } | null) => {
        const id = me?.orgId ?? null;
        setOrgId(id);
        if (!id) { setLoading(false); return; }
        return fetch(`/api/proxy/integrations/api/v1/connect/account/${id}`)
          .then((r) => r.ok ? r.json() : null)
          .then((data: ConnectAccount | null) => setAccount(data))
          .catch(() => setAccount(null))
          .finally(() => setLoading(false));
      })
      .catch(() => { setOrgId(null); setLoading(false); });
  }, []);

  async function handleConnect() {
    setOnboarding(true);
    try {
      const res = await fetch('/api/proxy/integrations/api/v1/connect/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json() as { url: string };
      window.location.href = data.url;
    } catch {
      setOnboarding(false);
    }
  }

  async function handleDashboard() {
    const res = await fetch(`/api/proxy/integrations/api/v1/connect/login-link/${orgId}`, { method: 'POST' });
    const data = await res.json() as { url: string };
    window.open(data.url, '_blank');
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48" />
      <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
    </div>
  );

  if (!account || account.status === 'pending') {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center max-w-md dark:border-gray-800 dark:bg-gray-900">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">💳</span>
        </div>
        <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Connect Stripe</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          Link your Stripe account to accept online payments, subscriptions, and invoices.
          A 1% platform fee applies on top of standard Stripe fees.
        </p>
        <button
          onClick={handleConnect}
          disabled={onboarding}
          className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {onboarding ? 'Redirecting to Stripe…' : 'Connect with Stripe →'}
        </button>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">Powered by Stripe Connect · Your data is secure</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {account.businessName ?? 'Your Stripe Account'}
            </h2>
            <p className="text-sm text-gray-500 font-mono">{account.stripeAccountId}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${STATUS_COLORS[account.status] ?? ''}`}>
            {account.status}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { icon: account.chargesEnabled ? '✅' : '⏳', label: 'Charges',       sub: account.chargesEnabled ? 'Enabled' : 'Pending' },
            { icon: account.payoutsEnabled ? '✅' : '⏳', label: 'Payouts',       sub: account.payoutsEnabled ? 'Enabled' : 'Pending' },
            { icon: '💰',                                  label: 'Platform fee',  sub: `${account.platformFeePercent / 100}% per txn` },
          ].map((item) => (
            <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl mb-1">{item.icon}</div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
              <p className="text-xs text-gray-500">{item.sub}</p>
            </div>
          ))}
        </div>

        {account.status === 'onboarding' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-sm dark:bg-yellow-900/20 dark:border-yellow-800">
            <strong className="text-yellow-800 dark:text-yellow-300">Action required:</strong>{' '}
            <span className="text-yellow-700 dark:text-yellow-400">Your Stripe onboarding is incomplete.</span>
            <button onClick={handleConnect} className="ml-2 text-yellow-700 dark:text-yellow-300 underline font-medium">
              Continue onboarding →
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleDashboard}
            className="flex-1 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Open Stripe Dashboard ↗
          </button>
          {account.status === 'onboarding' && (
            <button
              onClick={handleConnect}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Complete setup →
            </button>
          )}
        </div>
      </div>

      {account.chargesEnabled && (
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 5 — Recovery
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
          Manage payment methods, terminal hardware, compliance settings, and Stripe account.
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
      {tab === 'methods'    && <MethodsTab />}
      {tab === 'terminals'  && <TerminalsTab />}
      {tab === 'compliance' && <ComplianceTab />}
      {tab === 'stripe'     && <StripeConnectTab />}
      {tab === 'recovery'   && <RecoveryTab />}
    </div>
  );
}
