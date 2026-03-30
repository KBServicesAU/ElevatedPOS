'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, ExternalLink, Plus, Zap } from 'lucide-react';
import { useIntegrationApps } from '@/lib/hooks';
import type { IntegrationApp } from '@/lib/api';

// Static marketplace catalog (installed status comes from API)
const MARKETPLACE: Array<Omit<IntegrationApp, 'installed' | 'installedAt'> & { logo: string }> = [
  { id: 'xero', name: 'Xero', category: 'Accounting', description: 'Sync sales, refunds, and payments to your Xero ledger automatically.', logo: '🔵' },
  { id: 'mailchimp', name: 'Mailchimp', category: 'Email Marketing', description: 'Sync customer lists and purchase data for targeted campaigns.', logo: '🐒' },
  { id: 'stripe-terminal', name: 'Stripe Terminal', category: 'Payments', description: "Accept card-present payments with Stripe's smart readers.", logo: '💳' },
  { id: 'google-analytics', name: 'Google Analytics', category: 'Analytics', description: 'Send transaction events to GA4 for website analytics.', logo: '📊' },
  { id: 'square-payroll', name: 'Square Payroll', category: 'HR & Payroll', description: 'Sync staff hours and tips to payroll automatically.', logo: '🟦' },
  { id: 'doordash', name: 'DoorDash', category: 'Delivery', description: 'Accept and manage delivery orders directly from the POS.', logo: '🚗' },
  { id: 'uber-eats', name: 'Uber Eats', category: 'Delivery', description: 'Accept Uber Eats orders without a separate tablet.', logo: '🛵' },
  { id: 'webhooks', name: 'Webhooks', category: 'Developer', description: 'Send real-time events to any URL for custom integrations.', logo: '🔗' },
];

const CATEGORIES = ['All', 'Accounting', 'Payments', 'Email Marketing', 'Delivery', 'Analytics', 'Developer'];

export function IntegrationsClient() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const { data, isLoading } = useIntegrationApps();

  // Build a set of installed app IDs from the API
  const installedIds = new Set((data?.data ?? []).map((a) => a.id));

  const filtered = MARKETPLACE.filter(
    (app) => selectedCategory === 'All' || app.category === selectedCategory,
  );

  const connectedCount = MARKETPLACE.filter((app) => installedIds.has(app.id)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Integrations</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${connectedCount} connected · ${MARKETPLACE.length - connectedCount} available`}
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <Zap className="h-4 w-4" /> View API docs
        </button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-indigo-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Integration grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((app) => {
          const isConnected = installedIds.has(app.id);
          const apiRecord = data?.data?.find((a) => a.id === app.id);
          return (
            <div key={app.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-xl dark:bg-gray-800">
                    {app.logo}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{app.name}</p>
                    <p className="text-xs text-gray-500">{app.category}</p>
                  </div>
                </div>
                {isLoading ? (
                  <div className="h-5 w-5 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
                ) : isConnected ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                )}
              </div>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{app.description}</p>
              <div className="mt-4 flex items-center justify-between">
                {isConnected ? (
                  <span className="text-xs text-gray-400">
                    Connected {apiRecord?.installedAt ? new Date(apiRecord.installedAt).toLocaleDateString() : ''}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Not connected</span>
                )}
                {isConnected ? (
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    Configure <ExternalLink className="h-3 w-3" />
                  </button>
                ) : (
                  <button className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    <Plus className="h-3 w-3" /> Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
