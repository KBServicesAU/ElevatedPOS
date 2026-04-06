'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/lib/use-toast';

interface BalanceAmount {
  amount: number;
  currency: string;
}

interface Balance {
  available: BalanceAmount[];
  pending: BalanceAmount[];
}

interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'canceled' | string;
  arrival_date: number;
  created: number;
  description: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  canceled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

function formatAUD(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-AU');
}

export default function PayoutsPage() {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (me: { orgId?: string } | null) => {
        const id = me?.orgId ?? null;
        setOrgId(id);
        if (!id) { setLoading(false); return; }

        await Promise.allSettled([
          fetch(`/api/proxy/integrations/api/v1/connect/balance/${id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: Balance | null) => { if (data) setBalance(data); })
            .catch(() => {
              toast({ title: 'Error', description: 'Failed to load account balance.', variant: 'destructive' });
            }),
          fetch(`/api/proxy/integrations/api/v1/connect/payouts/${id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: Payout[] | { data?: Payout[] } | null) => {
              if (!data) return;
              if (Array.isArray(data)) setPayouts(data);
              else if (data.data) setPayouts(data.data);
            })
            .catch(() => {
              setPayouts([]);
              toast({ title: 'Error', description: 'Failed to load payouts data.', variant: 'destructive' });
            }),
        ]);
        setLoading(false);
      })
      .catch(() => { setOrgId(null); setLoading(false); });
  }, []);

  const availableAUD = balance?.available
    .filter((a) => a.currency === 'aud')
    .reduce((sum, a) => sum + a.amount, 0) ?? 0;

  const pendingAUD = balance?.pending
    .filter((a) => a.currency === 'aud')
    .reduce((sum, a) => sum + a.amount, 0) ?? 0;

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payouts</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Track payouts from your Stripe account to your bank.
        </p>
      </div>

      {/* Balance card */}
      {orgId && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            Balance
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Available</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatAUD(availableAUD)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Ready to payout</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Pending</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatAUD(pendingAUD)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Estimated 2–5 business days</p>
            </div>
          </div>
        </div>
      )}

      {/* Payouts table */}
      {!orgId ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-white">Not connected</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Connect your Stripe account in{' '}
            <a href="/dashboard/payments" className="text-indigo-600 underline">
              Payments
            </a>{' '}
            to view payouts.
          </p>
        </div>
      ) : payouts.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="text-4xl mb-3">💸</div>
          <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-white">No payouts yet</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Payouts will appear here once funds are transferred to your bank.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                  Date
                </th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                  Amount
                </th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                  Arrival Date
                </th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3 px-4 pt-4">
                  ID
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {payouts.map((payout) => (
                <tr key={payout.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(payout.created)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                    {formatAUD(payout.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[payout.status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}
                    >
                      {payout.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(payout.arrival_date)}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-400 dark:text-gray-500">{payout.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
