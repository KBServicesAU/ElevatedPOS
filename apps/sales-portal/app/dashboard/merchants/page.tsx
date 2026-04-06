'use client';

import { useEffect, useState } from 'react';
import { Building2, AlertCircle } from 'lucide-react';

interface SignupLink {
  id: string;
  code: string;
  planId?: string;
  orgName?: string;
  usedAt?: string;
  usedByOrgId?: string;
  isActive: boolean;
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
}

interface LinksApiResponse {
  links?: SignupLink[];
  data?: SignupLink[];
}

interface PlansApiResponse {
  plans?: Plan[];
  data?: Plan[];
}

export default function MerchantsPage() {
  const [usedLinks, setUsedLinks] = useState<SignupLink[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/proxy/signup-links?used=true')
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({})) as { error?: string };
            throw new Error(body.error ?? `Error ${r.status}`);
          }
          return r.json() as Promise<LinksApiResponse | SignupLink[]>;
        })
        .then((data) => {
          if (Array.isArray(data)) return data;
          if (data && 'links' in data && Array.isArray(data.links)) return data.links;
          if (data && 'data' in data && Array.isArray(data.data)) return data.data;
          return [] as SignupLink[];
        }),

      fetch('/api/proxy/plans/public')
        .then(async (r) => {
          if (!r.ok) return [] as Plan[];
          return r.json() as Promise<PlansApiResponse | Plan[]>;
        })
        .then((data) => {
          if (Array.isArray(data)) return data;
          if (data && 'plans' in data && Array.isArray(data.plans)) return data.plans;
          if (data && 'data' in data && Array.isArray(data.data)) return data.data;
          return [] as Plan[];
        })
        .catch(() => [] as Plan[]),
    ])
      .then(([linksData, plansData]) => {
        setUsedLinks(linksData.filter((l) => l.usedByOrgId));
        setPlans(plansData);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load merchants');
      })
      .finally(() => setLoading(false));
  }, []);

  const getPlanName = (planId?: string) => {
    if (!planId) return '---';
    return plans.find((p) => p.id === planId)?.name ?? planId.slice(0, 8) + '...';
  };

  const sortedLinks = usedLinks
    .slice()
    .sort(
      (a, b) =>
        new Date(b.usedAt ?? b.createdAt).getTime() -
        new Date(a.usedAt ?? a.createdAt).getTime(),
    );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">My Merchants</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Organisations that signed up via your links</p>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/40 p-5 flex items-center gap-4 w-fit">
        <Building2 size={20} className="text-blue-500" />
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Merchants</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? '...' : sortedLinks.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Loading...</div>
        ) : sortedLinks.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Building2 size={36} className="text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-500">No merchants have signed up via your links yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-900/60">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                    Org ID
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                    Org Name
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                    Link Code
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                    Signed Up
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {sortedLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                        {link.usedByOrgId}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {link.orgName ?? '---'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400">{link.code}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {getPlanName(link.planId)}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-500">
                      {link.usedAt
                        ? new Date(link.usedAt).toLocaleDateString()
                        : '---'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
