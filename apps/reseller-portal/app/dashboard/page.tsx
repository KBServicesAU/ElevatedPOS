'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, DollarSign, TrendingUp, RefreshCw, Plus, AlertCircle } from 'lucide-react';

interface Organisation {
  id: string;
  businessName: string;
  plan?: string;
  createdAt?: string;
  status?: string;
}

interface ApiResponse {
  organisations?: Organisation[];
  data?: Organisation[];
}

export default function ResellerDashboardPage() {
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function loadOrgs() {
    setLoading(true);
    setError('');
    fetch('/api/proxy/platform/organisations')
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Server error ${r.status}`);
        }
        return r.json();
      })
      .then((data: ApiResponse | Organisation[]) => {
        if (Array.isArray(data)) {
          setOrgs(data);
        } else if (data && 'organisations' in data && Array.isArray(data.organisations)) {
          setOrgs(data.organisations);
        } else if (data && 'data' in data && Array.isArray(data.data)) {
          setOrgs(data.data);
        } else {
          setOrgs([]);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load merchants');
        setOrgs([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadOrgs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Welcome back — your reseller overview</p>
        </div>
        <Link
          href="/dashboard/add-merchant"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Merchant
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Building2 size={20} className="text-emerald-600" />}
          label="My Merchants"
          value={loading ? '—' : orgs.length.toString()}
          bg="bg-emerald-50 dark:bg-emerald-900/20"
        />
        <KpiCard
          icon={<DollarSign size={20} className="text-blue-600" />}
          label="Monthly Revenue"
          value={loading ? '—' : '—'}
          subtitle="Coming soon"
          bg="bg-blue-50 dark:bg-blue-900/20"
        />
        <KpiCard
          icon={<TrendingUp size={20} className="text-purple-600" />}
          label="Commission Earned"
          value={loading ? '—' : '—'}
          subtitle="Coming soon"
          bg="bg-purple-50 dark:bg-purple-900/20"
        />
        <KpiCard
          icon={<RefreshCw size={20} className="text-amber-500" />}
          label="Trial Conversions"
          value={loading ? '—' : orgs.filter((o) => o.status === 'active' && o.plan && o.plan !== 'trial').length.toString()}
          bg="bg-amber-50 dark:bg-amber-900/20"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          <button
            onClick={loadOrgs}
            className="ml-auto text-sm font-medium text-red-700 dark:text-red-400 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Recent merchants */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Recent Merchants</h2>
          <Link href="/dashboard/merchants" className="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium">
            View all
          </Link>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Loading…</div>
        ) : orgs.length === 0 && !error ? (
          <div className="px-5 py-10 text-center">
            <Building2 size={36} className="mx-auto text-gray-200 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No merchants yet</p>
            <Link
              href="/dashboard/add-merchant"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={15} />
              Add your first merchant
            </Link>
          </div>
        ) : !error ? (
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Business Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {orgs.slice(0, 10).map((org) => (
                <tr key={org.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{org.businessName}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {org.plan ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 capitalize">
                        {org.plan}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <a
                      href={`${process.env.NEXT_PUBLIC_ORG_PORTAL_URL ?? 'https://organisation.elevatedpos.com.au'}/dashboard/merchants/${org.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 font-medium"
                    >
                      Support
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

function KpiCard({
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
        <p className="text-sm text-gray-600 dark:text-gray-300">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
