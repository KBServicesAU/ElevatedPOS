'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';

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

  useEffect(() => {
    Promise.all([
      fetch('/api/proxy/signup-links?used=true')
        .then((r) => r.json())
        .then((data: LinksApiResponse | SignupLink[]) => {
          if (Array.isArray(data)) return data;
          if (data && 'links' in data && Array.isArray(data.links)) return data.links;
          if (data && 'data' in data && Array.isArray(data.data)) return data.data;
          return [] as SignupLink[];
        })
        .catch(() => [] as SignupLink[]),

      fetch('/api/proxy/plans/public')
        .then((r) => r.json())
        .then((data: PlansApiResponse | Plan[]) => {
          if (Array.isArray(data)) return data;
          if (data && 'plans' in data && Array.isArray(data.plans)) return data.plans;
          if (data && 'data' in data && Array.isArray(data.data)) return data.data;
          return [] as Plan[];
        })
        .catch(() => [] as Plan[]),
    ])
      .then(([linksData, plansData]) => {
        // Filter to only links that have been used (have usedByOrgId)
        setUsedLinks((linksData as SignupLink[]).filter((l) => l.usedByOrgId));
        setPlans(plansData as Plan[]);
      })
      .finally(() => setLoading(false));
  }, []);

  const getPlanName = (planId?: string) => {
    if (!planId) return '—';
    return plans.find((p) => p.id === planId)?.name ?? planId.slice(0, 8) + '…';
  };

  const sortedLinks = usedLinks
    .slice()
    .sort((a, b) => new Date(b.usedAt ?? b.createdAt).getTime() - new Date(a.usedAt ?? a.createdAt).getTime());

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">My Merchants</h1>
        <p className="text-sm text-gray-400 mt-1">Organisations that signed up via your links</p>
      </div>

      {/* Summary */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex items-center gap-4 w-fit">
        <Building2 size={20} className="text-blue-400" />
        <div>
          <p className="text-sm text-gray-400">Total Merchants</p>
          <p className="text-2xl font-bold text-white">{loading ? '—' : sortedLinks.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">Loading…</div>
        ) : sortedLinks.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Building2 size={36} className="text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No merchants have signed up via your links yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800">
              <thead className="bg-gray-900/60">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Org ID
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Org Name
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Link Code
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Signed Up
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-gray-400">
                        {link.usedByOrgId}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-300">
                      {link.orgName ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-sm text-emerald-400">{link.code}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-300">
                      {getPlanName(link.planId)}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {link.usedAt
                        ? new Date(link.usedAt).toLocaleDateString()
                        : '—'}
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
