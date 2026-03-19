import type { Metadata } from 'next';
import { CheckCircle, XCircle, ExternalLink, Plus, Zap } from 'lucide-react';

export const metadata: Metadata = { title: 'Integrations' };

const integrations = [
  {
    name: 'Xero',
    category: 'Accounting',
    description: 'Sync sales, refunds, and payments to your Xero ledger automatically.',
    connected: true,
    lastSync: '2 min ago',
    logo: '🔵',
  },
  {
    name: 'Mailchimp',
    category: 'Email Marketing',
    description: 'Sync customer lists and purchase data for targeted campaigns.',
    connected: true,
    lastSync: '1h ago',
    logo: '🐒',
  },
  {
    name: 'Stripe Terminal',
    category: 'Payments',
    description: "Accept card-present payments with Stripe's smart readers.",
    connected: true,
    lastSync: 'Live',
    logo: '💳',
  },
  {
    name: 'Google Analytics',
    category: 'Analytics',
    description: 'Send transaction events to GA4 for website analytics.',
    connected: false,
    lastSync: null,
    logo: '📊',
  },
  {
    name: 'Square Payroll',
    category: 'HR & Payroll',
    description: 'Sync staff hours and tips to payroll automatically.',
    connected: false,
    lastSync: null,
    logo: '🟦',
  },
  {
    name: 'DoorDash',
    category: 'Delivery',
    description: 'Accept and manage delivery orders directly from the POS.',
    connected: false,
    lastSync: null,
    logo: '🚗',
  },
  {
    name: 'Uber Eats',
    category: 'Delivery',
    description: 'Accept Uber Eats orders without a separate tablet.',
    connected: false,
    lastSync: null,
    logo: '🛵',
  },
  {
    name: 'Webhooks',
    category: 'Developer',
    description: 'Send real-time events to any URL for custom integrations.',
    connected: false,
    lastSync: null,
    logo: '🔗',
  },
];

const categories = ['All', 'Accounting', 'Payments', 'Email Marketing', 'Delivery', 'Analytics', 'Developer'];

export default function IntegrationsPage() {
  const connected = integrations.filter((i) => i.connected).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Integrations</h2>
          <p className="text-sm text-gray-500">{connected} connected · {integrations.length - connected} available</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <Zap className="h-4 w-4" /> View API docs
        </button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              cat === 'All'
                ? 'bg-nexus-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Integration grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-xl dark:bg-gray-800">
                  {integration.logo}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{integration.name}</p>
                  <p className="text-xs text-gray-500">{integration.category}</p>
                </div>
              </div>
              {integration.connected ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-gray-300 dark:text-gray-600" />
              )}
            </div>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{integration.description}</p>
            <div className="mt-4 flex items-center justify-between">
              {integration.connected ? (
                <span className="text-xs text-gray-400">Last sync: {integration.lastSync}</span>
              ) : (
                <span className="text-xs text-gray-400">Not connected</span>
              )}
              {integration.connected ? (
                <button className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  Configure <ExternalLink className="h-3 w-3" />
                </button>
              ) : (
                <button className="flex items-center gap-1 text-xs font-medium text-nexus-600 hover:text-nexus-700">
                  <Plus className="h-3 w-3" /> Connect
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
