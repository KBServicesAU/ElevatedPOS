'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, DollarSign, TrendingUp, RefreshCw, Plus } from 'lucide-react';

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

  useEffect(() => {
    fetch('/api/proxy/platform/organisations')
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
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back — your reseller overview</p>
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
          bg="bg-emerald-50"
        />
        <KpiCard
          icon={<DollarSign size={20} className="text-blue-600" />}
          label="Monthly Revenue"
          value="$0"
          bg="bg-blue-50"
        />
        <KpiCard
          icon={<TrendingUp size={20} className="text-purple-600" />}
          label="Commission Earned"
          value="$0"
          bg="bg-purple-50"
        />
        <KpiCard
          icon={<RefreshCw size={20} className="text-amber-500" />}
          label="Trial Conversions"
          value="0"
          bg="bg-amber-50"
        />
      </div>

      {/* Recent merchants */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Recent Merchants</h2>
          <Link href="/dashboard/merchants" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
            View all
          </Link>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Building2 size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-500 mb-3">No merchants yet</p>
            <Link
              href="/dashboard/add-merchant"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={15} />
              Add your first merchant
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Business Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.slice(0, 10).map((org) => (
                <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{org.businessName}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {org.plan ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 capitalize">
                        {org.plan}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">
                    {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <a
                      href={`https://organisation.elevatedpos.com.au/dashboard/merchants/${org.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-emerald-600 hover:text-emerald-800 font-medium"
                    >
                      Support
                    </a>
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

function KpiCard({
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
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
