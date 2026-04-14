'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { platformFetch } from '@/lib/api';
import { Search } from 'lucide-react';

interface Org {
  id: string;
  name: string;
  slug: string;
  accountNumber: string | null;
  plan: string;
  maxLocations: number;
  maxDevices: number;
  onboardingStep: string;
  createdAt: string;
}

interface OrgsResponse {
  data: Org[];
  total: number;
  limit: number;
  offset: number;
}

interface ConnectAccount {
  orgId: string;
  stripeAccountId: string;
  status: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  businessName: string | null;
}

interface ConnectAccountsResponse {
  data: ConnectAccount[];
}

const PLAN_OPTIONS = ['', 'starter', 'growth', 'enterprise'];
const LIMIT = 20;

function planBadgeColor(plan: string): string {
  if (plan === 'enterprise') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (plan === 'growth') return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

function StripeStatusBadge({ account }: { account: ConnectAccount | undefined }) {
  if (!account) {
    return (
      <span className="px-2 py-0.5 rounded border text-xs font-medium bg-gray-500/10 text-gray-600 border-gray-700/30">
        Not set up
      </span>
    );
  }

  if (account.chargesEnabled && account.payoutsEnabled) {
    return (
      <span className="px-2 py-0.5 rounded border text-xs font-medium bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
        ✓ Active
      </span>
    );
  }

  if (account.detailsSubmitted) {
    return (
      <span className="px-2 py-0.5 rounded border text-xs font-medium bg-amber-500/20 text-amber-400 border-amber-500/30">
        ⚠ Restricted
      </span>
    );
  }

  if (account.stripeAccountId) {
    return (
      <span className="px-2 py-0.5 rounded border text-xs font-medium bg-blue-500/20 text-blue-400 border-blue-500/30">
        ○ Pending
      </span>
    );
  }

  return (
    <span className="px-2 py-0.5 rounded border text-xs font-medium bg-gray-500/10 text-gray-600 border-gray-700/30">
      Not set up
    </span>
  );
}

export default function MerchantsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [connectMap, setConnectMap] = useState<Record<string, ConnectAccount>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(0);

  // Load Stripe Connect statuses once (not paginated — all orgs in one shot)
  useEffect(() => {
    platformFetch('integrations/platform/connect-accounts')
      .then((res) => {
        const data = res as ConnectAccountsResponse;
        const map: Record<string, ConnectAccount> = {};
        for (const acc of data.data) {
          map[acc.orgId] = acc;
        }
        setConnectMap(map);
      })
      .catch(() => {
        // non-fatal — merchants table still renders, just without Stripe column
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(page * LIMIT),
      });
      if (search) params.set('search', search);
      if (plan) params.set('plan', plan);

      const data = (await platformFetch(`platform/organisations?${params.toString()}`)) as OrgsResponse;
      setOrgs(data.data);
      setTotal(data.total);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load merchants');
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, [search, plan, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Merchants</h1>
        <p className="text-gray-500 text-sm mt-1">{total} total organisations</p>
      </div>

      {loadError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
          {loadError}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by name, slug or account number…"
            className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-4 py-2 pl-9 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={plan}
          onChange={(e) => { setPlan(e.target.value); setPage(0); }}
          className="bg-[#111118] border border-[#1e1e2e] rounded px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
        >
          {PLAN_OPTIONS.map((p) => (
            <option key={p} value={p}>{p === '' ? 'All Plans' : p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Business Name</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Account #</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Plan</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">ElevatedPOS Pay</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Max Locations</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Max Devices</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Onboarding</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Created</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-gray-600">Loading...</td>
              </tr>
            ) : orgs.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-gray-600">No merchants found</td>
              </tr>
            ) : (
              orgs.map((org) => (
                <tr key={org.id} className="border-b border-[#1e1e2e] hover:bg-[#1e1e2e]/30">
                  <td className="px-6 py-3">
                    <div>
                      <p className="text-white font-medium">{org.name}</p>
                      <p className="text-gray-600 text-xs">{org.slug}</p>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="font-mono text-xs text-gray-300 tracking-widest">
                      {org.accountNumber ?? '—'}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${planBadgeColor(org.plan)}`}>
                      {org.plan}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <StripeStatusBadge account={connectMap[org.id]} />
                    {connectMap[org.id]?.stripeAccountId && (
                      <p className="text-gray-600 text-xs mt-0.5 font-mono">
                        {connectMap[org.id]!.stripeAccountId}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-400">{org.maxLocations}</td>
                  <td className="px-6 py-3 text-gray-400">{org.maxDevices}</td>
                  <td className="px-6 py-3 text-gray-400">{org.onboardingStep}</td>
                  <td className="px-6 py-3 text-gray-400">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3">
                    <Link
                      href={`/merchants/${org.id}`}
                      className="px-3 py-1 bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 rounded text-xs hover:bg-indigo-600/30 transition-colors"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-gray-500 text-sm">
            Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 bg-[#111118] border border-[#1e1e2e] text-gray-400 text-sm rounded disabled:opacity-40 hover:bg-[#1e1e2e] transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 bg-[#111118] border border-[#1e1e2e] text-gray-400 text-sm rounded disabled:opacity-40 hover:bg-[#1e1e2e] transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
