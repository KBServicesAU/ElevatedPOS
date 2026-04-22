'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Smartphone, Plus, Trash2, RefreshCw, Monitor, ChefHat,
  Tablet, Clock, Wifi, WifiOff, Copy, Check, Settings2,
  CreditCard, Banknote, Gift, Users, Package, Wallet,
  Save, ChevronDown, ChevronUp,
  Monitor as DisplayIcon, Image, Eye, RotateCcw, PowerOff,
  CheckCircle2, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type DeviceRole   = 'pos' | 'kds' | 'kiosk' | 'customer-display' | 'dashboard' | 'display';
type DeviceStatus = 'active' | 'revoked';

interface Device {
  id:          string;
  role:        DeviceRole;
  locationId:  string;
  registerId:  string | null;
  label:       string | null;
  platform:    string | null;
  appVersion:  string | null;
  lastSeenAt:  string | null;
  status:      DeviceStatus;
  createdAt:   string;
}

interface PairingCode {
  id:         string;
  code:       string;
  role:       DeviceRole;
  locationId: string;
  label:      string | null;
  expiresAt:  string;
}

interface Location {
  id:   string;
  name: string;
}

interface DevicePaymentConfig {
  enabledMethods:       string[];
  terminalCredentialId: string | null;
}

interface TerminalCredential {
  id:           string;
  provider:     string;
  label:        string | null;
  terminalIp:   string | null;
  terminalPort: number | null;
  isActive:     boolean;
}

interface CustomerDisplaySettings {
  welcomeMessage:  string;
  thankYouMessage: string;
  showLogo:        boolean;
  showLineItems:   boolean;
  showGst:         boolean;
}

// ─── Payment method definitions ───────────────────────────────────────────────

const PAYMENT_METHODS = [
  { id: 'cash',     label: 'Cash',           desc: 'Physical cash payments',      Icon: Banknote,   posDefault: true,  kioskDefault: false },
  { id: 'card',     label: 'Card (EFTPOS)',  desc: 'Credit & debit via terminal', Icon: CreditCard, posDefault: true,  kioskDefault: true  },
  { id: 'giftcard', label: 'Gift Card',      desc: 'ElevatedPOS gift cards',      Icon: Gift,       posDefault: true,  kioskDefault: true  },
  { id: 'account',  label: 'Account Credit', desc: 'Customer account balance',    Icon: Users,      posDefault: false, kioskDefault: false },
  { id: 'layby',    label: 'Lay-by',         desc: 'Deposit & pay over time',     Icon: Package,    posDefault: false, kioskDefault: false },
  { id: 'bnpl',     label: 'BNPL',           desc: 'Afterpay, Zip, Humm',         Icon: Wallet,     posDefault: false, kioskDefault: false },
] as const;

const DEFAULT_METHODS: Record<string, string[]> = {
  pos:               ['cash', 'card', 'giftcard'],
  kds:               [],
  kiosk:             ['card', 'giftcard'],
  'customer-display': [],
  dashboard:          [],
  display:            [],
};

// ─── Terminal credential formatting ───────────────────────────────────────────

const PROVIDER_LABEL: Record<string, string> = {
  anz:     'ANZ Worldline',
  tyro:    'Tyro',
  stripe:  'Stripe Terminal',
  windcave:'Windcave',
};

function formatCredentialName(c: TerminalCredential): string {
  if (c.label && c.label.trim()) return c.label.trim();
  return PROVIDER_LABEL[c.provider] ?? c.provider.toUpperCase();
}

/** Short one-line summary of a terminal for the device row and dropdown. */
function formatCredentialSummary(c: TerminalCredential): string {
  const name = formatCredentialName(c);
  if (c.terminalIp) {
    const portSuffix = c.terminalPort ? `:${c.terminalPort}` : '';
    return `${name} (${c.terminalIp}${portSuffix})`;
  }
  return name;
}

// ─── Health indicator ─────────────────────────────────────────────────────────

function healthDot(lastSeenAt: string | null): { color: string; label: string } {
  if (!lastSeenAt) return { color: 'bg-gray-600', label: 'Never seen' };
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  if (diffMs < 60_000)  return { color: 'bg-green-500',  label: 'Online' };
  if (diffMs < 5 * 60_000) return { color: 'bg-yellow-500', label: 'Recently online' };
  return { color: 'bg-red-500', label: 'Offline' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: DeviceRole }) {
  const map: Record<DeviceRole, { label: string; className: string; Icon: React.ElementType }> = {
    pos:               { label: 'POS',       className: 'bg-indigo-900 text-indigo-300 border border-indigo-700',   Icon: Monitor       },
    kds:               { label: 'KDS',       className: 'bg-orange-900 text-orange-300 border border-orange-700',   Icon: ChefHat       },
    kiosk:             { label: 'Kiosk',     className: 'bg-teal-900   text-teal-300   border border-teal-700',     Icon: Tablet        },
    'customer-display': { label: 'Display',  className: 'bg-purple-900 text-purple-300 border border-purple-700',   Icon: DisplayIcon   },
    dashboard:         { label: 'Dashboard', className: 'bg-blue-900   text-blue-300   border border-blue-700',     Icon: Smartphone    },
    display:           { label: 'Signage',   className: 'bg-cyan-900   text-cyan-300   border border-cyan-700',     Icon: DisplayIcon   },
  };
  const cfg = map[role] ?? map['pos'];
  const { label, className, Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${className}`}>
      <Icon className="h-3 w-3" />{label}
    </span>
  );
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secs]);
  if (secs <= 0) return <span className="text-red-400 text-xs font-semibold">Expired</span>;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className={`text-xs font-mono font-bold ${secs < 60 ? 'text-red-400' : 'text-yellow-400'}`}>
      {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DevicesClient() {
  const { toast } = useToast();

  // — existing state —
  const [activeTab, setActiveTab]     = useState<'devices' | 'pair'>('devices');
  const [devices,   setDevices]       = useState<Device[]>([]);
  const [codes,     setCodes]         = useState<PairingCode[]>([]);
  const [locations, setLocations]     = useState<Location[]>([]);
  const [loading,   setLoading]       = useState(true);
  const [revoking,  setRevoking]      = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode]   = useState<string | null>(null);

  const [genRole,       setGenRole]       = useState<DeviceRole>('pos');
  const [genLocationId, setGenLocationId] = useState('');
  const [genLabel,      setGenLabel]      = useState('');
  const [generating,    setGenerating]    = useState(false);
  const [genError,      setGenError]      = useState<string | null>(null);
  const [latestCode,    setLatestCode]    = useState<PairingCode | null>(null);

  // — payment config state —
  const [deviceConfigs,    setDeviceConfigs]   = useState<Record<string, DevicePaymentConfig>>({});
  const [configuringId,    setConfiguringId]   = useState<string | null>(null);
  const [draftConfig,      setDraftConfig]     = useState<DevicePaymentConfig | null>(null);
  const [savingConfig,     setSavingConfig]    = useState(false);
  const [configError,      setConfigError]     = useState<string | null>(null);

  // — terminal credentials (for per-device assignment) —
  const [terminalCredentials, setTerminalCredentials] = useState<TerminalCredential[]>([]);

  // — customer display config state —
  const [displayConfiguringId, setDisplayConfiguringId] = useState<string | null>(null);
  const [draftDisplay, setDraftDisplay] = useState<CustomerDisplaySettings>({
    welcomeMessage: '', thankYouMessage: 'Thank you for your order!',
    showLogo: false, showLineItems: true, showGst: true,
  });
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);

  // — remote restart state —
  const [confirmRestartId, setConfirmRestartId] = useState<string | null>(null);
  const [restarting, setRestarting] = useState<string | null>(null);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadDevices   = useCallback(async () => { try { const r = await apiFetch<{ data: Device[] }>('devices'); setDevices(r.data ?? []); } catch { /**/ } }, []);
  const loadCodes     = useCallback(async () => { try { const r = await apiFetch<{ data: PairingCode[] }>('devices/pairing-codes'); setCodes(r.data ?? []); } catch { /**/ } }, []);
  const loadLocations = useCallback(async () => { try { const r = await apiFetch<{ data?: Location[] } | Location[]>('locations'); setLocations(Array.isArray(r) ? r : (r.data ?? [])); } catch { /**/ } }, []);

  const loadDeviceConfigs = useCallback(async () => {
    try {
      const r = await apiFetch<{ data: Array<{ deviceId: string; enabledMethods: string[]; terminalCredentialId: string | null }> }>('terminal/device-config');
      const map: Record<string, DevicePaymentConfig> = {};
      for (const c of r.data ?? []) {
        map[c.deviceId] = { enabledMethods: c.enabledMethods, terminalCredentialId: c.terminalCredentialId };
      }
      setDeviceConfigs(map);
    } catch { /**/ }
  }, []);

  const loadTerminalCredentials = useCallback(async () => {
    try {
      const r = await apiFetch<{
        data?: Array<{
          id:            string;
          provider:      string;
          label?:        string | null;
          terminalIp?:   string | null;
          terminalPort?: number | null;
          isActive?:     boolean;
        }>;
      }>('terminal/credentials');
      const rows = (r.data ?? [])
        .filter((c) => c.isActive !== false)
        .map((c): TerminalCredential => ({
          id:           c.id,
          provider:     c.provider,
          label:        c.label ?? null,
          terminalIp:   c.terminalIp ?? null,
          terminalPort: c.terminalPort ?? null,
          isActive:     c.isActive !== false,
        }));
      setTerminalCredentials(rows);
    } catch { /* silent — dialog will render the empty state */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDevices(), loadCodes(), loadLocations(), loadDeviceConfigs(), loadTerminalCredentials()])
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Revoke ───────────────────────────────────────────────────────────────

  async function handleRevoke(id: string) {
    setConfirmRevokeId(null);
    setRevoking(id);
    try {
      await apiFetch(`devices/${id}`, { method: 'DELETE' });
      setDevices((prev) => prev.map((d) => d.id === id ? { ...d, status: 'revoked' as DeviceStatus } : d));
    } catch { /**/ } finally { setRevoking(null); }
  }

  // ── Remote Restart ────────────────────────────────────────────────────────

  async function handleRestart(id: string) {
    setConfirmRestartId(null);
    setRestarting(id);
    try {
      await apiFetch(`devices/${id}/restart`, { method: 'POST' });
      toast({ title: 'Restart signal sent', description: 'The device will restart shortly.', variant: 'success' });
    } catch (err) {
      toast({ title: 'Restart failed', description: err instanceof Error ? err.message : 'Could not send restart signal.', variant: 'destructive' });
    } finally { setRestarting(null); }
  }

  // ── Pairing code ─────────────────────────────────────────────────────────

  async function handleGenerateCode(e: React.FormEvent) {
    e.preventDefault();
    if (!genLocationId) return;
    setGenerating(true); setGenError(null);
    try {
      const res = await apiFetch<{ data: PairingCode }>('devices/pairing-codes', {
        method: 'POST',
        body: JSON.stringify({ role: genRole, locationId: genLocationId, label: genLabel || undefined }),
      });
      setLatestCode(res.data);
      setCodes((prev) => [res.data, ...prev]);
      setGenLabel('');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate code');
    } finally { setGenerating(false); }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  // ── Payment config ────────────────────────────────────────────────────────

  function openConfig(device: Device) {
    const existing = deviceConfigs[device.id];
    setDraftConfig(existing ?? { enabledMethods: DEFAULT_METHODS[device.role] ?? [], terminalCredentialId: null });
    setConfiguringId(device.id);
    setConfigError(null);
    // close display panel if open
    setDisplayConfiguringId(null);
  }

  function closeConfig() {
    setConfiguringId(null);
    setDraftConfig(null);
    setConfigError(null);
  }

  function toggleMethod(methodId: string) {
    if (!draftConfig) return;
    const has = draftConfig.enabledMethods.includes(methodId);
    setDraftConfig({
      ...draftConfig,
      enabledMethods: has
        ? draftConfig.enabledMethods.filter((m) => m !== methodId)
        : [...draftConfig.enabledMethods, methodId],
      terminalCredentialId: !has || methodId !== 'card' ? draftConfig.terminalCredentialId : null,
    });
  }

  async function saveConfig(deviceId: string) {
    if (!draftConfig) return;
    setSavingConfig(true); setConfigError(null);
    try {
      await apiFetch(`terminal/device-config/${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify(draftConfig),
      });
      setDeviceConfigs((prev) => ({ ...prev, [deviceId]: draftConfig }));
      toast({ title: 'Configuration saved', description: 'Payment settings updated for this device.', variant: 'success' });
      closeConfig();
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally { setSavingConfig(false); }
  }

  // ── Customer Display config ───────────────────────────────────────────────

  function openDisplayConfig(device: Device) {
    setDisplayConfiguringId(device.id);
    setDraftDisplay({ welcomeMessage: '', thankYouMessage: 'Thank you for your order!', showLogo: false, showLineItems: true, showGst: true });
    setDisplayError(null);
    // close payment panel if open
    setConfiguringId(null);
    setDraftConfig(null);
  }

  function closeDisplayConfig() {
    setDisplayConfiguringId(null);
    setDisplayError(null);
  }

  async function saveDisplayConfig(deviceId: string) {
    setSavingDisplay(true); setDisplayError(null);
    try {
      await apiFetch(`devices/${deviceId}/settings`, {
        method: 'PUT',
        body: JSON.stringify(draftDisplay),
      });
      toast({ title: 'Display settings saved', description: 'Customer display configuration updated.', variant: 'success' });
      closeDisplayConfig();
    } catch (err) {
      setDisplayError(err instanceof Error ? err.message : 'Failed to save display settings');
    } finally { setSavingDisplay(false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeDevices  = devices.filter((d) => d.status === 'active');
  const revokedDevices = devices.filter((d) => d.status === 'revoked');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smartphone className="h-6 w-6 text-indigo-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Devices</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage paired POS, KDS, Kiosk and Customer Display devices</p>
          </div>
        </div>
        <button
          onClick={() => { void loadDevices(); void loadCodes(); void loadDeviceConfigs(); void loadTerminalCredentials(); }}
          className="flex items-center gap-1.5 rounded-xl bg-gray-100 dark:bg-[#2a2a3a] px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-gray-200 dark:border-[#2a2a3a]">
        {(['devices', 'pair'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {tab === 'devices' ? 'Paired Devices' : 'Generate Pairing Code'}
            {tab === 'devices' && activeDevices.length > 0 && (
              <span className="ml-2 rounded-full bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 text-xs text-indigo-700 dark:text-indigo-300">{activeDevices.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Devices tab ── */}
      {activeTab === 'devices' && (
        <div>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-[#2a2a3a]" />)}
            </div>
          ) : activeDevices.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-[#2a2a3a] py-16">
              <Smartphone className="h-12 w-12 text-gray-400 dark:text-gray-700 mb-3" />
              <p className="text-gray-500 dark:text-gray-500 font-medium">No paired devices yet</p>
              <p className="text-gray-500 dark:text-gray-600 text-sm mt-1">Generate a pairing code to connect a device</p>
              <button onClick={() => setActiveTab('pair')}
                className="mt-4 flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 transition-colors">
                <Plus className="h-4 w-4" />Generate Code
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeDevices.map((device) => {
                const isPayOpen    = configuringId === device.id;
                const isDispOpen   = displayConfiguringId === device.id;
                const hasConfig    = Boolean(deviceConfigs[device.id]);
                // v2.7.36 — whitelist the roles that actually accept
                // payments. Before this was blacklist-style
                // (`!== 'kds' && !== 'customer-display'`) which failed
                // open — a paired 'display' (signage) or 'dashboard'
                // device got a Payments config button even though they
                // never take card. Only POS and Kiosk tender money.
                const canConfig    = device.role === 'pos' || device.role === 'kiosk';
                const isDisplay    = device.role === 'customer-display';
                const health       = healthDot(device.lastSeenAt);
                const isRestarting = restarting === device.id;
                const confirmingRestart = confirmRestartId === device.id;

                // Terminal assignment indicator — only meaningful for devices that take card payments
                const cfg             = deviceConfigs[device.id];
                const cardEnabled     = cfg?.enabledMethods?.includes('card') ?? false;
                const assignedCred    = cfg?.terminalCredentialId
                  ? terminalCredentials.find((t) => t.id === cfg.terminalCredentialId)
                  : null;
                const showTerminalBadge = canConfig && cardEnabled;

                return (
                  <div key={device.id} className="rounded-xl overflow-hidden border border-transparent hover:border-gray-200 dark:hover:border-[#2a2a3a] transition-colors">
                    {/* Device row */}
                    <div className="flex items-center justify-between bg-gray-50 dark:bg-[#2a2a3a] px-4 py-3">
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Health dot with tooltip */}
                        <div className="relative group flex-shrink-0">
                          <div className={`h-2.5 w-2.5 rounded-full ${health.color}`} />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10">
                            <div className="rounded bg-gray-800 dark:bg-gray-900 px-2 py-1 text-xs text-white whitespace-nowrap shadow-lg border border-gray-600 dark:border-gray-700">
                              {health.label} — {timeAgo(device.lastSeenAt)}
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 dark:text-white text-sm">{device.label ?? 'Unnamed Device'}</span>
                            <RoleBadge role={device.role} />
                            {device.platform   && <span className="text-xs text-gray-500 dark:text-gray-500 capitalize">{device.platform}</span>}
                            {device.appVersion && <span className="text-xs text-gray-500 dark:text-gray-600">v{device.appVersion}</span>}
                            {hasConfig && canConfig && (
                              <span className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-full px-2 py-0.5">
                                Custom payments
                              </span>
                            )}
                            {showTerminalBadge && (
                              assignedCred ? (
                                <span
                                  title={`Assigned: ${formatCredentialSummary(assignedCred)}`}
                                  className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-full px-2 py-0.5"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Assigned — {formatCredentialName(assignedCred)}
                                  {assignedCred.terminalIp && (
                                    <span className="font-mono text-green-600 dark:text-green-400">
                                      ({assignedCred.terminalIp})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span
                                  title="No EFTPOS terminal assigned to this device"
                                  className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Not assigned
                                </span>
                              )
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{device.id.slice(0, 8)}…</span>
                            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
                              <Wifi className="h-3 w-3" />Last seen {timeAgo(device.lastSeenAt)}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
                              <Clock className="h-3 w-3" />Paired {timeAgo(device.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                        {/* Customer Display specific button */}
                        {isDisplay && (
                          <>
                            <button
                              onClick={() => window.open('/pos/customer-display', '_blank')}
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#3a3a4a] hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />Preview
                            </button>
                            <button
                              onClick={() => isDispOpen ? closeDisplayConfig() : openDisplayConfig(device)}
                              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                isDispOpen
                                  ? 'bg-purple-600 text-white'
                                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#3a3a4a] hover:text-gray-900 dark:hover:text-white'
                              }`}
                            >
                              <DisplayIcon className="h-3.5 w-3.5" />
                              Display
                              {isDispOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                          </>
                        )}

                        {/* Payment config button for POS / Kiosk */}
                        {canConfig && (
                          <button
                            onClick={() => isPayOpen ? closeConfig() : openConfig(device)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              isPayOpen
                                ? 'bg-indigo-500 text-white'
                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#3a3a4a] hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            Payments
                            {isPayOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        )}

                        {/* Remote Restart */}
                        {confirmingRestart ? (
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Restart device?</span>
                            <button
                              onClick={() => void handleRestart(device.id)}
                              disabled={isRestarting}
                              className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 disabled:opacity-50"
                            >
                              {isRestarting ? 'Sending…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmRestartId(null)}
                              className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmRestartId(device.id)}
                            disabled={isRestarting}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-yellow-600 dark:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-950 hover:text-yellow-700 dark:hover:text-yellow-300 transition-colors disabled:opacity-50"
                            title="Remote restart"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {isRestarting ? 'Restarting…' : 'Restart'}
                          </button>
                        )}

                        {/* Revoke */}
                        {confirmRevokeId === device.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Revoke device?</span>
                            <button
                              onClick={() => void handleRevoke(device.id)}
                              disabled={revoking === device.id}
                              className="text-xs font-semibold text-red-500 dark:text-red-400 hover:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                            >
                              {revoking === device.id ? 'Revoking…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmRevokeId(null)}
                              className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmRevokeId(device.id)}
                            disabled={revoking === device.id}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {revoking === device.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Customer Display config panel ── */}
                    {isDispOpen && (
                      <div className="bg-gray-50 dark:bg-[#1a1a2e] border-t border-gray-200 dark:border-[#2a2a3a] p-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">Customer Display Settings</p>
                          <button
                            onClick={() => window.open('/pos/customer-display', '_blank')}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />Preview in new tab
                          </button>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 block">Welcome Message</label>
                            <input
                              type="text"
                              value={draftDisplay.welcomeMessage}
                              onChange={(e) => setDraftDisplay({ ...draftDisplay, welcomeMessage: e.target.value })}
                              placeholder="Welcome!"
                              className="w-full rounded-xl bg-white dark:bg-[#1e1e2e] px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-[#3a3a4a] focus:border-purple-500 focus:outline-none"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-600 mt-1">Shown on the customer display when idle.</p>
                          </div>

                          <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 block mt-4">Thank-You Message</label>
                            <input
                              type="text"
                              value={draftDisplay.thankYouMessage}
                              onChange={(e) => setDraftDisplay({ ...draftDisplay, thankYouMessage: e.target.value })}
                              placeholder="Thank you for your order!"
                              className="w-full rounded-xl bg-white dark:bg-[#1e1e2e] px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-[#3a3a4a] focus:border-purple-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="flex items-center gap-3 cursor-pointer">
                              <div
                                onClick={() => setDraftDisplay({ ...draftDisplay, showLogo: !draftDisplay.showLogo })}
                                className={`relative h-5 w-9 rounded-full transition-colors ${draftDisplay.showLogo ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                              >
                                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${draftDisplay.showLogo ? 'translate-x-4' : 'translate-x-0.5'}`} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Show Logo</p>
                                <p className="text-xs text-gray-500 dark:text-gray-500">Display your store logo on the customer screen.</p>
                              </div>
                            </label>
                          </div>

                          <div>
                            <label className="flex items-center gap-3 cursor-pointer">
                              <div
                                onClick={() => setDraftDisplay({ ...draftDisplay, showLineItems: !draftDisplay.showLineItems })}
                                className={`relative h-5 w-9 rounded-full transition-colors ${draftDisplay.showLineItems ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                              >
                                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${draftDisplay.showLineItems ? 'translate-x-4' : 'translate-x-0.5'}`} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Show Line Items</p>
                                <p className="text-xs text-gray-500 dark:text-gray-500">Show individual items in the cart on the customer screen.</p>
                              </div>
                            </label>
                          </div>

                          <div>
                            <label className="flex items-center gap-3 cursor-pointer">
                              <div
                                onClick={() => setDraftDisplay({ ...draftDisplay, showGst: !draftDisplay.showGst })}
                                className={`relative h-5 w-9 rounded-full transition-colors ${draftDisplay.showGst ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                              >
                                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${draftDisplay.showGst ? 'translate-x-4' : 'translate-x-0.5'}`} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Show GST Breakdown</p>
                                <p className="text-xs text-gray-500 dark:text-gray-500">Display GST line on the customer screen.</p>
                              </div>
                            </label>
                          </div>
                        </div>

                        {displayError && (
                          <p className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded-xl px-4 py-2.5">{displayError}</p>
                        )}

                        <div className="flex items-center justify-end gap-2 mt-4">
                          <button onClick={closeDisplayConfig} className="rounded-xl px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                            Cancel
                          </button>
                          <button
                            onClick={() => void saveDisplayConfig(device.id)}
                            disabled={savingDisplay}
                            className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 transition-colors disabled:opacity-40"
                          >
                            <Save className="h-3.5 w-3.5" />
                            {savingDisplay ? 'Saving…' : 'Save Settings'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Payment config panel ── */}
                    {isPayOpen && draftConfig && (
                      <div className="bg-gray-50 dark:bg-[#1a1a2e] border-t border-gray-200 dark:border-[#2a2a3a] p-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">Payment Methods</p>
                          {device.role === 'kiosk' && (
                            <span className="text-xs text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 rounded-full px-2.5 py-0.5">
                              Self-service — cash not available
                            </span>
                          )}
                        </div>

                        {/* Method toggles — 2-column grid */}
                        <div className="grid grid-cols-2 gap-2 mb-5">
                          {PAYMENT_METHODS.map(({ id, label, desc, Icon }) => {
                            const isEnabled  = draftConfig.enabledMethods.includes(id);
                            const isDisabled = device.role === 'kiosk' && id === 'cash';
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => !isDisabled && toggleMethod(id)}
                                disabled={isDisabled}
                                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all border ${
                                  isEnabled
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-gray-900 dark:text-white'
                                    : 'bg-white dark:bg-[#2a2a3a] border-gray-200 dark:border-transparent text-gray-500 dark:text-gray-500 hover:border-gray-300 dark:hover:border-[#3a3a4a]'
                                } ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                <Icon className={`h-4 w-4 flex-shrink-0 ${isEnabled ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-600'}`} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold truncate">{label}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-600 truncate">{desc}</p>
                                </div>
                                <div className={`h-4 w-4 rounded-full flex-shrink-0 border-2 transition-colors ${isEnabled ? 'bg-indigo-500 border-indigo-400' : 'border-gray-300 dark:border-gray-600'}`} />
                              </button>
                            );
                          })}
                        </div>

                        {/* Terminal credential assignment — only shown when card payments are enabled */}
                        {draftConfig.enabledMethods.includes('card') && (
                          <div className="mb-5 rounded-xl border border-gray-200 dark:border-[#2a2a3a] bg-white dark:bg-[#1e1e2e] p-4">
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                <CreditCard className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                                EFTPOS Terminal
                              </label>
                              <Link
                                href="/dashboard/payments"
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 inline-flex items-center gap-1"
                              >
                                Manage terminals <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
                              Pick which physical EFTPOS terminal this device should pair with. Each device can only use one terminal at a time.
                            </p>

                            {terminalCredentials.length === 0 ? (
                              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="font-semibold">No terminal credentials configured.</p>
                                  <p className="mt-0.5">
                                    Add an EFTPOS terminal first, then return here to assign it.{' '}
                                    <Link href="/dashboard/payments" className="underline font-medium hover:text-amber-600 dark:hover:text-amber-200">
                                      Go to Payments settings →
                                    </Link>
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <select
                                value={draftConfig.terminalCredentialId ?? ''}
                                onChange={(e) => setDraftConfig({
                                  ...draftConfig,
                                  terminalCredentialId: e.target.value === '' ? null : e.target.value,
                                })}
                                className="w-full rounded-xl bg-white dark:bg-[#2a2a3a] px-3 py-2.5 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-[#3a3a4a] focus:border-indigo-500 focus:outline-none"
                              >
                                <option value="">Not assigned — don&apos;t route card payments to a terminal</option>
                                {terminalCredentials.map((c) => (
                                  <option key={c.id} value={c.id}>{formatCredentialSummary(c)}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {/* Error */}
                        {configError && (
                          <p className="mb-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded-xl px-4 py-2.5">{configError}</p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={closeConfig} className="rounded-xl px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                            Cancel
                          </button>
                          <button
                            onClick={() => void saveConfig(device.id)}
                            disabled={savingConfig || draftConfig.enabledMethods.length === 0}
                            className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 transition-colors disabled:opacity-40"
                          >
                            <Save className="h-3.5 w-3.5" />
                            {savingConfig ? 'Saving…' : 'Save Changes'}
                          </button>
                        </div>

                        {draftConfig.enabledMethods.length === 0 && (
                          <p className="mt-2 text-center text-xs text-yellow-600 dark:text-yellow-400">At least one payment method must be enabled.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Revoked devices */}
              {revokedDevices.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-400 transition-colors py-2">
                    {revokedDevices.length} revoked device{revokedDevices.length !== 1 ? 's' : ''}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {revokedDevices.map((device) => (
                      <div key={device.id} className="flex items-center gap-4 rounded-xl bg-gray-100 dark:bg-[#1a1a1a] px-4 py-3 opacity-50">
                        <WifiOff className="h-4 w-4 text-gray-500 dark:text-gray-600" />
                        <span className="font-medium text-gray-500 dark:text-gray-400 text-sm">{device.label ?? 'Unnamed Device'}</span>
                        <RoleBadge role={device.role} />
                        <span className="text-xs text-gray-500 dark:text-gray-600">Revoked {timeAgo(device.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Generate code tab ── */}
      {activeTab === 'pair' && (
        <div className="max-w-lg">
          <form onSubmit={(e) => void handleGenerateCode(e)} className="space-y-4 rounded-2xl bg-gray-50 dark:bg-[#2a2a3a] p-6">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Generate Pairing Code</h2>
            <p className="text-sm text-gray-500 dark:text-gray-500">Codes are valid for 15 minutes and single-use. Enter the code on the device to pair it.</p>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Device Role</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(['pos', 'kds', 'kiosk', 'dashboard', 'display'] as DeviceRole[]).map((r) => (
                  <button key={r} type="button" onClick={() => setGenRole(r)}
                    className={`rounded-xl py-2.5 text-xs font-bold uppercase transition-colors ${genRole === r ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-[#1e1e2e] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-transparent'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Location</label>
              <select value={genLocationId} onChange={(e) => setGenLocationId(e.target.value)} required
                className="w-full rounded-xl bg-white dark:bg-[#1e1e2e] px-4 py-2.5 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-[#3a3a4a] focus:border-indigo-500 focus:outline-none">
                <option value="">Select a location…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Label <span className="text-gray-400 dark:text-gray-600">(optional)</span></label>
              <input type="text" value={genLabel} onChange={(e) => setGenLabel(e.target.value)}
                placeholder="e.g. Counter 1, Drive-Thru KDS" maxLength={100}
                className="w-full rounded-xl bg-white dark:bg-[#1e1e2e] px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-[#3a3a4a] focus:border-indigo-500 focus:outline-none" />
            </div>

            {genError && <p className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-600 dark:text-red-400">{genError}</p>}

            <button type="submit" disabled={!genLocationId || generating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-sm font-bold text-white hover:bg-indigo-400 transition-colors disabled:opacity-40">
              <Plus className="h-4 w-4" />{generating ? 'Generating…' : 'Generate Code'}
            </button>
          </form>

          {latestCode && (
            <div className="mt-6 rounded-2xl border-2 border-indigo-500 bg-indigo-50 dark:bg-[#1a1a2e] p-6 text-center">
              <p className="mb-2 text-sm text-gray-500 dark:text-gray-400 font-medium">Enter this code on the device</p>
              <div className="flex items-center justify-center gap-4 mb-4">
                <span className="text-5xl font-black text-gray-900 dark:text-white tracking-[0.3em] font-mono">{latestCode.code}</span>
                <button onClick={() => void copyCode(latestCode.code)}
                  className="rounded-xl bg-gray-100 dark:bg-[#2a2a3a] p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {copiedCode === latestCode.code ? <Check className="h-5 w-5 text-green-500 dark:text-green-400" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
              <div className="flex items-center justify-center gap-4 text-sm flex-wrap">
                <span className="text-gray-500 dark:text-gray-500">Expires in</span>
                <CountdownTimer expiresAt={latestCode.expiresAt} />
                <RoleBadge role={latestCode.role} />
                {latestCode.label && <span className="text-gray-500 dark:text-gray-400">{latestCode.label}</span>}
              </div>
            </div>
          )}

          {codes.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-600 dark:text-gray-400">Active Codes</h3>
              <div className="space-y-2">
                {codes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-[#2a2a3a] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg font-bold text-gray-900 dark:text-white tracking-widest">{c.code}</span>
                      <RoleBadge role={c.role} />
                      {c.label && <span className="text-sm text-gray-500 dark:text-gray-400">{c.label}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <CountdownTimer expiresAt={c.expiresAt} />
                      <button onClick={() => void copyCode(c.code)} className="rounded-lg p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                        {copiedCode === c.code ? <Check className="h-4 w-4 text-green-500 dark:text-green-400" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
