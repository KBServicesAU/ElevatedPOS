import type { Metadata } from 'next';
import { Plus, Zap, CheckCircle, XCircle, Play } from 'lucide-react';

export const metadata: Metadata = { title: 'Automations' };

const automations = [
  {
    id: 'A001',
    name: 'Low Stock Alert',
    trigger: 'Low Stock',
    action: 'Send email to manager + create purchase order draft',
    enabled: true,
    runs: 12,
    lastRun: '2h ago',
  },
  {
    id: 'A002',
    name: 'Welcome New Customer',
    trigger: 'Customer Created',
    action: 'Send welcome email + award 100 bonus points',
    enabled: true,
    runs: 47,
    lastRun: '1 day ago',
  },
  {
    id: 'A003',
    name: 'Tier Upgrade Notification',
    trigger: 'Loyalty Tier Changed',
    action: 'Send congratulations SMS + apply tier discount',
    enabled: true,
    runs: 8,
    lastRun: '3 days ago',
  },
  {
    id: 'A004',
    name: 'Birthday Reward',
    trigger: 'Birthday',
    action: 'Send birthday email + add 500 bonus points',
    enabled: false,
    runs: 0,
    lastRun: 'Never',
  },
  {
    id: 'A005',
    name: 'Order Complete Follow-up',
    trigger: 'Order Completed',
    action: 'Send receipt email + request review after 24h',
    enabled: true,
    runs: 284,
    lastRun: '5 min ago',
  },
];

const triggerColors: Record<string, string> = {
  'Low Stock': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Customer Created': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Loyalty Tier Changed': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'Birthday': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'Order Completed': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export default function AutomationsPage() {
  const enabled = automations.filter((a) => a.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Automations</h2>
          <p className="text-sm text-gray-500">{automations.length} rules · {enabled} active</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700">
          <Plus className="h-4 w-4" /> Create Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Rules', value: enabled.toString() },
          { label: 'Total Runs (MTD)', value: automations.reduce((s, a) => s + a.runs, 0).toString() },
          { label: 'Success Rate', value: '99.2%' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {automations.map((rule) => (
          <div
            key={rule.id}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className={`mt-0.5 rounded-xl p-2.5 ${rule.enabled ? 'bg-nexus-50 dark:bg-nexus-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  <Zap className={`h-5 w-5 ${rule.enabled ? 'text-nexus-600 dark:text-nexus-400' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{rule.name}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-500">When:</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${triggerColors[rule.trigger] || 'bg-gray-100 text-gray-600'}`}>
                      {rule.trigger}
                    </span>
                    <span className="text-sm text-gray-500">→ {rule.action}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{rule.runs} runs · Last: {rule.lastRun}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                  <Play className="h-4 w-4" />
                </button>
                <button className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  rule.enabled
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {rule.enabled ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {rule.enabled ? 'Active' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
