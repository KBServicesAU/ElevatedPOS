'use client';

import { useEffect, useState } from 'react';
import { Building2, ExternalLink } from 'lucide-react';

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
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">My Merchants</h1>
        <p className="text-sm text-gray-500 mt-1">Merchants in your reseller portfolio</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Building2 size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">No merchants yet</p>
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
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Devices Used
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monthly Revenue
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
                  <td className="px-5 py-3 text-sm">
                    {org.plan ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 capitalize">
                        {org.plan}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <StatusBadge status={org.status} />
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {org.deviceCount !== undefined
                      ? `${org.deviceCount}${org.deviceLimit !== undefined ? ` / ${org.deviceLimit}` : ''}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">$0</td>
                  <td className="px-5 py-3 text-sm text-gray-500">
                    {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <a
                      href={`https://organisation.elevatedpos.com.au/dashboard/merchants/${org.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-800 font-medium"
                    >
                      <ExternalLink size={13} />
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

function StatusBadge({ status }: { status?: string }) {
  const s = status?.toLowerCase() ?? '';
  const classes =
    s === 'active'
      ? 'bg-green-100 text-green-700'
      : s === 'trial'
      ? 'bg-amber-100 text-amber-700'
      : s === 'inactive'
      ? 'bg-gray-100 text-gray-500'
      : 'bg-gray-100 text-gray-500';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${classes}`}
    >
      {status ?? 'unknown'}
    </span>
  );
}
