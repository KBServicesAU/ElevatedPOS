'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, AlertCircle, Activity, Search } from 'lucide-react';

interface Organisation {
  id: string;
  businessName: string;
  plan?: string;
  onboardingStep?: string;
  createdAt?: string;
}

interface ApiResponse {
  organisations?: Organisation[];
  data?: Organisation[];
}

export default function DashboardPage() {
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    fetch('/api/proxy/platform/organisations?limit=10')
      .then((r) => r.json())
      .then((data: ApiResponse | Organisation[]) => {
        if (Array.isArray(data)) {
          setOrgs(data);
        } else if (data && 'organisations' in data && Array.isArray(data.organisations)) {
          setOrgs(data.organisations);
        } else if (data && 'data' in data && Array.isArray(data.data)) {
          setOrgs(data.data);
        }
      })
      .catch((err: unknown) => {
        setFetchError((err as Error).message ?? 'Failed to load merchants');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Support Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitor and assist merchants</p>
      </div>

      {/* Search bar */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
        <input
          type="search"
          placeholder="Search merchants by name or email…"
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const q = (e.target as HTMLInputElement).value.trim();
              if (q) window.location.href = `/dashboard/merchants?search=${encodeURIComponent(q)}`;
            }
          }}
        />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Building2 size={20} className="text-blue-600 dark:text-blue-400" />}
          label="Total Merchants"
          value={loading ? '—' : orgs.length.toString()}
          bg="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard
          icon={<AlertCircle size={20} className="text-amber-500 dark:text-amber-400" />}
          label="Open Issues"
          value={loading ? '—' : '—'}
          subtitle="Coming soon"
          bg="bg-amber-50 dark:bg-amber-900/20"
        />
        <StatCard
          icon={<Activity size={20} className="text-green-600 dark:text-green-400" />}
          label="Recently Active"
          value={loading ? '—' : orgs.filter((o) => {
            if (!o.createdAt) return false;
            const created = new Date(o.createdAt).getTime();
            return Date.now() - created < 30 * 24 * 60 * 60 * 1000;
          }).length.toString()}
          subtitle="Last 30 days"
          bg="bg-green-50 dark:bg-green-900/20"
        />
      </div>

      {/* Recent merchant activity */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Recent Merchant Activity</h2>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Loading…</div>
        ) : fetchError ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-red-500 dark:text-red-400 flex items-center justify-center gap-2">
              <AlertCircle size={16} />
              {fetchError}
            </p>
          </div>
        ) : orgs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No merchants found</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Business Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Onboarding
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{org.businessName}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{org.plan ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{org.onboardingStep ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-500">
                    {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/dashboard/merchants/${org.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-5 flex items-center gap-4`}>
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
