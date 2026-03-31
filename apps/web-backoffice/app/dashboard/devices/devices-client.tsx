'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, Plus, Trash2, RefreshCw, Monitor, ChefHat,
  Tablet, Clock, Wifi, WifiOff, Copy, Check,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

type DeviceRole = 'pos' | 'kds' | 'kiosk';
type DeviceStatus = 'active' | 'revoked';

interface Device {
  id: string;
  role: DeviceRole;
  locationId: string;
  registerId: string | null;
  label: string | null;
  platform: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  status: DeviceStatus;
  createdAt: string;
}

interface PairingCode {
  id: string;
  code: string;
  role: DeviceRole;
  locationId: string;
  label: string | null;
  expiresAt: string;
}

interface Location {
  id: string;
  name: string;
}

function RoleBadge({ role }: { role: DeviceRole }) {
  const map: Record<DeviceRole, { label: string; className: string; Icon: React.ElementType }> = {
    pos:   { label: 'POS',   className: 'bg-indigo-900 text-indigo-300 border border-indigo-700',  Icon: Monitor  },
    kds:   { label: 'KDS',   className: 'bg-orange-900 text-orange-300 border border-orange-700',  Icon: ChefHat  },
    kiosk: { label: 'Kiosk', className: 'bg-teal-900   text-teal-300   border border-teal-700',    Icon: Tablet   },
  };
  const { label, className, Icon } = map[role];
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
  if (mins < 1) return 'Just now';
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

export default function DevicesClient() {
  const [activeTab, setActiveTab] = useState<'devices' | 'pair'>('devices');
  const [devices, setDevices] = useState<Device[]>([]);
  const [codes, setCodes] = useState<PairingCode[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Generate form state
  const [genRole, setGenRole] = useState<DeviceRole>('pos');
  const [genLocationId, setGenLocationId] = useState('');
  const [genLabel, setGenLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [latestCode, setLatestCode] = useState<PairingCode | null>(null);

  const loadDevices   = useCallback(async () => { try { const r = await apiFetch<{ data: Device[] }>('/api/v1/devices'); setDevices(r.data ?? []); } catch { /**/ } }, []);
  const loadCodes     = useCallback(async () => { try { const r = await apiFetch<{ data: PairingCode[] }>('/api/v1/devices/pairing-codes'); setCodes(r.data ?? []); } catch { /**/ } }, []);
  const loadLocations = useCallback(async () => { try { const r = await apiFetch<{ data: Location[] }>('/api/v1/locations'); setLocations(r.data ?? []); } catch { /**/ } }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDevices(), loadCodes(), loadLocations()]).finally(() => setLoading(false));
  }, [loadDevices, loadCodes, loadLocations]);

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this device? It will need to be re-paired.')) return;
    setRevoking(id);
    try {
      await apiFetch(`/api/v1/devices/${id}`, { method: 'DELETE' });
      setDevices((prev) => prev.map((d) => d.id === id ? { ...d, status: 'revoked' as DeviceStatus } : d));
    } catch { /**/ } finally { setRevoking(null); }
  }

  async function handleGenerateCode(e: React.FormEvent) {
    e.preventDefault();
    if (!genLocationId) return;
    setGenerating(true); setGenError(null);
    try {
      const res = await apiFetch<{ data: PairingCode }>('/api/v1/devices/pairing-codes', {
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

  const activeDevices  = devices.filter((d) => d.status === 'active');
  const revokedDevices = devices.filter((d) => d.status === 'revoked');

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smartphone className="h-6 w-6 text-indigo-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Devices</h1>
            <p className="text-sm text-gray-500">Manage paired POS, KDS and Kiosk devices</p>
          </div>
        </div>
        <button onClick={() => { void loadDevices(); void loadCodes(); }}
          className="flex items-center gap-1.5 rounded-xl bg-[#2a2a3a] px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-[#2a2a3a]">
        {(['devices', 'pair'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {tab === 'devices' ? 'Paired Devices' : 'Generate Pairing Code'}
            {tab === 'devices' && activeDevices.length > 0 && (
              <span className="ml-2 rounded-full bg-indigo-900 px-2 py-0.5 text-xs text-indigo-300">{activeDevices.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Devices tab */}
      {activeTab === 'devices' && (
        <div>
          {loading ? (
            <div className="space-y-3 animate-pulse">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-[#2a2a3a]" />)}</div>
          ) : activeDevices.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#2a2a3a] py-16">
              <Smartphone className="h-12 w-12 text-gray-700 mb-3" />
              <p className="text-gray-500 font-medium">No paired devices yet</p>
              <p className="text-gray-600 text-sm mt-1">Generate a pairing code to connect a device</p>
              <button onClick={() => setActiveTab('pair')}
                className="mt-4 flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 transition-colors">
                <Plus className="h-4 w-4" />Generate Code
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDevices.map((device) => (
                <div key={device.id} className="flex items-center justify-between rounded-xl bg-[#2a2a3a] px-4 py-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < 5 * 60 * 1000 ? 'bg-green-500' : 'bg-gray-600'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm">{device.label ?? 'Unnamed Device'}</span>
                        <RoleBadge role={device.role} />
                        {device.platform && <span className="text-xs text-gray-500 capitalize">{device.platform}</span>}
                        {device.appVersion && <span className="text-xs text-gray-600">v{device.appVersion}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500 font-mono">{device.id.slice(0, 8)}…</span>
                        <span className="flex items-center gap-1 text-xs text-gray-500"><Wifi className="h-3 w-3" />{timeAgo(device.lastSeenAt)}</span>
                        <span className="flex items-center gap-1 text-xs text-gray-500"><Clock className="h-3 w-3" />Paired {timeAgo(device.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleRevoke(device.id)} disabled={revoking === device.id}
                    className="ml-4 flex-shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950 hover:text-red-300 transition-colors disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" />{revoking === device.id ? 'Revoking…' : 'Revoke'}
                  </button>
                </div>
              ))}
              {revokedDevices.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-400 transition-colors py-2">{revokedDevices.length} revoked device{revokedDevices.length !== 1 ? 's' : ''}</summary>
                  <div className="mt-2 space-y-2">
                    {revokedDevices.map((device) => (
                      <div key={device.id} className="flex items-center gap-4 rounded-xl bg-[#1a1a1a] px-4 py-3 opacity-50">
                        <WifiOff className="h-4 w-4 text-gray-600" />
                        <span className="font-medium text-gray-400 text-sm">{device.label ?? 'Unnamed Device'}</span>
                        <RoleBadge role={device.role} />
                        <span className="text-xs text-gray-600">Revoked {timeAgo(device.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Generate code tab */}
      {activeTab === 'pair' && (
        <div className="max-w-lg">
          <form onSubmit={(e) => void handleGenerateCode(e)} className="space-y-4 rounded-2xl bg-[#2a2a3a] p-6">
            <h2 className="text-base font-bold text-white">Generate Pairing Code</h2>
            <p className="text-sm text-gray-500">Codes are valid for 15 minutes and single-use. Enter the code on the device to pair it.</p>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Device Role</label>
              <div className="flex gap-2">
                {(['pos', 'kds', 'kiosk'] as DeviceRole[]).map((r) => (
                  <button key={r} type="button" onClick={() => setGenRole(r)}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-bold uppercase transition-colors ${genRole === r ? 'bg-indigo-500 text-white' : 'bg-[#1e1e2e] text-gray-400 hover:text-white'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Location</label>
              <select value={genLocationId} onChange={(e) => setGenLocationId(e.target.value)} required
                className="w-full rounded-xl bg-[#1e1e2e] px-4 py-2.5 text-sm text-white border border-[#3a3a4a] focus:border-indigo-500 focus:outline-none">
                <option value="">Select a location…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Label <span className="text-gray-600">(optional)</span></label>
              <input type="text" value={genLabel} onChange={(e) => setGenLabel(e.target.value)}
                placeholder="e.g. Counter 1, Drive-Thru KDS" maxLength={100}
                className="w-full rounded-xl bg-[#1e1e2e] px-4 py-2.5 text-sm text-white placeholder-gray-600 border border-[#3a3a4a] focus:border-indigo-500 focus:outline-none" />
            </div>

            {genError && <p className="rounded-lg bg-red-950 px-4 py-2 text-sm text-red-400">{genError}</p>}

            <button type="submit" disabled={!genLocationId || generating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-sm font-bold text-white hover:bg-indigo-400 transition-colors disabled:opacity-40">
              <Plus className="h-4 w-4" />{generating ? 'Generating…' : 'Generate Code'}
            </button>
          </form>

          {latestCode && (
            <div className="mt-6 rounded-2xl border-2 border-indigo-500 bg-[#1a1a2e] p-6 text-center">
              <p className="mb-2 text-sm text-gray-400 font-medium">Enter this code on the device</p>
              <div className="flex items-center justify-center gap-4 mb-4">
                <span className="text-5xl font-black text-white tracking-[0.3em] font-mono">{latestCode.code}</span>
                <button onClick={() => void copyCode(latestCode.code)}
                  className="rounded-xl bg-[#2a2a3a] p-2.5 text-gray-400 hover:text-white transition-colors">
                  {copiedCode === latestCode.code ? <Check className="h-5 w-5 text-green-400" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
              <div className="flex items-center justify-center gap-4 text-sm flex-wrap">
                <span className="text-gray-500">Expires in</span>
                <CountdownTimer expiresAt={latestCode.expiresAt} />
                <RoleBadge role={latestCode.role} />
                {latestCode.label && <span className="text-gray-400">{latestCode.label}</span>}
              </div>
            </div>
          )}

          {codes.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-400">Active Codes</h3>
              <div className="space-y-2">
                {codes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl bg-[#2a2a3a] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg font-bold text-white tracking-widest">{c.code}</span>
                      <RoleBadge role={c.role} />
                      {c.label && <span className="text-sm text-gray-400">{c.label}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <CountdownTimer expiresAt={c.expiresAt} />
                      <button onClick={() => void copyCode(c.code)} className="rounded-lg p-1.5 text-gray-500 hover:text-white transition-colors">
                        {copiedCode === c.code ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
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
