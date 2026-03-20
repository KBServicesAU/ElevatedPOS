'use client';

import { useState } from 'react';
import { Plus, Search, Star, TrendingUp, Users, Gift } from 'lucide-react';
import { useCustomers } from '../../../lib/hooks';
import type { Customer } from '../../../lib/api';

const tierColors: Record<string, string> = {
  platinum: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  gold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  silver: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  bronze: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(iso?: string) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export function CustomersClient() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError } = useCustomers({
    search: search || undefined,
    limit: 50,
  });

  const customers = data?.data ?? [];
  const total = data?.pagination?.total ?? customers.length;

  // Compute summary stats from returned data (real stats would come from a dedicated endpoint)
  const loyaltyMembers = customers.filter((c) => c.loyaltyTier).length;
  const avgSpend =
    customers.length > 0
      ? customers.reduce((sum, c) => sum + (c.totalSpend ?? 0), 0) / customers.length
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Customers</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${total} registered customers`}
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Customers', value: isLoading ? '—' : total.toLocaleString(), icon: Users, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
          { label: 'Avg Lifetime Value', value: isLoading ? '—' : formatCurrency(avgSpend), icon: TrendingUp, color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
          { label: 'Loyalty Members', value: isLoading ? '—' : loyaltyMembers.toLocaleString(), icon: Star, color: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              <div className={`rounded-xl p-2 ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {/* Customer table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {isError ? (
          <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">
            Failed to load customers.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Customer</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tier</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Visits</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Total Spend</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Points</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Last Visit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '80%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : customers.map((c: Customer) => {
                    const initials = `${c.firstName[0]}${c.lastName[0]}`.toUpperCase();
                    const tier = c.loyaltyTier?.toLowerCase() ?? '';
                    return (
                      <tr key={c.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                              {initials}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {c.firstName} {c.lastName}
                              </p>
                              <p className="text-xs text-gray-400">{c.email ?? c.phone ?? '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {tier ? (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tierColors[tier] ?? 'bg-gray-100 text-gray-600'}`}>
                              <Star className="h-3 w-3" /> {c.loyaltyTier}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{c.totalVisits}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">
                          {formatCurrency(c.totalSpend)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                            <Gift className="h-3.5 w-3.5 text-indigo-500" />
                            {(c.loyaltyPoints ?? 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                          {timeAgo(c.lastVisitAt)}
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
