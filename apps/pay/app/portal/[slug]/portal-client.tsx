'use client';

import { useState, useCallback } from 'react';
import { PayHeader } from '@/components/pay-header';

interface Subscription {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number;
  items: { data: { price: { unit_amount: number | null; currency: string; recurring: { interval: string } | null; product: { name: string } | string } }[] };
}

interface Invoice {
  id: string;
  number: string | null;
  amount_paid: number;
  currency: string;
  status: string;
  created: number;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
}

function fmt(cents: number, currency = 'AUD') {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: currency.toUpperCase() });
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  trialing: 'bg-blue-100 text-blue-800',
  past_due: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-500',
  paid: 'bg-green-100 text-green-800',
  open: 'bg-yellow-100 text-yellow-800',
};

export function PortalClient({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{ subscriptions: Subscription[]; invoices: Invoice[]; stripeCustomerId: string } | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/portal-lookup?orgId=${orgId}&email=${encodeURIComponent(email)}`);
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'No account found for this email address.');
        setLoading(false);
        return;
      }
      const result = await res.json() as { subscriptions: Subscription[]; invoices: Invoice[]; stripeCustomerId: string };
      setData(result);
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <PayHeader subtitle={`${orgName} \u2014 Subscription Portal`} />
      <div className="max-w-xl mx-auto px-4 py-8">
        {!data ? (
          /* Email lookup form */
          <div className="bg-white rounded-2xl border border-zinc-200 p-8">
            <h1 className="text-xl font-bold text-zinc-900 mb-1">Manage your subscription</h1>
            <p className="text-zinc-500 text-sm mb-6">Enter your email address to access your subscription details.</p>
            <form onSubmit={handleLookup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email address</label>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-zinc-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors">
                {loading ? 'Looking up\u2026' : 'Access My Account \u2192'}
              </button>
            </form>
          </div>
        ) : (
          /* Subscription details */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-zinc-900">Your subscriptions</h1>
              <button onClick={() => setData(null)} className="text-sm text-zinc-500 hover:text-zinc-700">\u2190 Back</button>
            </div>

            {/* Active subscriptions */}
            {data.subscriptions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center">
                <p className="text-zinc-400">No active subscriptions found.</p>
              </div>
            ) : (
              data.subscriptions.map(sub => {
                const item = sub.items.data[0];
                const price = item?.price;
                const productName = price && typeof price.product !== 'string' ? price.product.name : 'Subscription';
                return (
                  <div key={sub.id} className="bg-white rounded-2xl border border-zinc-200 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="font-semibold text-zinc-900">{productName}</h2>
                        {price && price.unit_amount && (
                          <p className="text-sm text-zinc-500 mt-0.5">
                            {fmt(price.unit_amount, price.currency)} / {price.recurring?.interval ?? 'month'}
                          </p>
                        )}
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[sub.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {sub.status}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      {sub.cancel_at_period_end
                        ? `Cancels ${new Date(sub.current_period_end * 1000).toLocaleDateString('en-AU')}`
                        : `Renews ${new Date(sub.current_period_end * 1000).toLocaleDateString('en-AU')}`}
                    </div>
                    <div className="mt-4 pt-4 border-t border-zinc-100 flex gap-3">
                      <a href={`/portal/${orgId}/update-payment?customer=${data.stripeCustomerId}`}
                        className="flex-1 text-center py-2 border border-zinc-300 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                        Update Payment Method
                      </a>
                    </div>
                  </div>
                );
              })
            )}

            {/* Invoice history */}
            {data.invoices.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-200 p-6">
                <h2 className="font-semibold text-zinc-900 mb-4">Invoice history</h2>
                <div className="space-y-2">
                  {data.invoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between py-2 border-b border-zinc-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{inv.number ?? inv.id.slice(0, 12)}</p>
                        <p className="text-xs text-zinc-400">{new Date(inv.created * 1000).toLocaleDateString('en-AU')}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {inv.status}
                        </span>
                        <span className="text-sm font-semibold text-zinc-900">{fmt(inv.amount_paid, inv.currency)}</span>
                        {inv.invoice_pdf && (
                          <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-zinc-400 hover:text-zinc-700">PDF &#x2197;</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <p className="text-center text-xs text-zinc-400 mt-8">Powered by ElevatedPOS</p>
      </div>
    </div>
  );
}
