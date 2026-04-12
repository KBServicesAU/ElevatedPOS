'use client';

import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface BillingSaasStatus {
  plan?: string;
  planStatus?: string;
  stripeCustomerId?: string | null;
  trialEndsAt?: string | null;
}

// ─── Plan Definitions ─────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49/mo',
    description: 'Perfect for single-location businesses.',
    features: ['1 location', '2 devices', 'POS + basic reports', 'Email support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$99/mo',
    description: 'For growing multi-location businesses.',
    features: ['3 locations', '10 devices', 'POS + KDS + Kiosk', 'Loyalty program', 'Priority support'],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$249/mo',
    description: 'Unlimited scale with all features.',
    features: ['Unlimited locations', 'Unlimited devices', 'All features', 'Dedicated account manager', '24/7 support'],
  },
];

// ─── Plan Status Badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    trialing:  { label: 'Trial',    cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
    active:    { label: 'Active',   cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
    past_due:  { label: 'Past Due', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
    cancelled: { label: 'Cancelled',cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
    paused:    { label: 'Paused',   cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
    inactive:  { label: 'Inactive', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
  };
  const { label, cls } = cfg[status] ?? { label: status, cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Payment Method Section ───────────────────────────────────────────────────

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
      setCardName(''); setCardNumber(''); setExpiry(''); setCvc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment method');
    } finally {
      setSaving(false);
    }
  }

  function handleRemove(id: string) {
    fetch(`/api/proxy/billing/payment-methods/${id}`, { method: 'DELETE' })
      .then((r) => { if (r.ok) setMethods((prev) => prev.filter((m) => m.id !== id)); })
      .catch(() => {});
  }

  const brandIcon: Record<string, string> = { visa: '💳 Visa', mastercard: '💳 Mastercard', amex: '💳 Amex' };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Payment Method</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors">
            + Add
          </button>
        )}
      </div>

      {methods.length > 0 && (
        <div className="space-y-3 mb-4">
          {methods.map((pm) => (
            <div key={pm.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{brandIcon[pm.brand.toLowerCase()] ?? `💳 ${pm.brand}`}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">**** {pm.last4}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">Exp {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}</span>
              </div>
              <button onClick={() => handleRemove(pm.id)} className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors">Remove</button>
            </div>
          ))}
        </div>
      )}

      {methods.length === 0 && !showForm && (
        <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="text-3xl mb-3">💳</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">No payment method on file.</p>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            Add Payment Method
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cardholder Name</label>
            <input type="text" required value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Jane Smith" className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Card Number</label>
            <input type="text" required inputMode="numeric" value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} placeholder="4242 4242 4242 4242" maxLength={19} className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expiry</label>
              <input type="text" required inputMode="numeric" value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))} placeholder="MM / YY" maxLength={7} className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CVC</label>
              <input type="text" required inputMode="numeric" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123" maxLength={4} className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none font-mono" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded-lg px-4 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save Card'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(''); }} className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">Your card details are transmitted securely and never stored in our app.</p>
        </form>
      )}
    </div>
  );
}

// ─── Plan Comparison Table ────────────────────────────────────────────────────

function PlanComparisonTable({ currentPlan }: { currentPlan: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Plan Comparison</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlan?.toLowerCase();
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                isCurrentPlan
                  ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/10'
                  : plan.highlight
                  ? 'border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-900'
                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
              }`}
            >
              {plan.highlight && !isCurrentPlan && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white shadow">
                  Most Popular
                </span>
              )}
              {isCurrentPlan && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-green-600 px-3 py-0.5 text-xs font-semibold text-white shadow">
                  Current Plan
                </span>
              )}
              <p className="text-base font-bold text-gray-900 dark:text-white mb-1">{plan.name}</p>
              <p className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mb-1">{plan.price}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">{plan.description}</p>
              <ul className="flex-1 space-y-2 mb-5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <svg className="h-3.5 w-3.5 shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrentPlan ? (
                <div className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs font-semibold">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Current Plan
                </div>
              ) : (
                <a
                  href="/dashboard/billing/plans"
                  className={`block w-full py-2 rounded-xl text-xs font-semibold text-center transition-colors ${
                    plan.highlight
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Upgrade to {plan.name} →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [me, setMe] = useState<SessionMe | null>(null);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [saasStatus, setSaasStatus] = useState<BillingSaasStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/proxy/billing/subscription').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/proxy/billing-saas/status').then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([meData, subData, saasData]: [SessionMe | null, BillingSubscription | null, { data?: BillingSaasStatus } | null]) => {
      setMe(meData);
      setSubscription(subData);
      setSaasStatus(saasData?.data ?? null);
    }).finally(() => setLoading(false));
  }, []);

  async function handleManageSubscription() {
    setPortalError('');
    setPortalLoading(true);
    try {
      const res = await fetch('/api/proxy/billing-saas/portal');
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not open billing portal. Please contact support.');
      }
      const data = await res.json() as { data?: { url?: string } };
      const url = data?.data?.url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('No portal URL returned.');
      }
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Failed to open billing portal.');
    } finally {
      setPortalLoading(false);
    }
  }

  // Derive display values — prefer Stripe SaaS status when available
  const plan = saasStatus?.plan ?? me?.plan ?? 'starter';
  const planStatus = saasStatus?.planStatus ?? 'active';
  const subStatus = subscription?.status ?? planStatus;
  const subInterval = subscription?.interval ?? 'month';
  const statusLabel = subscription?.cancelAtPeriodEnd ? 'Cancelling' : (subStatus.charAt(0).toUpperCase() + subStatus.slice(1));
  const statusColor = (subStatus === 'active' || subStatus === 'trialing') && !subscription?.cancelAtPeriodEnd
    ? 'text-green-600 dark:text-green-400'
    : 'text-amber-600 dark:text-amber-400';
  const intervalLabel = subInterval === 'year' ? 'Annual' : 'Monthly';
  const hasStripeCustomer = !!saasStatus?.stripeCustomerId;

  // Trial days remaining
  const trialEndsAt = saasStatus?.trialEndsAt;
  const trialDaysRemaining = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-36" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
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

      {/* Current Plan */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Current Plan</h2>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-sm font-semibold capitalize">
              {plan}
            </span>
            <StatusBadge status={planStatus} />
          </div>
        </div>

        {/* Trial warning */}
        {planStatus === 'trialing' && trialDaysRemaining !== null && (
          <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              Trial ends in {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''}.
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
              Add a payment method before your trial expires to avoid service interruption.
            </p>
          </div>
        )}

        {/* Past due warning */}
        {planStatus === 'past_due' && (
          <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
            <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
              Your payment is past due. Please update your payment method to continue.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Plan</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white capitalize">{plan}</p>
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
            Your subscription will cancel on{' '}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {/* Stripe Customer Portal */}
          {hasStripeCustomer && (
            <button
              onClick={() => void handleManageSubscription()}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {portalLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Opening portal…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Manage Subscription
                </>
              )}
            </button>
          )}

          <a
            href="/dashboard/billing/plans"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Upgrade Plan →
          </a>
        </div>

        {portalError && (
          <p className="mt-3 text-sm text-red-500 dark:text-red-400">{portalError}</p>
        )}
      </div>

      {/* Payment method */}
      <PaymentMethodSection />

      {/* Plan comparison */}
      <PlanComparisonTable currentPlan={plan} />

      {/* Invoice history */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Invoice History</h2>
          {hasStripeCustomer && (
            <button
              onClick={() => void handleManageSubscription()}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
            >
              View in portal →
            </button>
          )}
        </div>
        <div className="text-center py-10">
          <div className="text-3xl mb-3 text-gray-300">🧾</div>
          <p className="text-sm text-gray-400 dark:text-gray-500">No invoices yet.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Platform billing invoices will appear here once generated.{' '}
            {hasStripeCustomer && (
              <button
                onClick={() => void handleManageSubscription()}
                className="text-indigo-500 hover:underline"
              >
                View full history in Stripe portal.
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Cancel subscription */}
      <div className="pt-2 text-center">
        {hasStripeCustomer ? (
          <button
            onClick={() => void handleManageSubscription()}
            className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400 underline transition-colors"
          >
            Cancel subscription
          </button>
        ) : (
          <a
            href="mailto:support@elevatedpos.com.au?subject=Cancel%20Subscription"
            className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400 underline transition-colors"
          >
            Cancel subscription
          </a>
        )}
      </div>
    </div>
  );
}
