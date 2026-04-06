'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Link2, Building2, Plus, Clock, AlertCircle, TrendingUp } from 'lucide-react';

interface SignupLink {
  id: string;
  code: string;
  planId?: string;
  orgName?: string;
  note?: string;
  expiresAt?: string;
  usedAt?: string;
  usedByOrgId?: string;
  isActive: boolean;
  createdAt: string;
}

interface ApiResponse {
  links?: SignupLink[];
  data?: SignupLink[];
}

export default function DashboardPage() {
  const [links, setLinks] = useState<SignupLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/proxy/signup-links')
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Error ${r.status}`);
        }
        return r.json() as Promise<ApiResponse | SignupLink[]>;
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setLinks(data);
        } else if (data && 'links' in data && Array.isArray(data.links)) {
          setLinks(data.links);
        } else if (data && 'data' in data && Array.isArray(data.data)) {
          setLinks(data.data);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      })
      .finally(() => setLoading(false));
  }, []);

  const totalLinks = links.length;
  const usedLinks = links.filter((l) => l.usedByOrgId).length;
  const activeLinks = links.filter((l) => l.isActive && !l.usedByOrgId).length;
  const conversionRate = totalLinks > 0 ? Math.round((usedLinks / totalLinks) * 100) : 0;
  const recentLinks = links
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your sales activity overview</p>
        </div>
        <Link
          href="/dashboard/links"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Create New Link
        </Link>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Link2 size={20} className="text-emerald-500" />}
          label="Total Links Created"
          value={loading ? '...' : totalLinks.toString()}
          bg="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40"
        />
        <StatCard
          icon={<Building2 size={20} className="text-blue-500" />}
          label="Merchants Signed Up"
          value={loading ? '...' : usedLinks.toString()}
          bg="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40"
        />
        <StatCard
          icon={<Clock size={20} className="text-amber-500" />}
          label="Active Links"
          value={loading ? '...' : activeLinks.toString()}
          bg="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40"
        />
        <StatCard
          icon={<TrendingUp size={20} className="text-purple-500" />}
          label="Conversion Rate"
          value={loading ? '...' : `${conversionRate}%`}
          bg="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/40"
        />
      </div>

      {/* Recent links */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white">Recent Links</h2>
          <Link href="/dashboard/links" className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300">
            View all
          </Link>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Loading...</div>
        ) : recentLinks.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-3">No signup links yet</p>
            <Link
              href="/dashboard/links"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Create your first link
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Code
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Org Hint
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentLinks.map((link) => (
                <tr key={link.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3 text-sm font-mono text-emerald-600 dark:text-emerald-400">{link.code}</td>
                  <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">{link.orgName ?? '...'}</td>
                  <td className="px-5 py-3">
                    {link.usedByOrgId ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        Used
                      </span>
                    ) : link.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-500">
                    {new Date(link.createdAt).toLocaleDateString()}
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
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-5 flex items-center gap-4`}>
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}
