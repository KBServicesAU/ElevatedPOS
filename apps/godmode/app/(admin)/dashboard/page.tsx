'use client';

import { useEffect, useState } from 'react';
import { platformFetch } from '@/lib/api';
import { Building2, CheckCircle, DollarSign, Activity, ScrollText, AlertTriangle, XCircle } from 'lucide-react';

interface Org {
  id: string;
  name: string;
  plan: string;
  onboardingStep: string;
  createdAt: string;
}

interface OrgsResponse {
  data: Org[];
  total: number;
}

interface AuditLog {
  id: string;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  data: AuditLog[];
}

interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
}

interface HealthResponse {
  data: ServiceHealth[];
}

function planBadgeColor(plan: string): string {
  if (plan === 'enterprise') return 'bg-yellow-500/20 text-yellow-400';
  if (plan === 'growth') return 'bg-indigo-500/20 text-indigo-400';
  return 'bg-gray-500/20 text-gray-400';
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatActivityLine(log: AuditLog): { event: string; detail: string } {
  const actor = log.actorName ?? log.actorEmail ?? 'System';
  const resource = log.resourceType ? `${log.resourceType}${log.resourceId ? ` ${log.resourceId.slice(0, 8)}` : ''}` : '';
  const event = `${actor} ${log.action.replace(/_/g, ' ')}`;
  return { event, detail: resource };
}

function deriveSystemStatus(services: ServiceHealth[]): {
  label: string;
  color: string;
  Icon: React.ComponentType<{ className?: string | undefined }>;
} {
  if (services.length === 0) return { label: 'Unknown', color: 'text-gray-400', Icon: Activity };
  const downCount = services.filter((s) => s.status === 'down').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;
  if (downCount > 0) return { label: `${downCount} Down`, color: 'text-red-400', Icon: XCircle };
  if (degradedCount > 0) return { label: `${degradedCount} Degraded`, color: 'text-yellow-400', Icon: AlertTriangle };
  return { label: 'All Operational', color: 'text-green-400', Icon: CheckCircle };
}

export default function DashboardPage() {
  const [total, setTotal] = useState<number | null>(null);
  const [recentOrgs, setRecentOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activityLogs, setActivityLogs] = useState<AuditLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = (await platformFetch('platform/organisations?limit=10')) as OrgsResponse;
        setTotal(data.total);
        setRecentOrgs(data.data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load merchants');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    async function loadActivity() {
      setActivityLoading(true);
      try {
        const data = (await platformFetch('platform/audit-logs?limit=10')) as AuditLogsResponse;
        setActivityLogs(data.data ?? []);
      } catch (err) {
        console.error('Failed to load activity logs:', err);
        setActivityLogs([]);
      } finally {
        setActivityLoading(false);
      }
    }
    void loadActivity();
  }, []);

  useEffect(() => {
    async function loadHealth() {
      setHealthLoading(true);
      try {
        const res = await fetch('/api/services-health', { cache: 'no-store' });
        const data = (await res.json()) as HealthResponse;
        setServices(data.data ?? []);
      } catch (err) {
        console.error('Failed to load service health:', err);
        setServices([]);
      } finally {
        setHealthLoading(false);
      }
    }
    void loadHealth();
  }, []);

  const systemStatus = deriveSystemStatus(services);
  const SystemIcon = systemStatus.Icon;

  const kpis = [
    {
      label: 'Total Merchants',
      value: loading ? '...' : loadError ? 'Error' : String(total ?? 0),
      Icon: Building2,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
    },
    {
      label: 'Active Subscriptions',
      value: loading ? '...' : loadError ? 'Error' : String(recentOrgs.filter((o) => o.onboardingStep === 'complete').length),
      Icon: CheckCircle,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Platform Revenue',
      value: '—',
      Icon: DollarSign,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
    {
      label: 'System Status',
      value: healthLoading ? '...' : systemStatus.label,
      Icon: healthLoading ? Activity : SystemIcon,
      color: healthLoading ? 'text-gray-400' : systemStatus.color,
      bg: healthLoading ? 'bg-gray-500/10' : services.some((s) => s.status === 'down')
        ? 'bg-red-500/10'
        : services.some((s) => s.status === 'degraded')
        ? 'bg-yellow-500/10'
        : 'bg-green-500/10',
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Platform Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Mission control for ElevatedPOS</p>
      </div>

      {loadError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {loadError}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {kpis.map(({ label, value, Icon, color, bg }) => (
          <div key={label} className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-400 text-sm">{label}</p>
              <div className={`p-2 rounded ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Merchants */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg">
          <div className="px-6 py-4 border-b border-[#1e1e2e]">
            <h2 className="text-white font-semibold">Recent Merchants</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Plan</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Onboarding</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentOrgs.map((org) => (
                  <tr key={org.id} className="border-b border-[#1e1e2e] hover:bg-[#1e1e2e]/30">
                    <td className="px-6 py-3 text-white">{org.name}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${planBadgeColor(org.plan)}`}>
                        {org.plan}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-400">{org.onboardingStep}</td>
                    <td className="px-6 py-3 text-gray-400">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {!loading && recentOrgs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-600">
                      No merchants yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg">
          <div className="px-6 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
            <h2 className="text-white font-semibold">Recent Activity</h2>
            <ScrollText className="w-4 h-4 text-gray-500" />
          </div>
          <div className="divide-y divide-[#1e1e2e]">
            {activityLoading ? (
              <div className="px-6 py-8 text-center text-gray-600 text-sm">Loading...</div>
            ) : activityLogs.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-600 text-sm">No activity yet</div>
            ) : (
              activityLogs.map((log) => {
                const { event, detail } = formatActivityLine(log);
                return (
                  <div
                    key={log.id}
                    className="px-6 py-3 flex items-start justify-between hover:bg-[#1e1e2e]/30"
                  >
                    <div className="min-w-0 flex-1 mr-4">
                      <p className="text-white text-sm truncate">{event}</p>
                      {detail && <p className="text-gray-500 text-xs mt-0.5 truncate">{detail}</p>}
                    </div>
                    <span className="text-gray-600 text-xs whitespace-nowrap shrink-0">
                      {timeAgo(log.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
