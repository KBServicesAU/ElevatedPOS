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
      .catch(() => {
        // silently fail — show empty state
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Support Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor and assist merchants</p>
      </div>

      {/* Search bar */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="search"
          placeholder="Search merchants by name or email…"
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-white"
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
          icon={<Building2 size={20} className="text-blue-600" />}
          label="Total Merchants"
          value={loading ? '—' : orgs.length.toString()}
          bg="bg-blue-50"
        />
        <StatCard
          icon={<AlertCircle size={20} className="text-amber-500" />}
          label="Open Issues"
          value="0"
          bg="bg-amber-50"
        />
        <StatCard
          icon={<Activity size={20} className="text-green-600" />}
          label="Recently Active"
          value="—"
          bg="bg-green-50"
        />
      </div>

      {/* Recent merchant activity */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Recent Merchant Activity</h2>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No merchants found</div>
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
                  Onboarding
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{org.businessName}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{org.plan ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{org.onboardingStep ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">
                    {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/dashboard/merchants/${org.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
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
