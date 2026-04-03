'use client';

import { useState, useEffect } from 'react';

interface SessionMe {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string | null;
  orgId?: string;
  plan?: string;
}

export default function BillingPage() {
  const [me, setMe] = useState<SessionMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SessionMe | null) => setMe(data))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const plan = me?.plan ?? 'Starter';

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-36" />
          <div className="h-40 bg-gray-200 rounded-2xl" />
          <div className="h-32 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-500 mt-1">Manage your ElevatedPOS subscription and payment method.</p>
      </div>

      {/* Current plan */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Current Plan</h2>
          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-semibold">
            {plan}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Plan
            </p>
            <p className="text-lg font-bold text-gray-900">{plan}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Status
            </p>
            <p className="text-lg font-bold text-green-600">Active</p>
          </div>
        </div>

        <a
          href="/dashboard/billing/plans"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Upgrade Plan →
        </a>
      </div>

      {/* Payment method */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Payment Method</h2>
        </div>
        <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
          <div className="text-3xl mb-3">💳</div>
          <p className="text-gray-500 text-sm mb-4">No payment method on file.</p>
          <button
            type="button"
            onClick={() => alert('Platform billing coming soon. Contact support to update your payment method.')}
            className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            + Add payment method
          </button>
        </div>
      </div>

      {/* Invoice history */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Invoice History</h2>
        </div>
        <div className="text-center py-10">
          <div className="text-3xl mb-3 text-gray-300">🧾</div>
          <p className="text-sm text-gray-400">No invoices yet.</p>
          <p className="text-xs text-gray-400 mt-1">Platform billing invoices will appear here.</p>
        </div>
      </div>

      {/* Cancel subscription */}
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => alert('To cancel your subscription, please contact support@elevatedpos.com.')}
          className="text-sm text-red-500 hover:text-red-700 underline transition-colors"
        >
          Cancel subscription
        </button>
      </div>
    </div>
  );
}
