'use client';

import { useEffect, useState, useCallback } from 'react';
import { platformFetch } from '@/lib/api';
import { Plus, X, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPrice: number;
  annualPrice: number | null;
  trialDays: number;
  maxLocations: number;
  maxEmployees: number;
  maxProducts: number;
  isPublic: boolean;
  isActive: boolean;
  features: string[];
  sortOrder: number;
  createdAt: string;
}

interface PlansResponse {
  data: Plan[];
}

interface PlanForm {
  name: string;
  slug: string;
  description: string;
  monthlyPrice: string;
  annualPrice: string;
  trialDays: string;
  maxLocations: string;
  maxEmployees: string;
  maxProducts: string;
  isPublic: boolean;
  isActive: boolean;
  features: string[];
  sortOrder: string;
}

const EMPTY_FORM: PlanForm = {
  name: '',
  slug: '',
  description: '',
  monthlyPrice: '',
  annualPrice: '',
  trialDays: '14',
  maxLocations: '1',
  maxEmployees: '10',
  maxProducts: '100',
  isPublic: true,
  isActive: true,
  features: [],
  sortOrder: '0',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formToPayload(form: PlanForm) {
  return {
    name: form.name,
    slug: form.slug,
    description: form.description || null,
    monthlyPrice: parseFloat(form.monthlyPrice) || 0,
    annualPrice: form.annualPrice ? parseFloat(form.annualPrice) : null,
    trialDays: parseInt(form.trialDays) || 14,
    maxLocations: parseInt(form.maxLocations) || 1,
    maxEmployees: parseInt(form.maxEmployees) || 10,
    maxProducts: parseInt(form.maxProducts) || 100,
    isPublic: form.isPublic,
    isActive: form.isActive,
    features: form.features.filter(Boolean),
    sortOrder: parseInt(form.sortOrder) || 0,
  };
}

function planToForm(plan: Plan): PlanForm {
  return {
    name: plan.name,
    slug: plan.slug,
    description: plan.description ?? '',
    monthlyPrice: String(plan.monthlyPrice),
    annualPrice: plan.annualPrice != null ? String(plan.annualPrice) : '',
    trialDays: String(plan.trialDays),
    maxLocations: String(plan.maxLocations),
    maxEmployees: String(plan.maxEmployees),
    maxProducts: String(plan.maxProducts),
    isPublic: plan.isPublic,
    isActive: plan.isActive,
    features: plan.features ?? [],
    sortOrder: String(plan.sortOrder),
  };
}

interface PlanModalProps {
  title: string;
  form: PlanForm;
  setForm: (f: PlanForm | ((prev: PlanForm) => PlanForm)) => void;
  onSubmit: () => void;
  onClose: () => void;
  submitting: boolean;
  error: string;
  submitLabel: string;
}

function PlanModal({ title, form, setForm, onSubmit, onClose, submitting, error, submitLabel }: PlanModalProps) {
  const [newFeature, setNewFeature] = useState('');

  function addFeature() {
    const trimmed = newFeature.trim();
    if (!trimmed) return;
    setForm((f) => ({ ...f, features: [...f.features, trimmed] }));
    setNewFeature('');
  }

  function removeFeature(i: number) {
    setForm((f) => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }));
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: slugify(name) }));
                }}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Monthly Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyPrice}
                onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Annual Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.annualPrice}
                onChange={(e) => setForm((f) => ({ ...f, annualPrice: e.target.value }))}
                placeholder="Optional"
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Trial Days</label>
              <input
                type="number"
                min="0"
                value={form.trialDays}
                onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Max Locations</label>
              <input
                type="number"
                min="1"
                value={form.maxLocations}
                onChange={(e) => setForm((f) => ({ ...f, maxLocations: e.target.value }))}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Max Employees</label>
              <input
                type="number"
                min="1"
                value={form.maxEmployees}
                onChange={(e) => setForm((f) => ({ ...f, maxEmployees: e.target.value }))}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Max Products</label>
              <input
                type="number"
                min="1"
                value={form.maxProducts}
                onChange={(e) => setForm((f) => ({ ...f, maxProducts: e.target.value }))}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Sort Order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isPublic: !f.isPublic }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${form.isPublic ? 'bg-indigo-600' : 'bg-[#1e1e2e]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.isPublic ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-sm text-gray-400">Public</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? 'bg-green-600' : 'bg-[#1e1e2e]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.isActive ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-sm text-gray-400">Active</span>
              </label>
            </div>
          </div>

          {/* Features */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Features</label>
            <div className="space-y-2 mb-2">
              {form.features.map((feat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-1.5 text-white text-sm">{feat}</span>
                  <button
                    type="button"
                    onClick={() => removeFeature(i)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }}
                placeholder="Add a feature..."
                className="flex-1 bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={addFeature}
                className="px-3 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 rounded text-sm hover:bg-indigo-600/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            {submitting ? 'Saving...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<PlanForm>(EMPTY_FORM);
  const [addError, setAddError] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editForm, setEditForm] = useState<PlanForm>(EMPTY_FORM);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await platformFetch('platform/plans')) as PlansResponse;
      const sorted = [...(data.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      setPlans(sorted);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd() {
    setAddSubmitting(true);
    setAddError('');
    try {
      await platformFetch('platform/plans', {
        method: 'POST',
        body: JSON.stringify(formToPayload(addForm)),
      });
      setShowAddModal(false);
      setAddForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create plan');
    } finally {
      setAddSubmitting(false);
    }
  }

  function openEdit(plan: Plan) {
    setEditingPlan(plan);
    setEditForm(planToForm(plan));
    setEditError('');
  }

  async function handleEdit() {
    if (!editingPlan) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      await platformFetch(`platform/plans/${editingPlan.id}`, {
        method: 'PATCH',
        body: JSON.stringify(formToPayload(editForm)),
      });
      setEditingPlan(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleToggleActive(plan: Plan) {
    setTogglingId(plan.id);
    try {
      await platformFetch(`platform/plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !plan.isActive }),
      });
      await load();
    } catch {
      alert('Failed to toggle plan status.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleReorder(plan: Plan, direction: 'up' | 'down') {
    const idx = plans.findIndex((p) => p.id === plan.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= plans.length) return;

    const other = plans[swapIdx];
    if (!other) return;

    setReorderingId(plan.id);
    try {
      await Promise.all([
        platformFetch(`platform/plans/${plan.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sortOrder: other.sortOrder }),
        }),
        platformFetch(`platform/plans/${other.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sortOrder: plan.sortOrder }),
        }),
      ]);
      await load();
    } catch {
      alert('Failed to reorder plans.');
    } finally {
      setReorderingId(null);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Plans</h1>
          <p className="text-gray-500 text-sm mt-1">Manage SaaS pricing plans</p>
        </div>
        <button
          onClick={() => { setAddForm(EMPTY_FORM); setAddError(''); setShowAddModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Plan
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : plans.length === 0 ? (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-8 text-center text-gray-600">
          No plans found
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan, idx) => (
            <div
              key={plan.id}
              className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-5 flex gap-4"
            >
              {/* Reorder controls */}
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => handleReorder(plan, 'up')}
                  disabled={idx === 0 || reorderingId === plan.id}
                  className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-30 transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleReorder(plan, 'down')}
                  disabled={idx === plans.length - 1 || reorderingId === plan.id}
                  className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-30 transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Plan info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-semibold">{plan.name}</h3>
                  <span className="text-gray-600 text-xs font-mono">/{plan.slug}</span>
                  {plan.isActive ? (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">Active</span>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-500 rounded text-xs">Inactive</span>
                  )}
                  {plan.isPublic ? (
                    <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 rounded text-xs flex items-center gap-1">
                      <Eye className="w-3 h-3" />Public
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-500 rounded text-xs flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />Private
                    </span>
                  )}
                </div>

                {plan.description && (
                  <p className="text-gray-400 text-sm mb-2">{plan.description}</p>
                )}

                <div className="flex flex-wrap gap-4 text-sm mb-2">
                  <span className="text-gray-400">
                    <span className="text-gray-600 text-xs uppercase mr-1">Monthly</span>
                    <span className="text-white font-medium">${plan.monthlyPrice}</span>
                  </span>
                  {plan.annualPrice != null && (
                    <span className="text-gray-400">
                      <span className="text-gray-600 text-xs uppercase mr-1">Annual</span>
                      <span className="text-white font-medium">${plan.annualPrice}</span>
                    </span>
                  )}
                  <span className="text-gray-400">
                    <span className="text-gray-600 text-xs uppercase mr-1">Trial</span>
                    <span className="text-white">{plan.trialDays}d</span>
                  </span>
                  <span className="text-gray-400">
                    <span className="text-gray-600 text-xs uppercase mr-1">Locations</span>
                    <span className="text-white">{plan.maxLocations}</span>
                  </span>
                  <span className="text-gray-400">
                    <span className="text-gray-600 text-xs uppercase mr-1">Employees</span>
                    <span className="text-white">{plan.maxEmployees}</span>
                  </span>
                  <span className="text-gray-400">
                    <span className="text-gray-600 text-xs uppercase mr-1">Products</span>
                    <span className="text-white">{plan.maxProducts}</span>
                  </span>
                </div>

                {plan.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {plan.features.map((feat, i) => (
                      <span key={i} className="px-2 py-0.5 bg-[#1e1e2e] text-gray-300 rounded text-xs">
                        {feat}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-start gap-2 shrink-0">
                <button
                  onClick={() => handleToggleActive(plan)}
                  disabled={togglingId === plan.id}
                  className={`px-3 py-1.5 text-xs rounded border transition-colors disabled:opacity-50 ${
                    plan.isActive
                      ? 'bg-red-600/20 text-red-400 border-red-600/30 hover:bg-red-600/30'
                      : 'bg-green-600/20 text-green-400 border-green-600/30 hover:bg-green-600/30'
                  }`}
                >
                  {togglingId === plan.id ? '...' : plan.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => openEdit(plan)}
                  className="px-3 py-1.5 bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 rounded text-xs hover:bg-indigo-600/30 transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <PlanModal
          title="Add Plan"
          form={addForm}
          setForm={setAddForm}
          onSubmit={handleAdd}
          onClose={() => setShowAddModal(false)}
          submitting={addSubmitting}
          error={addError}
          submitLabel="Create Plan"
        />
      )}

      {/* Edit Modal */}
      {editingPlan && (
        <PlanModal
          title={`Edit Plan — ${editingPlan.name}`}
          form={editForm}
          setForm={setEditForm}
          onSubmit={handleEdit}
          onClose={() => setEditingPlan(null)}
          submitting={editSubmitting}
          error={editError}
          submitLabel="Save Changes"
        />
      )}
    </div>
  );
}
