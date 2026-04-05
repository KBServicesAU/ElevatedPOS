'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, ExternalLink, Plus, Zap, Loader2 } from 'lucide-react';
import { useIntegrationApps } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
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
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const { data, isLoading } = useIntegrationApps();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Build a set of installed app IDs from the API
  const installedIds = new Set((data?.data ?? []).map((a) => a.id));

  const filtered = MARKETPLACE.filter(
    (app) => selectedCategory === 'All' || app.category === selectedCategory,
  );

  const connectedCount = MARKETPLACE.filter((app) => installedIds.has(app.id)).length;

  async function handleConnect(appId: string, appName: string) {
    setConnectingId(appId);
    try {
      // For apps that use OAuth/external redirect, the API returns a redirect URL
      const res = await apiFetch<{ redirectUrl?: string; data?: { redirectUrl?: string } }>(
        `integration-apps/${appId}/connect`,
        { method: 'POST' },
      );
      const redirectUrl = (res as { redirectUrl?: string }).redirectUrl ?? (res as { data?: { redirectUrl?: string } }).data?.redirectUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        // Direct install (no OAuth)
        toast({ title: `${appName} connected`, description: 'Integration is now active.', variant: 'success' });
        queryClient.invalidateQueries({ queryKey: ['integration-apps'] });
      }
    } catch (err) {
      toast({ title: `Failed to connect ${appName}`, description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setConnectingId(null);
    }
  }

  async function handleDisconnect(appId: string, appName: string) {
    try {
      await apiFetch(`integration-apps/${appId}/disconnect`, { method: 'POST' });
      toast({ title: `${appName} disconnected`, variant: 'default' });
      queryClient.invalidateQueries({ queryKey: ['integration-apps'] });
    } catch (err) {
      toast({ title: `Failed to disconnect ${appName}`, description: getErrorMessage(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Integrations</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${connectedCount} connected · ${MARKETPLACE.length - connectedCount} available`}
          </p>
        </div>
        <a
          href="https://docs.elevatedpos.com.au/api"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          <Zap className="h-4 w-4" /> View API docs
        </a>
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
                  <button
                    onClick={() => { void handleDisconnect(app.id, app.name); }}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    Configure <ExternalLink className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    onClick={() => { void handleConnect(app.id, app.name); }}
                    disabled={connectingId === app.id}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                  >
                    {connectingId === app.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    {connectingId === app.id ? 'Connecting…' : 'Connect'}
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
