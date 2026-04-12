'use client';

/**
 * Terminal Settings — ANZ Worldline EFTPOS configuration
 *
 * Provides:
 *  - Terminal connection settings (IP, port, label, autoCommit)
 *  - Receipt print options
 *  - Crash recovery: lists non-terminal intents from last 24h and allows reconciliation
 *
 * The actual terminal test (which uses the TIM API SDK) happens in the POS
 * fullscreen flow. This page only manages server-side config and recovery.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Save, RefreshCw, ShieldAlert, CheckCircle,
  AlertCircle, Clock, XCircle, ArrowRight, Loader2, Info,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { resolvePayment, type UnresolvedPayment } from '@/lib/payments';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TerminalCredential {
  terminalIp?: string;
  terminalPort?: number;
  terminalLabel?: string;
  autoCommit?: boolean;
  printMerchantReceipt?: boolean;
  printCustomerReceipt?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const cfg: Record<string, { color: string; label: string }> = {
    created:                  { color: 'bg-slate-700 text-slate-300',         label: 'Created' },
    initializing_terminal:    { color: 'bg-blue-900/50 text-blue-300',        label: 'Init' },
    awaiting_terminal_ready:  { color: 'bg-blue-900/50 text-blue-300',        label: 'Connecting' },
    sent_to_terminal:         { color: 'bg-indigo-900/50 text-indigo-300',    label: 'Sent' },
    awaiting_cardholder:      { color: 'bg-yellow-900/50 text-yellow-300',    label: 'Awaiting Card' },
    authorizing:              { color: 'bg-purple-900/50 text-purple-300',    label: 'Authorizing' },
    approved_pending_commit:  { color: 'bg-purple-900/50 text-purple-300',    label: 'Pending Commit' },
    approved:                 { color: 'bg-green-900/50 text-green-300',      label: 'Approved' },
    declined:                 { color: 'bg-red-900/50 text-red-300',          label: 'Declined' },
    cancel_requested:         { color: 'bg-slate-700 text-slate-300',         label: 'Cancelling' },
    cancelled:                { color: 'bg-slate-700 text-slate-300',         label: 'Cancelled' },
    failed_retryable:         { color: 'bg-red-900/50 text-red-300',          label: 'Failed' },
    failed_terminal:          { color: 'bg-red-900/50 text-red-300',          label: 'Terminal Error' },
    unknown_outcome:          { color: 'bg-yellow-900/60 text-yellow-200 font-bold', label: 'Unknown Outcome' },
    recovery_required:        { color: 'bg-orange-900/60 text-orange-200',    label: 'Recovery Required' },
  };
  const { color, label } = cfg[state] ?? { color: 'bg-slate-700 text-slate-300', label: state };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${color}`}>
      {label}
    </span>
  );
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

// ─── Crash Recovery Panel ─────────────────────────────────────────────────────

function CrashRecoveryPanel() {
  const { toast } = useToast();
  const [intents, setIntents] = useState<UnresolvedPayment[]>([]);
  const [loading, setLoading] = useState(true);
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

  const handleResolve = async (
    intentId: string,
    resolution: 'approved' | 'declined' | 'cancelled',
    note: string,
  ) => {
    setResolving(intentId);
    try {
      await resolvePayment(intentId, resolution, note);
      toast({ title: `Intent marked as ${resolution}`, variant: 'success' });
      await load();
    } catch {
      toast({ title: 'Failed to resolve intent', variant: 'destructive' });
    } finally {
      setResolving(null);
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-yellow-400" />
          <h3 className="text-sm font-semibold text-white">Crash Recovery</h3>
          {intents.length > 0 && (
            <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[11px] font-bold text-yellow-300">
              {intents.length} pending
            </span>
          )}
        </div>
        <button
          onClick={() => void load()}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-xl border border-[#1e2a40] bg-[#0f172a]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          </div>
        ) : intents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <CheckCircle className="h-6 w-6 text-green-500" />
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
                      <span className="text-xs text-gray-500">
                        {formatAgo(intent.createdAt)}
                      </span>
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
                    <strong>Action required:</strong> Check the ANZ Worldline portal to confirm whether this transaction was processed. Do NOT re-attempt the payment until confirmed.
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
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TerminalSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [terminalIp, setTerminalIp]       = useState('');
  const [terminalPort, setTerminalPort]   = useState('80');
  const [terminalLabel, setTerminalLabel] = useState('');
  const [autoCommit, setAutoCommit]       = useState(false);
  const [printMerchant, setPrintMerchant] = useState(false);
  const [printCustomer, setPrintCustomer] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<TerminalCredential>('terminal/credentials');
        if (data.terminalIp) setTerminalIp(data.terminalIp);
        setTerminalPort(String(data.terminalPort ?? 80));
        setTerminalLabel(data.terminalLabel ?? '');
        setAutoCommit(data.autoCommit ?? false);
        setPrintMerchant(data.printMerchantReceipt ?? false);
        setPrintCustomer(data.printCustomerReceipt ?? false);
      } catch {
        // Not configured yet — defaults are fine
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!terminalIp.trim()) {
      toast({ title: 'Terminal IP is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('terminal/credentials', {
        method: 'POST',
        body: JSON.stringify({
          terminalIp:          terminalIp.trim(),
          terminalPort:        Number(terminalPort) || 80,
          terminalLabel:       terminalLabel.trim() || undefined,
          autoCommit,
          printMerchantReceipt: printMerchant,
          printCustomerReceipt: printCustomer,
        }),
      });
      toast({ title: 'Terminal settings saved', variant: 'success' });
    } catch {
      toast({ title: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20">
            <CreditCard className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">ANZ Worldline Terminal</h1>
            <p className="text-sm text-gray-400">Configure EFTPOS terminal connection and payment options</p>
          </div>
        </div>
      </div>

      {/* Connection Settings */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Connection</h3>
        <div className="space-y-4 rounded-xl border border-[#1e2a40] bg-[#0f172a] p-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-gray-400">Terminal IP Address</label>
              <input
                value={terminalIp}
                onChange={(e) => setTerminalIp(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full rounded-lg border border-[#1e2a40] bg-[#16213e] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Port</label>
              <input
                value={terminalPort}
                onChange={(e) => setTerminalPort(e.target.value)}
                placeholder="80"
                type="number"
                className="w-full rounded-lg border border-[#1e2a40] bg-[#16213e] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-400">Terminal Label (optional)</label>
            <input
              value={terminalLabel}
              onChange={(e) => setTerminalLabel(e.target.value)}
              placeholder="e.g. Counter 1, Drive-Through"
              className="w-full rounded-lg border border-[#1e2a40] bg-[#16213e] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-600">
              ANZ TIM API default port is 80 (WebSocket). Check your terminal&rsquo;s ECR/Integrated mode settings.
            </p>
          </div>
        </div>
      </section>

      {/* Payment Options */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Payment Options</h3>
        <div className="space-y-3 rounded-xl border border-[#1e2a40] bg-[#0f172a] p-4">

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={!autoCommit}
              onChange={(e) => setAutoCommit(!e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-indigo-500"
            />
            <div>
              <p className="text-sm font-semibold text-white">Require explicit commit (recommended)</p>
              <p className="text-xs text-gray-500">
                After bank approval, the POS must explicitly confirm the transaction. This prevents duplicate charges
                if the POS crashes between authorization and completion.
              </p>
            </div>
          </label>

          <div className="border-t border-[#1e2a40] pt-3">
            <p className="mb-2 text-xs font-medium text-gray-400">Receipt printing</p>
            <p className="mb-3 text-xs text-gray-600">
              By default, the POS prints receipts from the order summary. Enable these only if you want the terminal to print its own copies.
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={printMerchant}
                  onChange={(e) => setPrintMerchant(e.target.checked)}
                  className="h-4 w-4 rounded accent-indigo-500"
                />
                <span className="text-sm text-white">Terminal prints merchant receipt</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={printCustomer}
                  onChange={(e) => setPrintCustomer(e.target.checked)}
                  className="h-4 w-4 rounded accent-indigo-500"
                />
                <span className="text-sm text-white">Terminal prints customer receipt</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Info box */}
      <div className="flex gap-3 rounded-xl border border-blue-800/40 bg-blue-900/15 p-4 text-xs text-blue-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">SDK setup required</p>
          <p className="mt-1 opacity-80">
            Place <code className="rounded bg-blue-900/40 px-1">timapi.js</code> and{' '}
            <code className="rounded bg-blue-900/40 px-1">timapi.wasm</code> in{' '}
            <code className="rounded bg-blue-900/40 px-1">/public/timapi/</code> on the web server.
            Obtain them from the{' '}
            <a
              href="https://start.portal.anzworldline-solutions.com.au/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              ANZ Worldline portal
            </a>
            . Set <code className="rounded bg-blue-900/40 px-1">ANZ_INTEGRATOR_ID</code> in your server environment.
          </p>
          <p className="mt-1 opacity-80">
            To verify connectivity, open the POS and attempt a test transaction — the SDK loads and connects directly to the terminal on the local network.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </button>
      </div>

      {/* Crash Recovery */}
      <CrashRecoveryPanel />

      {/* State reference */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Payment State Reference</h3>
        <div className="rounded-xl border border-[#1e2a40] bg-[#0f172a] p-4">
          <p className="mb-3 text-xs text-gray-500">
            Payment intents transition through these states. Terminal states are final — intents in non-terminal states appear in crash recovery above.
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {[
              'created', 'initializing_terminal', 'awaiting_terminal_ready',
              'sent_to_terminal', 'awaiting_cardholder', 'authorizing',
              'approved_pending_commit', 'approved', 'declined',
              'cancel_requested', 'cancelled', 'failed_retryable',
              'failed_terminal', 'unknown_outcome', 'recovery_required',
            ].map((s) => (
              <StateBadge key={s} state={s} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
