'use client';

import { useState, useEffect } from 'react';
import {
  Building2,
  CreditCard,
  LifeBuoy,
  FileText,
  Activity,
  User,
  Hash,
} from 'lucide-react';

interface SessionMe {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string | null;
  orgId?: string;
  plan?: string;
}

function formatMemberSince(dateStr?: string): string {
  if (!dateStr) return 'Member since 2025';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  } catch {
    return 'Member since 2025';
  }
}

export default function AccountPage() {
  const [me, setMe] = useState<SessionMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SessionMe | null) => setMe(data))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-36" />
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-64" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      </div>
    );
  }

  const accountNumber = me?.orgId
    ? `EPS-${me.orgId.slice(0, 8).toUpperCase()}`
    : 'EPS---------';
  const businessName = 'Your Business';
  const fullName =
    [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Account Owner';
  const email = me?.email ?? '';
  const plan = me?.plan ?? 'Starter';

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Manage your ElevatedPOS account details and subscription.
        </p>
      </div>

      {/* ── 1. Account Details ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-5">
        <div className="flex items-center gap-2 mb-5">
          <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Account Details
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Account Number */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Hash className="w-3 h-3 text-gray-400" />
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Account Number
              </p>
            </div>
            <p className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
              {accountNumber}
            </p>
          </div>

          {/* Business Name */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 className="w-3 h-3 text-gray-400" />
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Business Name
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {businessName}
            </p>
          </div>

          {/* Account Owner */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3 h-3 text-gray-400" />
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Account Owner
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{fullName}</p>
            {email && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{email}</p>
            )}
          </div>

          {/* Member Since */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3 h-3 text-gray-400" />
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Member Since
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Member since {formatMemberSince()}
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Subscription ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Subscription
            </h2>
          </div>
          <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-sm font-semibold">
            {plan}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Current Plan
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{plan}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Status
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-green-600 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Active
            </span>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Billing Cycle
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">Monthly</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Change Plan
          </a>
          <a
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Manage Billing
          </a>
        </div>
      </div>

      {/* ── 3. Support ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-5">
        <div className="flex items-center gap-2 mb-5">
          <LifeBuoy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Support</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Live Chat */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-indigo-500" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Live Chat</p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              Chat with our team
            </p>
            <a
              href="mailto:support@elevatedpos.com.au"
              className="inline-flex items-center justify-center px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
            >
              Contact Us
            </a>
          </div>

          {/* Documentation */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Documentation
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              Browse help articles
            </p>
            <a
              href="https://help.elevatedpos.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-white dark:hover:bg-gray-700 transition-colors"
            >
              View Docs ↗
            </a>
          </div>

          {/* System Status */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                System Status
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              Check service health
            </p>
            <a
              href="https://status.elevatedpos.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-white dark:hover:bg-gray-700 transition-colors"
            >
              View Status ↗
            </a>
          </div>
        </div>
      </div>

      {/* ── 4. Danger Zone ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-6 mb-5">
        <h2 className="text-base font-semibold text-red-600 dark:text-red-400 mb-2">
          Danger Zone
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Once you cancel your subscription, you will lose access to all paid features at the
          end of your current billing period.
        </p>
        <a
          href="mailto:support@elevatedpos.com.au?subject=Cancel%20Subscription"
          className="inline-block px-4 py-2 border border-red-400 dark:border-red-600 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Cancel Subscription
        </a>
      </div>
    </div>
  );
}
