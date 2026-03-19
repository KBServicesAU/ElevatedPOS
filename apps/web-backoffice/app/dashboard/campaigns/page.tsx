import type { Metadata } from 'next';
import { Plus, Megaphone, Mail, MessageSquare, Tag, Calendar } from 'lucide-react';

export const metadata: Metadata = { title: 'Campaigns' };

const campaigns = [
  {
    id: 'CAM-001',
    name: 'March Loyalty Boost',
    type: 'Points Multiplier',
    channel: 'In-Store',
    status: 'Active',
    reach: 847,
    startDate: 'Mar 1',
    endDate: 'Mar 31',
    icon: Tag,
    color: 'bg-yellow-50 text-yellow-600',
  },
  {
    id: 'CAM-002',
    name: 'Welcome Back Email',
    type: 'Email',
    channel: 'Email',
    status: 'Active',
    reach: 312,
    startDate: 'Ongoing',
    endDate: '—',
    icon: Mail,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'CAM-003',
    name: 'Tuesday Discount',
    type: 'Discount',
    channel: 'POS',
    status: 'Scheduled',
    reach: 0,
    startDate: 'Mar 25',
    endDate: 'Mar 25',
    icon: Tag,
    color: 'bg-nexus-50 text-nexus-600',
  },
  {
    id: 'CAM-004',
    name: 'Re-engagement SMS',
    type: 'SMS',
    channel: 'SMS',
    status: 'Draft',
    reach: 0,
    startDate: '—',
    endDate: '—',
    icon: MessageSquare,
    color: 'bg-green-50 text-green-600',
  },
  {
    id: 'CAM-005',
    name: 'Valentine\'s Day Special',
    type: 'Email',
    channel: 'Email',
    status: 'Completed',
    reach: 562,
    startDate: 'Feb 10',
    endDate: 'Feb 14',
    icon: Mail,
    color: 'bg-pink-50 text-pink-600',
  },
];

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  Completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export default function CampaignsPage() {
  const active = campaigns.filter((c) => c.status === 'Active').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Campaigns</h2>
          <p className="text-sm text-gray-500">{campaigns.length} campaigns · {active} active</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700">
          <Plus className="h-4 w-4" /> Create Campaign
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Campaigns', value: active.toString(), icon: Megaphone },
          { label: 'Total Reach', value: '1,159', icon: Mail },
          { label: 'Avg Open Rate', value: '42%', icon: MessageSquare },
          { label: 'Revenue Attributed', value: '$2,840', icon: Tag },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-gray-400" />
            </div>
            <p className="mt-1.5 text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Campaign list */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Campaign</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Reach</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Schedule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {campaigns.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${c.color} bg-opacity-60`}>
                      <c.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.id} · {c.channel}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{c.type}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                  {c.reach > 0 ? c.reach.toLocaleString() : '—'}
                </td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                    <Calendar className="h-3.5 w-3.5" />
                    {c.startDate}{c.endDate !== '—' ? ` → ${c.endDate}` : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
