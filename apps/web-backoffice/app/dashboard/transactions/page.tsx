'use client';

import { useState, useEffect } from 'react';

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

const STATUS_COLORS: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
  refunded: 'bg-orange-100 text-orange-800',
};

function formatAUD(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-AU');
}

function stripeFeeEstimate(amount: number): number {
  // 1.75% + $0.30 AUD (30 cents)
  return Math.round(amount * 0.0175 + 30);
}

function platformFee(amount: number): number {
  return Math.round(amount * 0.01);
}

export default function TransactionsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (me: { orgId?: string } | null) => {
        const id = me?.orgId ?? null;
        setOrgId(id);
        if (!id) { setLoading(false); return; }
        return fetch(`/api/proxy/integrations/api/v1/connect/charges/${id}?limit=50`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data: Charge[] | { data?: Charge[] } | null) => {
            if (!data) return;
            if (Array.isArray(data)) setCharges(data);
            else if (data.data) setCharges(data.data);
          })
          .catch(() => null)
          .finally(() => setLoading(false));
      })
      .catch(() => { setOrgId(null); setLoading(false); });
  }, []);

  const successfulCharges = charges.filter((c) => c.status === 'succeeded');
  const totalVolume = successfulCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalPlatformFees = successfulCharges.reduce((sum, c) => sum + platformFee(c.amount), 0);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-24 bg-gray-200 rounded-2xl" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <p className="text-gray-500 mt-1">All payments processed through your account.</p>
      </div>

      {!orgId ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="font-semibold text-lg mb-1">Not connected</h3>
          <p className="text-gray-500 text-sm">
            Connect your Stripe account in{' '}
            <a href="/dashboard/payments" className="text-indigo-600 underline">
              Payments
            </a>{' '}
            to view transactions.
          </p>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Total Volume
              </p>
              <p className="text-2xl font-bold text-gray-900">{formatAUD(totalVolume)}</p>
              <p className="text-xs text-gray-400 mt-1">Successful charges only</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Platform Fees (1%)
              </p>
              <p className="text-2xl font-bold text-gray-900">{formatAUD(totalPlatformFees)}</p>
              <p className="text-xs text-gray-400 mt-1">Applied to successful charges</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Transactions
              </p>
              <p className="text-2xl font-bold text-gray-900">{charges.length}</p>
              <p className="text-xs text-gray-400 mt-1">{successfulCharges.length} succeeded</p>
            </div>
          </div>

          {/* Table */}
          {charges.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
              <div className="text-4xl mb-3">💳</div>
              <h3 className="font-semibold text-lg mb-1">No transactions yet</h3>
              <p className="text-gray-500 text-sm">
                Transactions will appear here once payments are processed.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3 px-4 pt-4">
                        Date
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3 px-4 pt-4">
                        Customer
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3 px-4 pt-4">
                        Description
                      </th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3 px-4 pt-4">
                        Amount
                      </th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3 px-4 pt-4">
                        Stripe Fee ~
                      </th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3 px-4 pt-4">
                        Platform Fee
                      </th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3 px-4 pt-4">
                        Net
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3 px-4 pt-4">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {charges.map((charge) => {
                      const sfee = stripeFeeEstimate(charge.amount);
                      const pfee = platformFee(charge.amount);
                      const net = charge.amount - sfee - pfee;
                      return (
                        <tr key={charge.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {formatDate(charge.created)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 max-w-[120px] truncate">
                            {charge.billing_details?.name ?? charge.customer ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 max-w-[160px] truncate">
                            {charge.description ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">
                            {formatAUD(charge.amount)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right whitespace-nowrap">
                            {charge.status === 'succeeded' ? formatAUD(sfee) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right whitespace-nowrap">
                            {charge.status === 'succeeded' ? formatAUD(pfee) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-700 text-right whitespace-nowrap">
                            {charge.status === 'succeeded' ? formatAUD(net) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[charge.status] ?? 'bg-gray-100 text-gray-600'}`}
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
          )}
        </>
      )}
    </div>
  );
}
