'use client';

import { useEffect, useState } from 'react';
import { Building2, ExternalLink, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Organisation {
  id: string;
  businessName: string;
  plan?: string;
  status?: string;
  createdAt?: string;
  resellerOrgId?: string;
  deviceCount?: number;
  deviceLimit?: number;
}

interface ApiResponse {
  organisations?: Organisation[];
  data?: Organisation[];
}

export default function MyMerchantsPage() {
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">My Merchants</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Merchants in your reseller portfolio</p>
        </div>
        <Link
          href="/dashboard/add-merchant"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Add Merchant
        </Link>
      </div>

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

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Loading…</div>
        ) : orgs.length === 0 && !error ? (
          <div className="px-5 py-10 text-center">
            <Building2 size={36} className="mx-auto text-gray-200 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">No merchants yet</p>
            <Link
              href="/dashboard/add-merchant"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Add your first merchant
            </Link>
          </div>
        ) : !error ? (
          <div className="overflow-x-auto">
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
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Devices Used
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Monthly Revenue
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {orgs.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{org.businessName}</td>
                    <td className="px-5 py-3 text-sm">
                      {org.plan ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 capitalize">
                          {org.plan}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <StatusBadge status={org.status} />
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {org.deviceCount !== undefined
                        ? `${org.deviceCount}${org.deviceLimit !== undefined ? ` / ${org.deviceLimit}` : ''}`
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">$0</td>
                    <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href={`${process.env.NEXT_PUBLIC_ORG_PORTAL_URL ?? 'https://organisation.elevatedpos.com.au'}/dashboard/merchants/${org.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 font-medium"
                      >
                        <ExternalLink size={13} />
                        Support
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = status?.toLowerCase() ?? '';
  const classes =
    s === 'active'
      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
      : s === 'trial'
      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
      : s === 'inactive' || s === 'suspended'
      ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${classes}`}
    >
      {status ?? 'unknown'}
    </span>
  );
}
