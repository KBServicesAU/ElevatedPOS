'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/lib/use-toast';
import { auditLog } from '@/lib/audit';

interface Subscription {
  id: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, string>;
  createdAt: string;
}

interface NewSubForm {
  customerEmail: string;
  customerName: string;
  priceId: string;
  trialDays: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  trialing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  past_due: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  canceled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  incomplete: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [form, setForm] = useState<NewSubForm>({
    customerEmail: '',
    customerName: '',
    priceId: '',
    trialDays: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { orgId?: string } | null) => {
        const id = me?.orgId ?? null;
        setOrgId(id);
        if (!id) { setLoading(false); return; }
        return fetch(`/api/proxy/integrations/api/v1/connect/subscriptions/${id}`)
          .then((r) => r.json())
          .then((data: { subscriptions: Subscription[] }) => setSubscriptions(data.subscriptions ?? []))
          .catch(() => setSubscriptions([]))
          .finally(() => setLoading(false));
      })
      .catch(() => { setOrgId(null); setLoading(false); });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/proxy/integrations/api/v1/connect/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          customerEmail: form.customerEmail,
          customerName: form.customerName,
          priceId: form.priceId,
          trialDays: form.trialDays ? parseInt(form.trialDays) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to create subscription');
      }
      await res.json();
      // Reload the full subscription list from the backend to get complete data
      if (orgId) {
        const listRes = await fetch(`/api/proxy/integrations/api/v1/connect/subscriptions/${orgId}`);
        if (listRes.ok) {
          const listData = await listRes.json() as { subscriptions: Subscription[] };
          setSubscriptions(listData.subscriptions ?? []);
        }
      }
      setShowNew(false);
      setForm({ customerEmail: '', customerName: '', priceId: '', trialDays: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subscription');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(subId: string) {
    setCancelling(subId);
    try {
      await fetch(`/api/proxy/integrations/api/v1/connect/subscriptions/${subId}`, {
        method: 'DELETE',
      });
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.stripeSubscriptionId === subId ? { ...s, cancelAtPeriodEnd: true } : s
        )
      );
      auditLog({ action: 'subscription.cancelled', resourceId: subId, resourceType: 'subscription' });
      toast({ title: 'Subscription cancelled', description: 'Will cancel at end of billing period.', variant: 'default' });
    } catch {
      toast({ title: 'Failed to cancel', description: 'Could not cancel subscription. Please try again.', variant: 'destructive' });
    } finally {
      setCancelling(null);
      setCancelConfirmId(null);
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Subscriptions</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage recurring billing for your customers.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + New Subscription
        </button>
      </div>

      {/* New subscription modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Create Subscription</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer email
                </label>
                <input
                  type="email"
                  required
                  value={form.customerEmail}
                  onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer name
                </label>
                <input
                  type="text"
                  required
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Stripe Price ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="price_..."
                  value={form.priceId}
                  onChange={(e) => setForm((f) => ({ ...f, priceId: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-white"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Create prices in your{' '}
                  <a
                    href="https://dashboard.stripe.com/products"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Stripe Dashboard
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Trial days (optional)
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.trialDays}
                  onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="flex-1 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="text-4xl mb-3">🔄</div>
          <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-white">No subscriptions yet</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            Create your first subscription to start recurring billing.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
          >
            + New Subscription
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Current period</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">ID</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {sub.stripeCustomerId}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[sub.status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}
                    >
                      {sub.cancelAtPeriodEnd ? 'cancels soon' : sub.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {new Date(sub.currentPeriodStart).toLocaleDateString('en-AU')} –{' '}
                    {new Date(sub.currentPeriodEnd).toLocaleDateString('en-AU')}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 dark:text-gray-500">
                    {sub.stripeSubscriptionId.slice(0, 20)}…
                  </td>
                  <td className="px-4 py-3 text-right">
                    {sub.status === 'active' && !sub.cancelAtPeriodEnd && (
                      cancelConfirmId === sub.stripeSubscriptionId ? (
                        <span className="flex items-center justify-end gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Cancel at period end?</span>
                          <button
                            onClick={() => { void handleCancel(sub.stripeSubscriptionId); }}
                            disabled={cancelling === sub.stripeSubscriptionId}
                            className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {cancelling === sub.stripeSubscriptionId ? 'Cancelling…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setCancelConfirmId(null)}
                            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setCancelConfirmId(sub.stripeSubscriptionId)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Cancel
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
