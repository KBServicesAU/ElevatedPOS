'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Monitor, ChefHat, Tablet, Plus, Trash2, RefreshCw,
  Copy, CheckCircle, Clock, Wifi, WifiOff, Loader2,
  AlertCircle, X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

// v2.7.51 — broaden the Role union to match all roles the API can return.
// Previously a paired customer-display / dashboard / signage device threw
// "Cannot destructure property 'label' of 'j[t]' as it is undefined" in
// RoleBadge because ROLE_META had no entry for that role.
interface Device {
  id: string;
  label?: string;
  role: Role;
  locationId: string;
  lastSeenAt?: string;
  status: 'active' | 'inactive' | 'revoked';
  createdAt: string;
}

interface DevicesResponse {
  data: Device[];
  total: number;
  limit: number;
}

interface PairingCodeResponse {
  code: string;
  expiresAt: string;
}

type Role = 'pos' | 'kds' | 'kiosk' | 'customer-display' | 'dashboard' | 'display';

// ─── Role helpers ─────────────────────────────────────────────────────────────

const ROLE_META: Record<Role, { label: string; Icon: React.ElementType; color: string; badge: string }> = {
  pos:   { label: 'POS Terminal',       Icon: Monitor, color: 'text-indigo-400', badge: 'bg-indigo-900/50 text-indigo-300 border-indigo-800' },
  kds:   { label: 'Kitchen Display',    Icon: ChefHat, color: 'text-yellow-400', badge: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
  kiosk: { label: 'Self-Serve Kiosk',   Icon: Tablet,  color: 'text-amber-400',  badge: 'bg-amber-900/50  text-amber-300  border-amber-800'  },
  // v2.7.51 — additional device roles paired from the apps. Previously
  // RoleBadge crashed for any role outside { pos, kds, kiosk }.
  'customer-display': { label: 'Customer Display', Icon: Monitor, color: 'text-purple-400', badge: 'bg-purple-900/50 text-purple-300 border-purple-800' },
  dashboard:          { label: 'Dashboard',        Icon: Monitor, color: 'text-blue-400',   badge: 'bg-blue-900/50   text-blue-300   border-blue-800'   },
  display:            { label: 'Signage',          Icon: Monitor, color: 'text-cyan-400',   badge: 'bg-cyan-900/50   text-cyan-300   border-cyan-800'   },
};

// Defensive fallback — any role not in the map renders as a generic badge.
const FALLBACK_ROLE_META = { label: 'Device', Icon: Monitor, color: 'text-gray-400', badge: 'bg-gray-900/50 text-gray-300 border-gray-800' };

function RoleBadge({ role }: { role: Role }) {
  const meta = ROLE_META[role] ?? FALLBACK_ROLE_META;
  const { label, badge, Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${badge}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: Device['status'] }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-800 bg-green-900/50 px-2 py-0.5 text-xs font-semibold text-green-300">
        <Wifi className="h-3 w-3" /> Active
      </span>
    );
  }
  if (status === 'revoked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-800 bg-red-900/50 px-2 py-0.5 text-xs font-semibold text-red-300">
        <WifiOff className="h-3 w-3" /> Revoked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-xs font-semibold text-gray-400">
      <WifiOff className="h-3 w-3" /> Inactive
    </span>
  );
}

function relativeTime(iso?: string): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Countdown timer ──────────────────────────────────────────────────────────

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const expired = remaining === 0;

  return (
    <div className={`flex items-center gap-1.5 font-mono text-sm font-bold ${expired ? 'text-red-400' : 'text-green-400'}`}>
      <Clock className="h-4 w-4" />
      {expired ? 'Expired' : `${mins}:${String(secs).padStart(2, '0')}`}
    </div>
  );
}

// ─── Generate pairing code modal ──────────────────────────────────────────────

interface GenerateModalProps {
  onClose: () => void;
  onGenerated: () => void;
}

function GenerateModal({ onClose, onGenerated }: GenerateModalProps) {
  const [role, setRole] = useState<Role>('pos');
  const [locationId, setLocationId] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PairingCodeResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!locationId.trim()) {
      setError('Location ID is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PairingCodeResponse>('devices/pairing-codes', {
        method: 'POST',
        body: JSON.stringify({ role, locationId: locationId.trim(), label: label.trim() || undefined }),
      });
      setResult(data);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    void navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-[#1a1a2e] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <h2 className="text-lg font-bold text-white">Generate Pairing Code</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {!result ? (
            <div className="space-y-4">
              {/* Role */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Device Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['pos', 'kds', 'kiosk'] as const).map((r) => {
                    const meta = ROLE_META[r] ?? FALLBACK_ROLE_META;
                    const { label: rLabel, Icon, color } = meta;
                    return (
                      <button
                        key={r}
                        onClick={() => setRole(r)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors ${
                          role === r
                            ? 'border-indigo-500 bg-indigo-950'
                            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${color}`} />
                        <span className="text-xs font-semibold text-white">{rLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location ID */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Location ID <span className="text-red-400">*</span>
                </label>
                <input
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  placeholder="e.g. 00000000-0000-0000-0000-000000000001"
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Label */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Label <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Counter 1, Drive-Through"
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={() => void handleGenerate()}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : 'Generate Code'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5 text-center">
              <div>
                <p className="mb-2 text-sm text-gray-400">Your pairing code is ready</p>
                <div className="relative">
                  <div className="rounded-2xl border-2 border-indigo-500 bg-[#0f0f1a] px-8 py-6">
                    <span className="font-mono text-5xl font-extrabold tracking-[0.3em] text-white">
                      {result.code}
                    </span>
                  </div>
                </div>
              </div>

              <Countdown expiresAt={result.expiresAt} />

              <p className="text-sm text-gray-400">
                Enter this code on the terminal&apos;s pairing screen. The code expires in 15 minutes.
              </p>

              <button
                onClick={handleCopy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-600 bg-gray-800 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
              >
                {copied ? (
                  <><CheckCircle className="h-4 w-4 text-green-400" /> Copied!</>
                ) : (
                  <><Copy className="h-4 w-4" /> Copy Code</>
                )}
              </button>

              <button
                onClick={onClose}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DEVICE_LIMIT = 10; // placeholder — real limit comes from org subscription

export default function DevicesPage() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DevicesResponse>('devices');
      setDevices(res.data ?? []);
    } catch (err) {
      // If the endpoint isn't implemented yet, show an empty state with the error
      setError(err instanceof Error ? err.message : 'Failed to load devices.');
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  const handleRevoke = async (deviceId: string) => {
    setRevoking(deviceId);
    setConfirmRevokeId(null);
    try {
      await apiFetch(`devices/${deviceId}`, { method: 'DELETE' });
      setDevices((prev) => prev.map((d) => d.id === deviceId ? { ...d, status: 'revoked' } : d));
    } catch (err) {
      toast({ title: 'Failed to revoke device', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setRevoking(null);
    }
  };

  const activeCount = devices.filter((d) => d.status !== 'revoked').length;

  return (
    <div className="min-h-full bg-gray-50 p-6 dark:bg-[#0f0f18]">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Devices</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage paired terminals, KDS screens, and kiosks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void fetchDevices()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Generate Pairing Code
          </button>
        </div>
      </div>

      {/* Usage card */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#1a1a2e]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Devices Used</p>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 dark:text-white">
              {activeCount}
              <span className="ml-1 text-xl font-medium text-gray-400 dark:text-gray-500">
                / {DEVICE_LIMIT}
              </span>
            </p>
          </div>
          <div className="flex-1 px-8">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${Math.min(100, (activeCount / DEVICE_LIMIT) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-gray-400">
              {DEVICE_LIMIT - activeCount} remaining
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            {(['pos', 'kds', 'kiosk'] as const).map((r) => {
              const meta = ROLE_META[r] ?? FALLBACK_ROLE_META;
              const { label, Icon, color } = meta;
              const count = devices.filter((d) => d.role === r && d.status !== 'revoked').length;
              return (
                <div key={r}>
                  <Icon className={`mx-auto mb-1 h-5 w-5 ${color}`} />
                  <p className="text-lg font-bold text-white">{count}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-yellow-700 bg-yellow-900/30 px-4 py-3 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error} — showing empty state while devices API is unavailable.
        </div>
      )}

      {/* Devices table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1a1a2e]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Monitor className="mb-3 h-12 w-12 text-gray-500" />
            <p className="text-base font-semibold text-gray-300">No devices paired yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Generate a pairing code and enter it on any terminal to connect it.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-5 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Generate Pairing Code
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Label
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Last Seen
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {devices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-800/20">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-white">
                          {device.label ?? '—'}
                        </p>
                        <p className="font-mono text-[10px] text-gray-500">
                          {device.id.slice(0, 8)}…
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={device.role} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">
                      {device.locationId.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {relativeTime(device.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={device.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {device.status !== 'revoked' && (
                        confirmRevokeId === device.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">Revoke device?</span>
                            <button
                              onClick={() => void handleRevoke(device.id)}
                              disabled={revoking === device.id}
                              className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50"
                            >
                              {revoking === device.id ? 'Revoking…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmRevokeId(null)}
                              className="text-xs text-gray-500 hover:text-gray-300"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmRevokeId(device.id)}
                            disabled={revoking === device.id}
                            className="flex items-center gap-1.5 rounded-lg border border-red-800 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-40"
                          >
                            {revoking === device.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            Revoke
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <GenerateModal
          onClose={() => setShowModal(false)}
          onGenerated={() => void fetchDevices()}
        />
      )}
    </div>
  );
}
