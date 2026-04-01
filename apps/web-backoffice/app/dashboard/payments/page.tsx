'use client';

import { useState, useEffect } from 'react';

interface ConnectAccount {
  stripeAccountId: string;
  status: 'pending' | 'onboarding' | 'active' | 'restricted' | 'disabled';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  businessName?: string;
  platformFeePercent: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  onboarding: 'bg-yellow-100 text-yellow-800',
  restricted: 'bg-orange-100 text-orange-800',
  pending: 'bg-gray-100 text-gray-600',
  disabled: 'bg-red-100 text-red-800',
};

export default function PaymentsPage() {
  const [account, setAccount] = useState<ConnectAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);

  // Demo orgId - in production this comes from session/auth
  const orgId = '00000000-0000-0000-0000-000000000001';

  useEffect(() => {
    fetch(`/api/proxy/integrations/api/v1/connect/account/${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ConnectAccount | null) => setAccount(data))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleConnect() {
    setOnboarding(true);
    try {
      const res = await fetch('/api/proxy/integrations/api/v1/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setOnboarding(false);
    }
  }

  async function handleDashboard() {
    const res = await fetch(`/api/proxy/integrations/api/v1/connect/login-link/${orgId}`, {
      method: 'POST',
    });
    const data = (await res.json()) as { url: string };
    window.open(data.url, '_blank');
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-40 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="text-gray-500 mt-1">
          Connect your Stripe account to accept payments, manage subscriptions and send invoices.
        </p>
      </div>

      {!account || account.status === 'pending' ? (
        /* Not connected */
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">💳</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Connect Stripe</h2>
          <p className="text-gray-500 mb-6 text-sm">
            Link your Stripe account to start accepting payments. Takes about 5 minutes. A 1%
            platform fee applies to all transactions on top of standard Stripe fees.
          </p>
          <button
            onClick={handleConnect}
            disabled={onboarding}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {onboarding ? 'Redirecting to Stripe...' : 'Connect with Stripe →'}
          </button>
          <p className="text-xs text-gray-400 mt-4">
            Powered by Stripe Connect · Your data is secure
          </p>
        </div>
      ) : (
        /* Connected */
        <div className="space-y-6">
          {/* Status card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">
                  {account.businessName ?? 'Your Stripe Account'}
                </h2>
                <p className="text-sm text-gray-500 font-mono">{account.stripeAccountId}</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${STATUS_COLORS[account.status] ?? ''}`}
              >
                {account.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl mb-1">{account.chargesEnabled ? '✅' : '⏳'}</div>
                <p className="text-sm font-medium">Charges</p>
                <p className="text-xs text-gray-500">
                  {account.chargesEnabled ? 'Enabled' : 'Pending'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl mb-1">{account.payoutsEnabled ? '✅' : '⏳'}</div>
                <p className="text-sm font-medium">Payouts</p>
                <p className="text-xs text-gray-500">
                  {account.payoutsEnabled ? 'Enabled' : 'Pending'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl mb-1">💰</div>
                <p className="text-sm font-medium">Platform fee</p>
                <p className="text-xs text-gray-500">
                  {account.platformFeePercent / 100}% per transaction
                </p>
              </div>
            </div>

            {account.status === 'onboarding' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-sm">
                <strong>Action required:</strong> Your Stripe onboarding is incomplete. Complete it
                to start accepting payments.
                <button
                  onClick={handleConnect}
                  className="ml-2 text-yellow-700 underline font-medium"
                >
                  Continue onboarding →
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDashboard}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Open Stripe Dashboard ↗
              </button>
              {account.status === 'onboarding' && (
                <button
                  onClick={handleConnect}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Complete setup →
                </button>
              )}
            </div>
          </div>

          {/* Quick actions */}
          {account.chargesEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <a
                href="/dashboard/subscriptions"
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all group"
              >
                <div className="text-2xl mb-3">🔄</div>
                <h3 className="font-semibold mb-1 group-hover:text-indigo-600">Subscriptions</h3>
                <p className="text-sm text-gray-500">Manage recurring billing for your customers</p>
              </a>
              <a
                href="/dashboard/invoices"
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all group"
              >
                <div className="text-2xl mb-3">🧾</div>
                <h3 className="font-semibold mb-1 group-hover:text-indigo-600">Invoices</h3>
                <p className="text-sm text-gray-500">Send invoices directly to your customers</p>
              </a>
              <a
                href="/dashboard/catalog"
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all group"
              >
                <div className="text-2xl mb-3">🛍️</div>
                <h3 className="font-semibold mb-1 group-hover:text-indigo-600">Web Store</h3>
                <p className="text-sm text-gray-500">Manage your online store products</p>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
