'use client';

import { useState, useEffect } from 'react';

interface SessionMe {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string | null;
  orgId?: string;
  plan?: string;
}

interface BillingSubscription {
  status?: string;
  interval?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string;
}

// ─── Payment Method Section ──────────────────────────────────────────────────

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

function PaymentMethodSection() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Card form fields
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');

  useEffect(() => {
    fetch('/api/proxy/billing/payment-methods')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PaymentMethod[] | { data?: PaymentMethod[] } | null) => {
        if (!data) return;
        const arr = Array.isArray(data) ? data : (data.data ?? []);
        setMethods(arr);
      })
      .catch(() => {});
  }, []);

  function formatCardNumber(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  }

  function formatExpiry(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + ' / ' + digits.slice(2);
    return digits;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/billing/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardholderName: cardName,
          number: cardNumber.replace(/\s/g, ''),
          expMonth: parseInt(expiry.split('/')[0]?.trim() ?? '0', 10),
          expYear: parseInt('20' + (expiry.split('/')[1]?.trim() ?? '0'), 10),
          cvc: cvc,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Failed to add payment method');
      }
      const pm = (await res.json()) as PaymentMethod;
      setMethods((prev) => [...prev, pm]);
      setShowForm(false);
      setCardName('');
      setCardNumber('');
      setExpiry('');
      setCvc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment method');
    } finally {
      setSaving(false);
    }
  }

  function handleRemove(id: string) {
    fetch(`/api/proxy/billing/payment-methods/${id}`, { method: 'DELETE' })
      .then((r) => {
        if (r.ok) setMethods((prev) => prev.filter((m) => m.id !== id));
      })
      .catch(() => {});
  }

  const brandIcon: Record<string, string> = {
    visa: '💳 Visa',
    mastercard: '💳 Mastercard',
    amex: '💳 Amex',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Payment Method</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      {/* Existing methods */}
      {methods.length > 0 && (
        <div className="space-y-3 mb-4">
          {methods.map((pm) => (
            <div key={pm.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {brandIcon[pm.brand.toLowerCase()] ?? `💳 ${pm.brand}`}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  **** {pm.last4}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Exp {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}
                </span>
              </div>
              <button
                onClick={() => handleRemove(pm.id)}
                className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {methods.length === 0 && !showForm && (
        <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="text-3xl mb-3">💳</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">No payment method on file.</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Add Payment Method
          </button>
        </div>
      )}

      {/* Add card form */}
      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cardholder Name
            </label>
            <input
              type="text"
              required
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Card Number
            </label>
            <input
              type="text"
              required
              inputMode="numeric"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              placeholder="4242 4242 4242 4242"
              maxLength={19}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expiry
              </label>
              <input
                type="text"
                required
                inputMode="numeric"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                placeholder="MM / YY"
                maxLength={7}
                className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                CVC
              </label>
              <input
                type="text"
                required
                inputMode="numeric"
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="123"
                maxLength={4}
                className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none font-mono"
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded-lg px-4 py-2">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Card'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(''); }}
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Your card details are transmitted securely and never stored in our app.
          </p>
        </form>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [me, setMe] = useState<SessionMe | null>(null);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/proxy/billing/subscription').then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([meData, subData]: [SessionMe | null, BillingSubscription | null]) => {
      setMe(meData);
      setSubscription(subData);
    }).finally(() => setLoading(false));
  }, []);

  const plan = me?.plan ?? 'Starter';
  const subStatus = subscription?.status ?? 'active';
  const subInterval = subscription?.interval ?? 'month';
  const statusLabel = subscription?.cancelAtPeriodEnd ? 'Cancelling' : subStatus.charAt(0).toUpperCase() + subStatus.slice(1);
  const statusColor = subStatus === 'active' && !subscription?.cancelAtPeriodEnd ? 'text-green-600' : 'text-amber-600';
  const intervalLabel = subInterval === 'year' ? 'Annual' : 'Monthly';

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-36" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your ElevatedPOS subscription and payment method.</p>
      </div>

      {/* Current plan */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Current Plan</h2>
          <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-sm font-semibold">
            {plan}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Plan</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{plan}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Status</p>
            <p className={`text-lg font-bold ${statusColor}`}>{statusLabel}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Billing</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{intervalLabel}</p>
          </div>
        </div>
        {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
          <p className="mb-4 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-2">
            Your subscription will cancel on {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        )}

        <a
          href="/dashboard/billing/plans"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Upgrade Plan →
        </a>
      </div>

      {/* Payment method */}
      <PaymentMethodSection />

      {/* Invoice history */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Invoice History</h2>
        </div>
        <div className="text-center py-10">
          <div className="text-3xl mb-3 text-gray-300">🧾</div>
          <p className="text-sm text-gray-400 dark:text-gray-500">No invoices yet.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Platform billing invoices will appear here once generated.</p>
        </div>
      </div>

      {/* Cancel subscription */}
      <div className="pt-2 text-center">
        <a
          href="mailto:support@elevatedpos.com.au?subject=Cancel%20Subscription"
          className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400 underline transition-colors"
        >
          Cancel subscription
        </a>
      </div>
    </div>
  );
}
