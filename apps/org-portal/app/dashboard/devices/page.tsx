'use client';

import { useEffect, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';

interface Device {
  id: string;
  name?: string;
  role?: string;
  status?: string;
  lastSeen?: string;
  organisation?: { id: string; businessName: string };
  orgName?: string;
}

interface ApiResponse {
  devices?: Device[];
  data?: Device[];
}

const ROLES = ['all', 'pos', 'kds', 'kiosk'] as const;
const STATUSES = ['all', 'active', 'inactive'] as const;

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/proxy/platform/devices')
      .then((r) => r.json())
      .then((data: ApiResponse | Device[]) => {
        if (Array.isArray(data)) {
          setDevices(data);
        } else if (data && 'devices' in data && Array.isArray(data.devices)) {
          setDevices(data.devices);
        } else if (data && 'data' in data && Array.isArray(data.data)) {
          setDevices(data.data);
        }
      })
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = devices.filter((d) => {
    const roleOk = roleFilter === 'all' || (d.role?.toLowerCase() ?? '') === roleFilter;
    const statusOk = statusFilter === 'all' || (d.status?.toLowerCase() ?? '') === statusFilter;
    return roleOk && statusOk;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Devices</h1>
        <p className="text-sm text-gray-500 mt-1">Read-only device overview across all merchants</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">Role:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r === 'all' ? 'All roles' : r.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <span className="text-sm text-gray-400 ml-auto">
          {filtered.length} device{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <MonitorSmartphone size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">No devices found</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Merchant
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Device
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((device) => (
                <tr key={device.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm text-gray-700">
                    {device.organisation?.businessName ?? device.orgName ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">
                    {device.name ?? device.id}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {device.role ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 uppercase">
                        {device.role}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <StatusBadge status={device.status} />
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">
                    {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Support staff have read-only access to device data. Device revocation requires superadmin access.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = status?.toLowerCase() ?? '';
  const classes =
    s === 'active'
      ? 'bg-green-100 text-green-700'
      : s === 'inactive'
      ? 'bg-gray-100 text-gray-500'
      : 'bg-yellow-100 text-yellow-700';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${classes}`}
    >
      {status ?? 'unknown'}
    </span>
  );
}
