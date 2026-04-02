'use client';

import { useEffect, useState } from 'react';
import { platformFetch } from '@/lib/api';
import { Building2, CheckCircle, DollarSign, Activity } from 'lucide-react';

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

const MOCK_ACTIVITY = [
  { id: 1, event: 'New merchant signed up', detail: 'Acme Coffee Co.', time: '2 min ago' },
  { id: 2, event: 'Device paired', detail: 'POS terminal — Melbourne CBD', time: '14 min ago' },
  { id: 3, event: 'Plan upgraded', detail: 'Sunrise Bakery → Growth', time: '1 hr ago' },
  { id: 4, event: 'New merchant signed up', detail: 'Harbor Fish & Chips', time: '3 hr ago' },
  { id: 5, event: 'Device revoked', detail: 'KDS unit — Sydney North', time: '5 hr ago' },
];

function planBadgeColor(plan: string): string {
  if (plan === 'enterprise') return 'bg-yellow-500/20 text-yellow-400';
  if (plan === 'growth') return 'bg-indigo-500/20 text-indigo-400';
  return 'bg-gray-500/20 text-gray-400';
}

export default function DashboardPage() {
  const [total, setTotal] = useState<number | null>(null);
  const [recentOrgs, setRecentOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = (await platformFetch('platform/organisations?limit=10')) as OrgsResponse;
        setTotal(data.total);
        setRecentOrgs(data.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const kpis = [
    {
      label: 'Total Merchants',
      value: loading ? '...' : String(total ?? 0),
      Icon: Building2,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
    },
    {
      label: 'Active Subscriptions',
      value: loading ? '...' : String(total ?? 0),
      Icon: CheckCircle,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Platform Revenue',
      value: '$0',
      Icon: DollarSign,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
    {
      label: 'System Status',
      value: 'Operational',
      Icon: Activity,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Platform Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Mission control for ElevatedPOS</p>
      </div>

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
          <div className="px-6 py-4 border-b border-[#1e1e2e]">
            <h2 className="text-white font-semibold">Recent Activity</h2>
          </div>
          <div className="divide-y divide-[#1e1e2e]">
            {MOCK_ACTIVITY.map((item) => (
              <div
                key={item.id}
                className="px-6 py-3 flex items-start justify-between hover:bg-[#1e1e2e]/30"
              >
                <div>
                  <p className="text-white text-sm">{item.event}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{item.detail}</p>
                </div>
                <span className="text-gray-600 text-xs whitespace-nowrap ml-4">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
