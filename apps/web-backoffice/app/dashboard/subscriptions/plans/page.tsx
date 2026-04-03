'use client';

import { useState, useEffect } from 'react';

interface Plan {
  id: string;
  name: string;
  description?: string | null;
  amount: number;
  currency: string;
  interval: 'month' | 'year' | 'week' | string;
  trialDays?: number | null;
  active: boolean;
}

interface CreatePlanForm {
  name: string;
  description: string;
  amount: string;
  interval: 'month' | 'year' | 'week';
  trialDays: string;
}

const INTERVAL_LABELS: Record<string, string> = {
  month: 'Monthly',
  year: 'Yearly',
  week: 'Weekly',
};

function formatAUD(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

const DEFAULT_FORM: CreatePlanForm = {
  name: '',
  description: '',
  amount: '',
  interval: 'month',
  trialDays: '',
};

export default function SubscriptionPlansPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreatePlanForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (me: { orgId?: string } | null) => {
        const id = me?.orgId ?? null;
        setOrgId(id);
        if (!id) { setLoading(false); return; }
        return fetch(`/api/proxy/integrations/api/v1/connect/plans/${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data: Plan[] | { data?: Plan[]; plans?: Plan[] } | null) => {
            if (!data) return;
            if (Array.isArray(data)) setPlans(data);
            else if (data.data) setPlans(data.data);
            else if (data.plans) setPlans(data.plans);
          })
          .catch(() => null)
          .finally(() => setLoading(false));
      })
      .catch(() => { setOrgId(null); setLoading(false); });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/proxy/integrations/api/v1/connect/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          name: form.name,
          description: form.description || undefined,
          amount: Math.round(parseFloat(form.amount) * 100),
          interval: form.interval,
          trialDays: form.trialDays ? parseInt(form.trialDays) : undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to create plan');
      }
      const newPlan = (await res.json()) as Plan;
      setPlans((prev) => [newPlan, ...prev]);
      setShowCreate(false);
      setForm(DEFAULT_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan');
    } finally {
      setSaving(false);
    }
  }

  function copyId(id: string) {
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-52" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-gray-200 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
          <p className="text-gray-500 mt-1">Create recurring billing plans for your customers.</p>
        </div>
        {orgId && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + Create Plan
          </button>
        )}
      </div>

      {/* Create Plan modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Create Subscription Plan</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plan name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly Premium"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount (AUD $) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0.50"
                    step="0.01"
                    placeholder="9.99"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Billing interval
                  </label>
                  <select
                    value={form.interval}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        interval: e.target.value as 'month' | 'year' | 'week',
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                    <option value="week">Weekly</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trial days (optional)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 14"
                  value={form.trialDays}
                  onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setForm(DEFAULT_FORM); setError(''); }}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content */}
      {!orgId ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="font-semibold text-lg mb-1">Not connected</h3>
          <p className="text-gray-500 text-sm">
            Connect your Stripe account in{' '}
            <a href="/dashboard/payments" className="text-indigo-600 underline">
              Payments
            </a>{' '}
            to create subscription plans.
          </p>
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <div className="text-4xl mb-3">🔄</div>
          <h3 className="font-semibold text-lg mb-1">No plans yet</h3>
          <p className="text-gray-500 text-sm mb-4">
            Create your first subscription plan to start billing customers.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
          >
            + Create Plan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    plan.active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {plan.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {plan.description && (
                <p className="text-sm text-gray-500">{plan.description}</p>
              )}
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xl font-bold text-gray-900">
                  {formatAUD(plan.amount)}
                  <span className="text-sm font-normal text-gray-400 ml-1">
                    / {INTERVAL_LABELS[plan.interval] ?? plan.interval}
                  </span>
                </p>
                {plan.trialDays ? (
                  <p className="text-xs text-gray-400 mt-0.5">{plan.trialDays} day free trial</p>
                ) : null}
              </div>
              <div className="flex items-center justify-between mt-auto pt-1">
                <p className="text-xs font-mono text-gray-400 truncate max-w-[140px]">{plan.id}</p>
                <button
                  type="button"
                  onClick={() => copyId(plan.id)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium ml-2 shrink-0"
                >
                  {copied === plan.id ? 'Copied!' : 'Copy ID'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
