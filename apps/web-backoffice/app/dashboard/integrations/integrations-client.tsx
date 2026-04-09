'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Link2,
  Link2Off,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageSquare,
  Truck,
  Calculator,
  FileText,
  Zap,
  ExternalLink,
  CalendarCheck,
  CreditCard,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IntegrationsStatus {
  xero: { connected: boolean; orgName?: string; lastSync?: string };
  myob: { connected: boolean; companyName?: string; lastSync?: string };
  quickbooks: { connected: boolean; companyName?: string; lastSync?: string };
  ubereats: { connected: boolean; storeId?: string | null; autoAccept?: boolean; syncMenu?: boolean };
  doordash: { connected: boolean; storeId?: string | null; autoAccept?: boolean; syncMenu?: boolean };
  menulog: { connected: boolean; storeId?: string | null; autoAccept?: boolean; syncMenu?: boolean };
  deliveroo: { connected: boolean; storeId?: string | null; autoAccept?: boolean; syncMenu?: boolean };
  stp: { configured: boolean; abn?: string; softwareId?: string; branchNumber?: string; lastSubmission?: string };
  mailchimp: { connected: boolean; listId?: string; apiKey?: string };
  klaviyo: { connected: boolean; apiKey?: string };
  twilio: { connected: boolean; accountSid?: string; authToken?: string; fromNumber?: string };
  messagebird: { connected: boolean; apiKey?: string; fromName?: string };
  deputy: { connected: boolean; businessId?: string; lastSync?: string };
  anzWorldline: { connected: boolean; terminalIp?: string; terminalPort?: number };
  tyro: { connected: boolean; merchantId?: string; terminalId?: string; tyroHandlesSurcharge?: boolean };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        connected
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
      }`}
    >
      {connected ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {label ?? (connected ? 'Connected' : 'Disconnected')}
    </span>
  );
}

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 pb-1">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400">
        {icon}
      </div>
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="px-6 py-5">
          <h4 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h4>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{message}</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <label className="w-40 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function inputCls() {
  return 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white placeholder:text-gray-400';
}

function selectCls() {
  return 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';
}

// ─── Accounting: Xero ─────────────────────────────────────────────────────────

function XeroCard({
  status,
  onRefresh,
}: {
  status: IntegrationsStatus['xero'];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [coaMapping, setCoaMapping] = useState('');

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await apiFetch<{ authUrl: string }>('integrations/xero/connect');
      window.location.href = res.authUrl;
    } catch (err) {
      toast({ title: 'Failed to start Xero connection', description: getErrorMessage(err), variant: 'destructive' });
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await apiFetch('integrations/xero/sync', { method: 'POST' });
      toast({ title: 'Xero sync started', description: 'Your data is syncing in the background.', variant: 'success' });
    } catch (err) {
      toast({ title: 'Sync failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/xero', { method: 'DELETE' });
      toast({ title: 'Xero disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect Xero?"
          message="This will stop all syncing between ElevatedPOS and your Xero organisation. You can reconnect at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl dark:bg-blue-900/20">
              🔵
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Xero</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Accounting</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 pb-3 pt-3 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sync sales, refunds, and payments to your Xero ledger automatically.
          </p>

          {status.connected && (
            <div className="mt-3 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
              {status.orgName && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Organisation:</span> {status.orgName}
                </p>
              )}
              {status.lastSync && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Last sync:</span>{' '}
                  {new Date(status.lastSync).toLocaleString('en-AU')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          {status.connected ? (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync Now
              </button>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Settings {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              <button
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnecting}
                className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {connecting ? 'Redirecting…' : 'Connect with Xero'}
            </button>
          )}
        </div>

        {status.connected && expanded && (
          <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
            <div className="space-y-4">
              <FieldRow label="Auto-sync">
                <div className="flex items-center gap-2">
                  <Toggle checked={autoSync} onChange={setAutoSync} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {autoSync ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </FieldRow>
              <FieldRow label="Sync frequency">
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')}
                  className={selectCls()}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </FieldRow>
              <FieldRow label="Chart of accounts">
                <input
                  type="text"
                  value={coaMapping}
                  onChange={(e) => setCoaMapping(e.target.value)}
                  placeholder="e.g. Sales → 200, Tax → 820"
                  className={inputCls()}
                />
              </FieldRow>
              <div className="flex justify-end">
                <button
                  onClick={() => toast({ title: 'Xero settings saved', variant: 'success' })}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Accounting: MYOB ─────────────────────────────────────────────────────────

function MYOBCard({
  status,
  onRefresh,
}: {
  status: IntegrationsStatus['myob'];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await apiFetch<{ authUrl: string }>('integrations/myob/connect');
      window.location.href = res.authUrl;
    } catch (err) {
      toast({ title: 'Failed to start MYOB connection', description: getErrorMessage(err), variant: 'destructive' });
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await apiFetch('integrations/myob/sync', { method: 'POST' });
      toast({ title: 'MYOB sync started', description: 'Your data is syncing in the background.', variant: 'success' });
    } catch (err) {
      toast({ title: 'Sync failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/myob', { method: 'DELETE' });
      toast({ title: 'MYOB disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect MYOB?"
          message="This will stop all syncing between ElevatedPOS and your MYOB company file. You can reconnect at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-xl dark:bg-purple-900/20">
              🟣
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">MYOB</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Accounting</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 pb-3 pt-3 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sync sales data directly into your MYOB company file for seamless bookkeeping.
          </p>
          {status.connected && (
            <div className="mt-3 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
              {status.companyName && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Company:</span> {status.companyName}
                </p>
              )}
              {status.lastSync && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Last sync:</span>{' '}
                  {new Date(status.lastSync).toLocaleString('en-AU')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          {status.connected ? (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync Now
              </button>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Settings {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              <button
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnecting}
                className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {connecting ? 'Redirecting…' : 'Connect with MYOB'}
            </button>
          )}
        </div>

        {status.connected && expanded && (
          <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
            <div className="space-y-4">
              <FieldRow label="Auto-sync">
                <div className="flex items-center gap-2">
                  <Toggle checked={autoSync} onChange={setAutoSync} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {autoSync ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </FieldRow>
              <FieldRow label="Sync frequency">
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')}
                  className={selectCls()}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </FieldRow>
              <div className="flex justify-end">
                <button
                  onClick={() => toast({ title: 'MYOB settings saved', variant: 'success' })}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Accounting: QuickBooks Online ────────────────────────────────────────────

function QuickBooksCard({
  status,
  onRefresh,
}: {
  status: IntegrationsStatus['quickbooks'];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await apiFetch<{ authUrl: string }>('/api/proxy/integrations/quickbooks/connect');
      window.location.href = res.authUrl;
    } catch (err) {
      toast({ title: 'Failed to start QuickBooks connection', description: getErrorMessage(err), variant: 'destructive' });
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await apiFetch('integrations/quickbooks/sync', { method: 'POST' });
      toast({ title: 'QuickBooks sync started', description: 'Your data is syncing in the background.', variant: 'success' });
    } catch (err) {
      toast({ title: 'Sync failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/quickbooks', { method: 'DELETE' });
      toast({ title: 'QuickBooks disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect QuickBooks?"
          message="This will stop all syncing between ElevatedPOS and your QuickBooks company. You can reconnect at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-xl dark:bg-green-900/20">
              💚
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">QuickBooks Online</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Accounting</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 pb-3 pt-3 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sync sales, refunds, and payments to your QuickBooks Online company automatically.
          </p>
          {status.connected && (
            <div className="mt-3 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
              {status.companyName && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Company:</span> {status.companyName}
                </p>
              )}
              {status.lastSync && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Last sync:</span>{' '}
                  {new Date(status.lastSync).toLocaleString('en-AU')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          {status.connected ? (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync Now
              </button>
              <button
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnecting}
                className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {connecting ? 'Redirecting…' : 'Connect with QuickBooks'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Delivery: Uber Eats ──────────────────────────────────────────────────────

function UberEatsCard({
  status,
  onRefresh,
}: {
  status: IntegrationsStatus['ubereats'];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [storeId, setStoreId] = useState(status.storeId ?? '');
  const [autoAccept, setAutoAccept] = useState(status.autoAccept ?? false);
  const [syncMenu, setSyncMenu] = useState(status.syncMenu ?? false);
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('integrations/ubereats', {
        method: 'PUT',
        body: JSON.stringify({ apiKey: apiKey || undefined, storeId, autoAccept, syncMenu }),
      });
      toast({ title: 'Uber Eats settings saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/ubereats', { method: 'DELETE' });
      toast({ title: 'Uber Eats disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect Uber Eats?"
          message="Orders from Uber Eats will no longer flow into your POS. You can reconnect at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-xl dark:bg-green-900/20">
              🛵
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Uber Eats</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Delivery</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Accept Uber Eats orders directly in your POS without a separate tablet.
          </p>
          <div className="space-y-4">
            <FieldRow label="Store ID">
              <input
                type="text"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="e.g. abc123xyz"
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={status.connected ? '••••••••••••' : 'Paste your Uber Eats API key'}
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Auto-accept orders">
              <div className="flex items-center gap-2">
                <Toggle checked={autoAccept} onChange={setAutoAccept} />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {autoAccept ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </FieldRow>
            <FieldRow label="Sync menu automatically">
              <div className="flex items-center gap-2">
                <Toggle checked={syncMenu} onChange={setSyncMenu} />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {syncMenu ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </FieldRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {status.connected && (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Delivery: DoorDash ───────────────────────────────────────────────────────

function DoorDashCard({
  status,
  onRefresh,
}: {
  status: IntegrationsStatus['doordash'];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [storeId, setStoreId] = useState(status.storeId ?? '');
  const [autoAccept, setAutoAccept] = useState(status.autoAccept ?? false);
  const [syncMenu, setSyncMenu] = useState(status.syncMenu ?? false);
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('integrations/doordash', {
        method: 'PUT',
        body: JSON.stringify({ apiKey: apiKey || undefined, storeId, autoAccept, syncMenu }),
      });
      toast({ title: 'DoorDash settings saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/doordash', { method: 'DELETE' });
      toast({ title: 'DoorDash disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect DoorDash?"
          message="Orders from DoorDash will no longer flow into your POS. You can reconnect at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-xl dark:bg-red-900/20">
              🚗
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">DoorDash</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Delivery</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Accept and manage DoorDash delivery orders directly from the POS.
          </p>
          <div className="space-y-4">
            <FieldRow label="Store ID">
              <input
                type="text"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="e.g. store_12345"
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={status.connected ? '••••••••••••' : 'Paste your DoorDash API key'}
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Auto-accept orders">
              <div className="flex items-center gap-2">
                <Toggle checked={autoAccept} onChange={setAutoAccept} />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {autoAccept ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </FieldRow>
            <FieldRow label="Sync menu automatically">
              <div className="flex items-center gap-2">
                <Toggle checked={syncMenu} onChange={setSyncMenu} />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {syncMenu ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </FieldRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {status.connected && (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Delivery: Menulog ────────────────────────────────────────────────────────

function MenulogCard({
  status,
  onRefresh,
}: {
  status: IntegrationsStatus['menulog'];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [storeId, setStoreId] = useState(status.storeId ?? '');
  const [autoAccept, setAutoAccept] = useState(status.autoAccept ?? false);
  const [syncMenu, setSyncMenu] = useState(status.syncMenu ?? false);
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('integrations/menulog', {
        method: 'PATCH',
        body: JSON.stringify({ storeId, autoAccept, syncMenu }),
      });
      toast({ title: 'Menulog settings saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/menulog', { method: 'DELETE' });
      toast({ title: 'Menulog disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect Menulog?"
          message="Orders from Menulog will no longer flow into your POS. You can reconnect at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-xl dark:bg-red-900/20">
              🔴
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Menulog</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Delivery</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Accept Menulog orders directly in your POS without a separate tablet.
          </p>
          <div className="space-y-4">
            <FieldRow label="Store ID">
              <input
                type="text"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="e.g. ml_abc123"
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Auto-accept orders">
              <div className="flex items-center gap-2">
                <Toggle checked={autoAccept} onChange={setAutoAccept} />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {autoAccept ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </FieldRow>
            <FieldRow label="Sync menu automatically">
              <div className="flex items-center gap-2">
                <Toggle checked={syncMenu} onChange={setSyncMenu} />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {syncMenu ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </FieldRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {status.connected && (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Delivery: Deliveroo ──────────────────────────────────────────────────────

function DeliverooCard({
  status,
  onRefresh,
}: {
  status: IntegrationsStatus['deliveroo'];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [storeId, setStoreId] = useState(status.storeId ?? '');
  const [autoAccept, setAutoAccept] = useState(status.autoAccept ?? false);
  const [syncMenu, setSyncMenu] = useState(status.syncMenu ?? false);
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('integrations/deliveroo', {
        method: 'PATCH',
        body: JSON.stringify({ storeId, autoAccept, syncMenu }),
      });
      toast({ title: 'Deliveroo settings saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/deliveroo', { method: 'DELETE' });
      toast({ title: 'Deliveroo disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect Deliveroo?"
          message="Orders from Deliveroo will no longer flow into your POS. You can reconnect at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-xl dark:bg-cyan-900/20">
              🩵
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Deliveroo</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Delivery</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Accept and manage Deliveroo orders directly from the POS.
          </p>
          <div className="space-y-4">
            <FieldRow label="Store ID">
              <input
                type="text"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="e.g. droo_12345"
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Auto-accept orders">
              <div className="flex items-center gap-2">
                <Toggle checked={autoAccept} onChange={setAutoAccept} />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {autoAccept ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </FieldRow>
            <FieldRow label="Sync menu automatically">
              <div className="flex items-center gap-2">
                <Toggle checked={syncMenu} onChange={setSyncMenu} />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {syncMenu ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </FieldRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {status.connected && (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Payroll: STP ─────────────────────────────────────────────────────────────

function STPCard({ status, onRefresh }: { status: IntegrationsStatus['stp']; onRefresh: () => void }) {
  const { toast } = useToast();
  const [abn, setAbn] = useState(status.abn ?? '');
  const [softwareId, setSoftwareId] = useState(status.softwareId ?? '');
  const [branchNumber, setBranchNumber] = useState(status.branchNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('integrations/stp', {
        method: 'PUT',
        body: JSON.stringify({ abn, softwareId, branchNumber }),
      });
      toast({ title: 'STP settings saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save STP settings', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!abn || !softwareId) {
      toast({ title: 'Missing fields', description: 'ABN and Software ID are required before submitting.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('integrations/stp/submit', { method: 'POST' });
      toast({ title: 'Payroll event submitted', description: 'Your STP event has been submitted to the ATO.', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Submission failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-xl dark:bg-amber-900/20">
            🏛️
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">ATO Single Touch Payroll</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Payroll / STP Phase 2</p>
          </div>
        </div>
        <StatusBadge
          connected={status.configured}
          label={status.configured ? 'Configured' : 'Not configured'}
        />
      </div>

      <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Report payroll information directly to the ATO each pay run via Single Touch Payroll Phase 2.
        </p>
        <div className="space-y-4">
          <FieldRow label="ABN">
            <input
              type="text"
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              placeholder="e.g. 12 345 678 901"
              className={inputCls()}
            />
          </FieldRow>
          <FieldRow label="Software ID">
            <input
              type="text"
              value={softwareId}
              onChange={(e) => setSoftwareId(e.target.value)}
              placeholder="Provided by your DSP"
              className={inputCls()}
            />
          </FieldRow>
          <FieldRow label="Branch number">
            <input
              type="text"
              value={branchNumber}
              onChange={(e) => setBranchNumber(e.target.value)}
              placeholder="e.g. 001"
              className={inputCls()}
            />
          </FieldRow>
          {status.lastSubmission && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">Last submission:</span>{' '}
              {new Date(status.lastSubmission).toLocaleString('en-AU')}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save Settings
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          {submitting ? 'Submitting…' : 'Submit Payroll Event'}
        </button>
      </div>
    </div>
  );
}

// ─── Email: Mailchimp ─────────────────────────────────────────────────────────

function MailchimpCard({ status, onRefresh }: { status: IntegrationsStatus['mailchimp']; onRefresh: () => void }) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [listId, setListId] = useState(status.listId ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('integrations/mailchimp', {
        method: 'PUT',
        body: JSON.stringify({ apiKey: apiKey || undefined, listId }),
      });
      toast({ title: 'Mailchimp settings saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/mailchimp', { method: 'DELETE' });
      toast({ title: 'Mailchimp disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect Mailchimp?"
          message="Customer sync to Mailchimp will stop. Your existing Mailchimp data will not be removed."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-50 text-xl dark:bg-yellow-900/20">
              🐒
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Mailchimp</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Email Marketing</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Sync customer lists and purchase data to Mailchimp for targeted email campaigns.
          </p>
          <div className="space-y-4">
            <FieldRow label="API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={status.connected ? '••••••••••••' : 'Paste your Mailchimp API key'}
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Audience / List ID">
              <input
                type="text"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                placeholder="e.g. abc123def"
                className={inputCls()}
              />
            </FieldRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {status.connected && (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Email: Klaviyo ───────────────────────────────────────────────────────────

function KlaviyoCard({ status, onRefresh }: { status: IntegrationsStatus['klaviyo']; onRefresh: () => void }) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('integrations/klaviyo', {
        method: 'PUT',
        body: JSON.stringify({ apiKey: apiKey || undefined }),
      });
      toast({ title: 'Klaviyo settings saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/klaviyo', { method: 'DELETE' });
      toast({ title: 'Klaviyo disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect Klaviyo?"
          message="Customer sync to Klaviyo will stop. Your existing Klaviyo profiles and flows will not be affected."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-xl dark:bg-green-900/20">
              📧
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Klaviyo</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Email Marketing</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Sync purchase events and customer profiles to Klaviyo for advanced email and SMS automation.
          </p>
          <div className="space-y-4">
            <FieldRow label="Private API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={status.connected ? '••••••••••••' : 'Paste your Klaviyo private key'}
                className={inputCls()}
              />
            </FieldRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {status.connected && (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── SMS: Twilio ──────────────────────────────────────────────────────────────

function TwilioCard({ status, onRefresh }: { status: IntegrationsStatus['twilio']; onRefresh: () => void }) {
  const { toast } = useToast();
  const [accountSid, setAccountSid] = useState(status.accountSid ?? '');
  const [authToken, setAuthToken] = useState('');
  const [fromNumber, setFromNumber] = useState(status.fromNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('integrations/twilio', {
        method: 'PUT',
        body: JSON.stringify({ accountSid, authToken: authToken || undefined, fromNumber }),
      });
      toast({ title: 'Twilio settings saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/twilio', { method: 'DELETE' });
      toast({ title: 'Twilio disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect Twilio?"
          message="SMS notifications via Twilio will stop. Your Twilio account and numbers will not be affected."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-xl dark:bg-red-900/20">
              💬
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Twilio</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">SMS</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Send SMS order confirmations, receipts, and marketing messages via Twilio.
          </p>
          <div className="space-y-4">
            <FieldRow label="Account SID">
              <input
                type="text"
                value={accountSid}
                onChange={(e) => setAccountSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Auth Token">
              <input
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder={status.connected ? '••••••••••••' : 'Paste your auth token'}
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="From number">
              <input
                type="text"
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                placeholder="+61400000000"
                className={inputCls()}
              />
            </FieldRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {status.connected && (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── SMS: MessageBird ─────────────────────────────────────────────────────────

function MessageBirdCard({ status, onRefresh }: { status: IntegrationsStatus['messagebird']; onRefresh: () => void }) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [fromName, setFromName] = useState(status.fromName ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('integrations/messagebird', {
        method: 'PUT',
        body: JSON.stringify({ apiKey: apiKey || undefined, fromName }),
      });
      toast({ title: 'MessageBird settings saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/messagebird', { method: 'DELETE' });
      toast({ title: 'MessageBird disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect MessageBird?"
          message="SMS notifications via MessageBird will stop. Your MessageBird account will not be affected."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl dark:bg-blue-900/20">
              🐦
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">MessageBird</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">SMS</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Send SMS order notifications and receipts to customers via MessageBird.
          </p>
          <div className="space-y-4">
            <FieldRow label="API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={status.connected ? '••••••••••••' : 'Paste your MessageBird API key'}
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Sender name">
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="e.g. MyStore"
                className={inputCls()}
              />
            </FieldRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {status.connected && (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Staff Scheduling: Deputy ─────────────────────────────────────────────────

function DeputyCard({
  status,
  onRefresh,
}: {
  status: IntegrationsStatus['deputy'];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await apiFetch<{ authUrl: string }>('integrations/deputy/connect');
      window.location.href = res.authUrl;
    } catch (err) {
      toast({ title: 'Failed to start Deputy connection', description: getErrorMessage(err), variant: 'destructive' });
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await apiFetch('integrations/deputy/sync', { method: 'POST' });
      toast({ title: 'Deputy sync started', description: 'Shifts and timesheets are syncing in the background.', variant: 'success' });
    } catch (err) {
      toast({ title: 'Sync failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('integrations/deputy', { method: 'DELETE' });
      toast({ title: 'Deputy disconnected', variant: 'default' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect Deputy?"
          message="Shift and timesheet syncing between Deputy and ElevatedPOS will stop. You can reconnect at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl dark:bg-blue-900/20">
              🟦
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Deputy</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Staff Scheduling</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 pb-3 pt-3 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sync shifts and timesheets between Deputy and ElevatedPOS.
          </p>
          {status.connected && (
            <div className="mt-3 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
              {status.businessId && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Business ID:</span> {status.businessId}
                </p>
              )}
              {status.lastSync && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Last sync:</span>{' '}
                  {new Date(status.lastSync).toLocaleString('en-AU')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          {status.connected ? (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync Shifts
              </button>
              <button
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnecting}
                className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {connecting ? 'Redirecting…' : 'Connect with Deputy'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Payment Terminals: Tyro EFTPOS ──────────────────────────────────────────

function TyroCard({ status, onRefresh }: { status: IntegrationsStatus['tyro']; onRefresh: () => void }) {
  const { toast } = useToast();
  const [merchantId, setMerchantId] = useState(status.merchantId ?? '');
  const [terminalId, setTerminalId] = useState(status.terminalId ?? '');
  const [surchargeToggle, setSurchargeToggle] = useState(status.tyroHandlesSurcharge ?? false);
  const [saving, setSaving] = useState(false);
  const [pairing, setPairing] = useState(false);

  async function handleSave() {
    if (!merchantId || !terminalId) {
      toast({ title: 'Missing Fields', description: 'Merchant ID and Terminal ID are required.', variant: 'destructive' });
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
          metadata: {
            merchantId,
            terminalId,
            tyroHandlesSurcharge: surchargeToggle,
          },
        }),
      });
      toast({ title: 'Tyro Saved', description: 'Terminal paired. Merchant ID: ' + merchantId, variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Save Failed', description: err instanceof Error ? err.message : 'Could not save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handlePair() {
    setPairing(true);
    try {
      const { loadTyroScript, pairTyroTerminal } = await import('@/lib/tyro-provider');
      await loadTyroScript(true);
      // API key comes from server env (TYRO_API_KEY), not from merchant
      const configRes = await fetch('/api/tyro/config');
      const configData = await configRes.json();
      const result = await pairTyroTerminal({
        apiKey: configData.apiKey ?? '',
        merchantId,
        terminalId,
        testMode: configData.testMode ?? true,
        tyroHandlesSurcharge: surchargeToggle,
      });
      if (result.status === 'success') {
        toast({ title: 'Paired', description: 'Tyro terminal paired successfully.', variant: 'success' });
      } else {
        toast({ title: 'Pairing Failed', description: result.message ?? 'Could not pair terminal.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Pairing Error', description: err instanceof Error ? err.message : 'Pairing failed', variant: 'destructive' });
    } finally {
      setPairing(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Tyro EFTPOS</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Payment Terminal</p>
          </div>
        </div>
        <StatusBadge connected={status.connected} />
      </div>
      <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Integrated EFTPOS with Tyro terminals. Browser-based — no IP required.
        </p>
        <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Merchant ID</label>
            <input
              value={merchantId}
              onChange={e => setMerchantId(e.target.value)}
              placeholder="e.g. 400012345"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Terminal ID</label>
            <input
              value={terminalId}
              onChange={e => setTerminalId(e.target.value)}
              placeholder="e.g. 1"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
          <div>
            <p className="text-sm text-white">Tyro handles surcharging</p>
            <p className="text-xs text-gray-500">Let the terminal apply card surcharges (ACCC compliant)</p>
          </div>
          <button
            onClick={() => setSurchargeToggle(!surchargeToggle)}
            className={`relative h-6 w-11 rounded-full transition-colors ${surchargeToggle ? 'bg-indigo-600' : 'bg-gray-700'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${surchargeToggle ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handlePair}
            disabled={pairing || !merchantId || !terminalId}
            className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-gray-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50"
          >
            {pairing ? 'Pairing...' : 'Pair Terminal'}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Terminals: ANZ Worldline ────────────────────────────────────────

function ANZWorldlineCard({ status, onRefresh }: { status: IntegrationsStatus['anzWorldline']; onRefresh: () => void }) {
  const { toast } = useToast();
  const [terminalIp, setTerminalIp] = useState(status.terminalIp ?? '');
  const [terminalPort, setTerminalPort] = useState<string>(String(status.terminalPort ?? 4100));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Fetch existing credentials on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch<{ terminalIp?: string; terminalPort?: number }>('terminal/credentials');
        if (!cancelled && res.terminalIp) {
          setTerminalIp(res.terminalIp);
          if (res.terminalPort) setTerminalPort(String(res.terminalPort));
        }
      } catch {
        // No credentials saved yet — ignore
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    if (!terminalIp.trim()) {
      toast({ title: 'Terminal IP is required', variant: 'destructive' });
      return;
    }
    const port = Number(terminalPort);
    if (!port || port < 1 || port > 65535) {
      toast({ title: 'Enter a valid port number (1–65535)', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('terminal/credentials', {
        method: 'POST',
        body: JSON.stringify({ terminalIp: terminalIp.trim(), terminalPort: port }),
      });
      toast({ title: 'ANZ Worldline credentials saved', variant: 'success' });
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await apiFetch('terminal/anz/test', { method: 'POST' });
      toast({ title: 'Connection successful', description: 'ANZ Worldline terminal is reachable.', variant: 'success' });
    } catch (err) {
      toast({ title: 'Connection failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await apiFetch('terminal/credentials', { method: 'DELETE' });
      toast({ title: 'ANZ Worldline disconnected', variant: 'default' });
      setTerminalIp('');
      setTerminalPort('4100');
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {confirmDisconnect && (
        <ConfirmModal
          title="Disconnect ANZ Worldline?"
          message="The saved terminal credentials will be removed. You can reconfigure at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">ANZ Worldline</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Payment Terminal</p>
            </div>
          </div>
          <StatusBadge connected={status.connected} />
        </div>

        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Connect your ANZ Worldline EFTPOS terminal to accept card payments directly from the POS.
          </p>
          <div className="space-y-4">
            <FieldRow label="Terminal IP Address">
              <input
                type="text"
                value={terminalIp}
                onChange={(e) => setTerminalIp(e.target.value)}
                placeholder="e.g. 192.168.1.100"
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Terminal Port">
              <input
                type="number"
                value={terminalPort}
                onChange={(e) => setTerminalPort(e.target.value)}
                placeholder="4100"
                min={1}
                max={65535}
                className={inputCls()}
              />
            </FieldRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {status.connected && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-60"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Test Connection
            </button>
          )}
          {status.connected && (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="flex items-center gap-1 ml-auto text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Default status ───────────────────────────────────────────────────────────

const DEFAULT_STATUS: IntegrationsStatus = {
  xero: { connected: false },
  myob: { connected: false },
  quickbooks: { connected: false },
  ubereats: { connected: false, storeId: null },
  doordash: { connected: false, storeId: null },
  menulog: { connected: false, storeId: null },
  deliveroo: { connected: false, storeId: null },
  stp: { configured: false },
  mailchimp: { connected: false },
  klaviyo: { connected: false },
  twilio: { connected: false },
  messagebird: { connected: false },
  deputy: { connected: false },
  anzWorldline: { connected: false },
  tyro: { connected: false },
};

// ─── Root component ───────────────────────────────────────────────────────────

export function IntegrationsClient() {
  const [status, setStatus] = useState<IntegrationsStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch<Partial<IntegrationsStatus>>('integrations/status');
      setStatus((prev) => ({ ...prev, ...res }));
    } catch (err) {
      toast({ title: 'Could not load integration status', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const connectedCount = [
    status.xero.connected,
    status.myob.connected,
    status.quickbooks.connected,
    status.ubereats.connected,
    status.doordash.connected,
    status.menulog.connected,
    status.deliveroo.connected,
    status.stp.configured,
    status.mailchimp.connected,
    status.klaviyo.connected,
    status.twilio.connected,
    status.messagebird.connected,
    status.deputy.connected,
    status.anzWorldline.connected,
  ].filter(Boolean).length;

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Integrations</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading…' : `${connectedCount} active · connect your tools to automate your workflow`}
          </p>
        </div>
        <a
          href="https://developers.elevatedpos.com.au/api-reference"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          <Zap className="h-4 w-4" />
          API docs
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* ── Accounting ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={<Calculator className="h-5 w-5" />}
          title="Accounting"
          description="Sync sales and payment data with your accounting software."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <XeroCard status={status.xero} onRefresh={fetchStatus} />
          <MYOBCard status={status.myob} onRefresh={fetchStatus} />
          <QuickBooksCard status={status.quickbooks} onRefresh={fetchStatus} />
        </div>
      </section>

      {/* ── Payment Terminals ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={<CreditCard className="h-5 w-5" />}
          title="Payment Terminals"
          description="Connect EFTPOS and card terminals for in-store payments."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TyroCard status={status.tyro} onRefresh={fetchStatus} />
          <ANZWorldlineCard status={status.anzWorldline} onRefresh={fetchStatus} />
        </div>
      </section>

      {/* ── Delivery ───────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={<Truck className="h-5 w-5" />}
          title="Delivery"
          description="Accept online delivery orders directly in your POS."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <UberEatsCard status={status.ubereats} onRefresh={fetchStatus} />
          <DoorDashCard status={status.doordash} onRefresh={fetchStatus} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MenulogCard status={status.menulog} onRefresh={fetchStatus} />
          <DeliverooCard status={status.deliveroo} onRefresh={fetchStatus} />
        </div>
      </section>

      {/* ── Payroll ────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={<FileText className="h-5 w-5" />}
          title="Payroll"
          description="Report payroll events directly to the ATO via Single Touch Payroll."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <STPCard status={status.stp} onRefresh={fetchStatus} />
        </div>
      </section>

      {/* ── Email & SMS ────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={<Mail className="h-5 w-5" />}
          title="Email & SMS"
          description="Sync customers and send transactional or marketing messages."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <MailchimpCard status={status.mailchimp} onRefresh={fetchStatus} />
          <KlaviyoCard status={status.klaviyo} onRefresh={fetchStatus} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TwilioCard status={status.twilio} onRefresh={fetchStatus} />
          <MessageBirdCard status={status.messagebird} onRefresh={fetchStatus} />
        </div>
      </section>

      {/* ── Staff Scheduling ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={<CalendarCheck className="h-5 w-5" />}
          title="Staff Scheduling"
          description="Sync shifts and timesheets with your workforce management platform."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <DeputyCard status={status.deputy} onRefresh={fetchStatus} />
        </div>
      </section>
    </div>
  );
}
