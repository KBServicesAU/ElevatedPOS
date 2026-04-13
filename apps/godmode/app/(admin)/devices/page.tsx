'use client';

import { useEffect, useState, useCallback } from 'react';
import { platformFetch } from '@/lib/api';

interface Device {
  id: string;
  orgId: string;
  orgName: string | null;
  role: string;
  label: string | null;
  locationId: string;
  platform: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  status: string;
  createdAt: string;
}

interface DevicesResponse {
  data: Device[];
}

const ROLE_OPTIONS = ['', 'pos', 'kds', 'kiosk'];
const STATUS_OPTIONS = ['', 'active', 'revoked'];

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const data = (await platformFetch(`platform/devices?${params.toString()}`)) as DevicesResponse;
      setDevices(data.data);
    } catch (err) {
      console.error('Failed to load devices:', err);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRevoke(id: string) {
    setRevoking(id);
    setActionError('');
    try {
      await platformFetch(`platform/devices/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      console.error('Failed to revoke device:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to revoke device.');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Devices</h1>
        <p className="text-gray-500 text-sm mt-1">All devices across the platform</p>
      </div>

      {actionError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {actionError}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-[#111118] border border-[#1e1e2e] rounded px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r === '' ? 'All Roles' : r.toUpperCase()}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#111118] border border-[#1e1e2e] rounded px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === '' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Label</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Org</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Platform</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Last Seen</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-600">Loading...</td>
              </tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-600">No devices found</td>
              </tr>
            ) : (
              devices.map((d) => (
                <tr key={d.id} className="border-b border-[#1e1e2e] hover:bg-[#1e1e2e]/30">
                  <td className="px-6 py-3 text-white">{d.label ?? d.id.slice(0, 8)}</td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded text-xs uppercase">
                      {d.role}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{d.orgName ?? `${d.orgId.slice(0, 8)}…`}</td>
                  <td className="px-6 py-3 text-gray-400">{d.platform ?? '—'}</td>
                  <td className="px-6 py-3 text-gray-400">
                    {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${d.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {d.status === 'active' && (
                      <button
                        onClick={() => setConfirmRevokeId(d.id)}
                        disabled={revoking === d.id}
                        className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-xs hover:bg-red-600/30 transition-colors disabled:opacity-40"
                      >
                        {revoking === d.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Revoke Confirmation Modal */}
      {confirmRevokeId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-white font-semibold mb-3">Revoke Device</h3>
            <p className="text-gray-400 text-sm mb-6">
              Revoke this device? It will no longer be able to connect.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRevokeId(null)}
                className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = confirmRevokeId;
                  setConfirmRevokeId(null);
                  await handleRevoke(id);
                }}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
