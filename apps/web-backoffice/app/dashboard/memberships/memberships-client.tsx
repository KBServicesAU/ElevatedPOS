'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { Users, Plus, X, AlertCircle, Pencil, Ban, RefreshCw, Check, ToggleLeft, ToggleRight } from 'lucide-react';

type BillingCycle = 'monthly' | 'annual' | 'one_time';
type SubStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

interface MembershipPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  billingCycle: BillingCycle;
  trialDays: number;
  benefits: string[];
  pointsMultiplier: number;
  isActive: boolean;
  memberCount: number;
}

interface MembershipSubscription {
  id: string;
  customerName: string;
  planName: string;
  status: SubStatus;
  startedAt: string;
  nextBillingDate: string | null;
  dunningAttempts: number;
}


const SUB_STATUS_STYLES: Record<SubStatus, string> = {
  trialing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  past_due: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: '/mo',
  annual: '/yr',
  one_time: ' one-time',
};

type SubFilterTab = 'all' | SubStatus;

const emptyPlanForm = () => ({
  name: '',
  description: '',
  price: '',
  billingCycle: 'monthly' as BillingCycle,
  trialDays: '0',
  benefits: [''],
  pointsMultiplier: '1',
  isActive: true,
});

export default function MembershipsClient() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [subs, setSubs] = useState<MembershipSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMainTab, setActiveMainTab] = useState<'plans' | 'subscribers'>('plans');
  const [subFilter, setSubFilter] = useState<SubFilterTab>('all');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlanForm());
  const [showAddSubscriberModal, setShowAddSubscriberModal] = useState(false);
  const [subscriberForm, setSubscriberForm] = useState({ customerEmail: '', planId: '', startDate: '' });
  const [addingSubscriber, setAddingSubscriber] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subsRes] = await Promise.all([
        apiFetch<{ data: MembershipPlan[] }>('membership-plans'),
        apiFetch<{ data: MembershipSubscription[] }>('membership-subscriptions'),
      ]);
      setPlans(plansRes.data ?? []);
      setSubs(subsRes.data ?? []);
    } catch {
      setPlans([]);
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreatePlan() {
    setEditingPlan(null);
    setPlanForm(emptyPlanForm());
    setShowPlanModal(true);
  }

  function openEditPlan(plan: MembershipPlan) {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description,
      price: String(plan.price),
      billingCycle: plan.billingCycle,
      trialDays: String(plan.trialDays),
      benefits: plan.benefits.length > 0 ? plan.benefits : [''],
      pointsMultiplier: String(plan.pointsMultiplier),
      isActive: plan.isActive,
    });
    setShowPlanModal(true);
  }

  function addBenefit() {
    setPlanForm((prev) => ({ ...prev, benefits: [...prev.benefits, ''] }));
  }

  function updateBenefit(idx: number, val: string) {
    setPlanForm((prev) => {
      const b = [...prev.benefits];
      b[idx] = val;
      return { ...prev, benefits: b };
    });
  }

  function removeBenefit(idx: number) {
    setPlanForm((prev) => ({ ...prev, benefits: prev.benefits.filter((_, i) => i !== idx) }));
  }

  async function handleSavePlan() {
    if (!planForm.name || !planForm.price) return;
    setSaving(true);
    const payload = {
      name: planForm.name,
      description: planForm.description,
      price: Number(planForm.price),
      billingCycle: planForm.billingCycle,
      trialDays: Number(planForm.trialDays),
      benefits: planForm.benefits.filter(Boolean),
      pointsMultiplier: Number(planForm.pointsMultiplier),
      isActive: planForm.isActive,
    };
    try {
      if (editingPlan) {
        await apiFetch(`membership-plans/${editingPlan.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setPlans((prev) => prev.map((p) => p.id === editingPlan.id ? { ...p, ...payload } : p));
        toast({ title: 'Plan updated', description: `"${payload.name}" has been saved.`, variant: 'success' });
      } else {
        await apiFetch('membership-plans', { method: 'POST', body: JSON.stringify(payload) });
        const newPlan: MembershipPlan = { id: `plan${Date.now()}`, memberCount: 0, ...payload };
        setPlans((prev) => [...prev, newPlan]);
        toast({ title: 'Plan created', description: `"${payload.name}" has been created.`, variant: 'success' });
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: editingPlan ? 'Failed to update plan' : 'Failed to create plan', description: msg, variant: 'destructive' });
    } finally {
      setShowPlanModal(false);
      setSaving(false);
    }
  }

  async function togglePlanActive(planId: string) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const newActive = !plan.isActive;
    setPlans((prev) => prev.map((p) => p.id === planId ? { ...p, isActive: newActive } : p));
    try {
      await apiFetch(`membership-plans/${planId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newActive }),
      });
      toast({ title: newActive ? 'Plan activated' : 'Plan deactivated', variant: 'success' });
    } catch (err) {
      // Revert on failure
      setPlans((prev) => prev.map((p) => p.id === planId ? { ...p, isActive: !newActive } : p));
      toast({ title: 'Failed to update plan', description: getErrorMessage(err), variant: 'destructive' });
    }
  }

  async function handleCancelSub(id: string) {
    try {
      await apiFetch(`membership-subscriptions/${id}/cancel`, { method: 'POST' });
      setSubs((prev) => prev.map((s) => s.id === id ? { ...s, status: 'cancelled' as SubStatus, nextBillingDate: null } : s));
      toast({ title: 'Subscription cancelled', description: 'The subscription has been cancelled.', variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to cancel subscription', description: msg, variant: 'destructive' });
    } finally {
      setCancelConfirmId(null);
    }
  }

  async function handleRetryPayment(id: string) {
    try {
      await apiFetch(`membership-subscriptions/${id}/retry`, { method: 'POST' });
      setSubs((prev) => prev.map((s) => s.id === id ? { ...s, dunningAttempts: s.dunningAttempts + 1 } : s));
      toast({ title: 'Payment retry initiated', description: 'A payment retry has been triggered.', variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to retry payment', description: msg, variant: 'destructive' });
    }
  }

  async function handleAddSubscriber() {
    if (!subscriberForm.customerEmail || !subscriberForm.planId || !subscriberForm.startDate) return;
    setAddingSubscriber(true);
    try {
      await apiFetch('membership-subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customerEmail: subscriberForm.customerEmail,
          planId: subscriberForm.planId,
          startDate: subscriberForm.startDate,
        }),
      });
      toast({ title: 'Subscriber added', description: `${subscriberForm.customerEmail} has been subscribed.`, variant: 'success' });
      setShowAddSubscriberModal(false);
      setSubscriberForm({ customerEmail: '', planId: '', startDate: '' });
      load();
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to add subscriber', description: msg, variant: 'destructive' });
    } finally {
      setAddingSubscriber(false);
    }
  }

  const SUB_FILTER_TABS: { id: SubFilterTab; label: string }[] = [
    { id: 'all', label: `All (${subs.length})` },
    { id: 'active', label: `Active (${subs.filter((s) => s.status === 'active').length})` },
    { id: 'trialing', label: `Trialing (${subs.filter((s) => s.status === 'trialing').length})` },
    { id: 'past_due', label: `Past Due (${subs.filter((s) => s.status === 'past_due').length})` },
    { id: 'cancelled', label: `Cancelled (${subs.filter((s) => s.status === 'cancelled').length})` },
  ];

  const filteredSubs = subFilter === 'all' ? subs : subs.filter((s) => s.status === subFilter);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Memberships</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Manage membership plans and subscribers</p>
        </div>
        {activeMainTab === 'plans' && (
          <button
            onClick={openCreatePlan}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Plan
          </button>
        )}
      </div>

      {/* Main tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {(['plans', 'subscribers'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveMainTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${
              activeMainTab === tab
                ? 'border-elevatedpos-500 text-elevatedpos-600 dark:text-elevatedpos-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Plans Tab */}
      {!loading && activeMainTab === 'plans' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{plan.description}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${plan.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                  {plan.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="mb-3">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">${plan.price}</span>
                <span className="text-sm text-gray-400">{BILLING_CYCLE_LABEL[plan.billingCycle]}</span>
              </div>

              {plan.trialDays > 0 && (
                <p className="text-xs text-elevatedpos-600 dark:text-elevatedpos-400 mb-2">{plan.trialDays}-day free trial</p>
              )}

              <ul className="space-y-1 mb-4">
                {plan.benefits.map((b, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs text-gray-400">{plan.memberCount} members &bull; {plan.pointsMultiplier}x points</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditPlan(plan)}
                    title="Edit"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => togglePlanActive(plan.id)}
                    title={plan.isActive ? 'Deactivate' : 'Activate'}
                    className={`rounded p-1 transition-colors ${plan.isActive ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30' : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'}`}
                  >
                    {plan.isActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Subscribers Tab */}
      {!loading && activeMainTab === 'subscribers' && (
        <div>
          {/* Sub filter tabs + Add Subscriber button */}
          <div className="mb-5 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
            <div className="flex gap-1">
              {SUB_FILTER_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setSubFilter(id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    subFilter === id
                      ? 'border-elevatedpos-500 text-elevatedpos-600 dark:text-elevatedpos-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setSubscriberForm({ customerEmail: '', planId: '', startDate: '' });
                setShowAddSubscriberModal(true);
              }}
              className="mb-1 flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Subscriber
            </button>
          </div>

          {filteredSubs.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 dark:border-gray-700 dark:bg-gray-800/40">
              <Users className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No subscribers found.</p>
            </div>
          )}

          {filteredSubs.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Customer</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Plan</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Started</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Next Billing</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredSubs.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white">{sub.customerName}</td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{sub.planName}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${SUB_STATUS_STYLES[sub.status]}`}>
                            {sub.status.replace('_', ' ')}
                          </span>
                          {sub.dunningAttempts > 0 && (
                            <span className="rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-2 py-0.5 text-xs font-medium">
                              {sub.dunningAttempts} attempt{sub.dunningAttempts > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{sub.startedAt}</td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{sub.nextBillingDate ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {sub.status === 'past_due' && (
                            <button
                              onClick={() => handleRetryPayment(sub.id)}
                              title="Retry Payment"
                              className="rounded p-1 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {sub.status !== 'cancelled' && sub.status !== 'expired' && (
                            <button
                              onClick={() => setCancelConfirmId(sub.id)}
                              title="Cancel Subscription"
                              className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{editingPlan ? 'Edit Plan' : 'Create Plan'}</h2>
              <button onClick={() => setShowPlanModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Plan Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Gold"
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Description</label>
                <input
                  type="text"
                  placeholder="Brief description"
                  value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Price ($) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="9.00"
                    value={planForm.price}
                    onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Billing Cycle</label>
                  <select
                    value={planForm.billingCycle}
                    onChange={(e) => setPlanForm({ ...planForm, billingCycle: e.target.value as BillingCycle })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 bg-white"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                    <option value="one_time">One-time</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Trial Days</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={planForm.trialDays}
                    onChange={(e) => setPlanForm({ ...planForm, trialDays: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Points Multiplier</label>
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    placeholder="1"
                    value={planForm.pointsMultiplier}
                    onChange={(e) => setPlanForm({ ...planForm, pointsMultiplier: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Benefits</label>
                  <button
                    type="button"
                    onClick={addBenefit}
                    className="flex items-center gap-1 text-xs text-elevatedpos-600 hover:text-elevatedpos-500 dark:text-elevatedpos-400"
                  >
                    <Plus className="h-3 w-3" /> Add Benefit
                  </button>
                </div>
                <div className="space-y-2">
                  {planForm.benefits.map((b, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="e.g. 10% member discount"
                        value={b}
                        onChange={(e) => updateBenefit(idx, e.target.value)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                      />
                      {planForm.benefits.length > 1 && (
                        <button onClick={() => removeBenefit(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPlanForm({ ...planForm, isActive: !planForm.isActive })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${planForm.isActive ? 'bg-elevatedpos-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${planForm.isActive ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300">{planForm.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => setShowPlanModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlan}
                disabled={!planForm.name || !planForm.price || saving}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Check className="h-4 w-4" />}
                {editingPlan ? 'Save Changes' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Subscriber Modal */}
      {showAddSubscriberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Add Subscriber</h2>
              <button onClick={() => setShowAddSubscriberModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Customer Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={subscriberForm.customerEmail}
                  onChange={(e) => setSubscriberForm({ ...subscriberForm, customerEmail: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Membership Plan <span className="text-red-500">*</span></label>
                <select
                  value={subscriberForm.planId}
                  onChange={(e) => setSubscriberForm({ ...subscriberForm, planId: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 bg-white"
                >
                  <option value="">Select a plan…</option>
                  {plans.filter((p) => p.isActive).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${p.price}{BILLING_CYCLE_LABEL[p.billingCycle]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Start Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={subscriberForm.startDate}
                  onChange={(e) => setSubscriberForm({ ...subscriberForm, startDate: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => setShowAddSubscriberModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSubscriber}
                disabled={!subscriberForm.customerEmail || !subscriberForm.planId || !subscriberForm.startDate || addingSubscriber}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {addingSubscriber ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Plus className="h-4 w-4" />}
                Add Subscriber
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Dialog */}
      {cancelConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Cancel Subscription</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Are you sure you want to cancel this subscription? This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCancelConfirmId(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Keep
              </button>
              <button
                onClick={() => handleCancelSub(cancelConfirmId)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors"
              >
                Cancel Subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
