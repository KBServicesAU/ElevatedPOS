'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';

interface BillingDetails {
  name?: string | null;
}

interface Charge {
  id: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending' | 'refunded' | string;
  created: number;
  description: string | null;
  customer: string | null;
  receipt_url: string | null;
  billing_details: BillingDetails;
  application_fee_amount: number | null;
}

interface PaymentFeeSettings {
  platformPercentage?: number; // e.g. 1 for 1%
}

const STATUS_COLORS: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  refunded: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

function formatAUD(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-AU');
}

const DEFAULT_FEES: PaymentFeeSettings = {
  platformPercentage: undefined,
};

function calcPlatformFee(amount: number, fees: PaymentFeeSettings): number | null {
  if (fees.platformPercentage == null) return null;
  return Math.round(amount * (fees.platformPercentage / 100));
}

export default function TransactionsPage() {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [feeSettings, setFeeSettings] = useState<PaymentFeeSettings>(DEFAULT_FEES);

  async function loadChargesPage(id: string, offset: number): Promise<Charge[]> {
    const res = await fetch(
      `/api/proxy/integrations/api/v1/connect/charges/${id}?limit=50&offset=${offset}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Charge[] | { data?: Charge[] } | null;
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return data.data ?? [];
  }

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (me: { orgId?: string } | null) => {
        const id = me?.orgId ?? null;
        setOrgId(id);
        if (!id) { setLoading(false); return; }

        // Fetch fee settings and charges in parallel
        const [, chargesResult] = await Promise.allSettled([
          apiFetch<PaymentFeeSettings>('settings/payment-fees')
            .then((fees) => setFeeSettings({ ...DEFAULT_FEES, ...fees }))
            .catch(() => { /* keep defaults */ }),
          loadChargesPage(id, 0)
            .then((page) => { setCharges(page); setHasMore(page.length === 50); })
            .catch(() => {
              setCharges([]);
              toast({ title: 'Error', description: 'Failed to load transactions. Please try refreshing the page.', variant: 'destructive' });
            }),
        ]);
        void chargesResult;
        setLoading(false);
      })
      .catch(() => { setOrgId(null); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLoadMore() {
    if (!orgId || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadChargesPage(orgId, charges.length);
      setCharges((prev) => [...prev, ...page]);
      setHasMore(page.length === 50);
    } finally {
      setLoadingMore(false);
    }
  }

  const successfulCharges = charges.filter((c) => c.status === 'succeeded');
  const totalVolume = successfulCharges.reduce((sum, c) => sum + c.amount, 0);
  const showPlatformFee = feeSettings.platformPercentage != null;

  if (loading) {
    return (
      <div className="p-8 dark:bg-gray-950 min-h-screen">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-48" />
          <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
          <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transactions</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">All payments processed through your account.</p>
      </div>

      {!orgId ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-white">Not connected</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Connect your Stripe account in{' '}
            <a href="/dashboard/payments" className="text-indigo-600 dark:text-indigo-400 underline">
              Payments
            </a>{' '}
            to view transactions.
          </p>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className={`grid gap-4 mb-6 ${showPlatformFee ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Total Volume
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatAUD(totalVolume)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Successful charges only</p>
            </div>
            {showPlatformFee && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Platform Fees ({feeSettings.platformPercentage}%)
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatAUD(successfulCharges.reduce((sum, c) => sum + (calcPlatformFee(c.amount, feeSettings) ?? 0), 0))}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Applied to successful charges</p>
              </div>
            )}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Transactions
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{charges.length}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{successfulCharges.length} succeeded</p>
            </div>
          </div>

          {/* Table */}
          {charges.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
              <div className="text-4xl mb-3">💳</div>
              <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-white">No transactions yet</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Transactions will appear here once payments are processed.
              </p>
            </div>
          ) : (
            <>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                        Date
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                        Customer
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                        Description
                      </th>
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                        Amount
                      </th>
                      {showPlatformFee && (
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                          Est. Platform Fee
                        </th>
                      )}
                      <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {charges.map((charge) => {
                      const pfee = charge.status === 'succeeded' ? calcPlatformFee(charge.amount, feeSettings) : null;
                      return (
                        <tr key={charge.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {formatDate(charge.created)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                            {charge.billing_details?.name ?? charge.customer ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[160px] truncate">
                            {charge.description ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white text-right whitespace-nowrap">
                            {formatAUD(charge.amount)}
                          </td>
                          {showPlatformFee && (
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-right whitespace-nowrap">
                              {pfee != null ? formatAUD(pfee) : '—'}
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[charge.status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}
                            >
                              {charge.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              Card processing fees are deducted by Stripe. See your{' '}
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600 dark:hover:text-gray-300"
              >
                Stripe dashboard
              </a>{' '}
              for exact amounts. Estimated platform fees are for reference only — actual fees are invoiced separately.
            </p>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
            </>
          )}
        </>
      )}
    </div>
  );
}
