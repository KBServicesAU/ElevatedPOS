'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';

interface Organisation {
  id: string;
  businessName: string;
  plan?: string;
  onboardingStep?: string;
  createdAt?: string;
  employees?: { email: string }[];
}

interface ApiResponse {
  organisations?: Organisation[];
  data?: Organisation[];
}

function MerchantsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get('search') ?? '');
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOrgs = useCallback((q: string) => {
    setLoading(true);
    const url = q
      ? `/api/proxy/platform/organisations?search=${encodeURIComponent(q)}`
      : '/api/proxy/platform/organisations';
    fetch(url)
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
        setOrgs([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const initial = searchParams.get('search') ?? '';
    fetchOrgs(initial);
  }, [fetchOrgs, searchParams]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/merchants${query ? `?search=${encodeURIComponent(query)}` : ''}`);
    fetchOrgs(query);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Merchants</h1>
        <p className="text-sm text-gray-500 mt-1">Search and manage merchant accounts</p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="search"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-white"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Search
        </button>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No merchants found</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Business Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Onboarding
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{org.businessName}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">
                    {org.employees?.[0]?.email ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {org.plan ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                        {org.plan}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
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

export default function MerchantsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 p-6">Loading…</div>}>
      <MerchantsContent />
    </Suspense>
  );
}
