'use client';

import { useState } from 'react';
import { Plus, Zap, CheckCircle, XCircle, Play, Pencil, Trash2, X } from 'lucide-react';
import { useAutomations } from '@/lib/hooks';
import type { AutomationRule } from '@/lib/api';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { timeAgo as _timeAgo, getErrorMessage } from '@/lib/formatting';

const triggerColors: Record<string, string> = {
  low_stock: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  customer_created: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  loyalty_tier_changed: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  birthday: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  order_completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  order_refunded: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const TRIGGER_OPTIONS = [
  { value: 'order_completed', label: 'Order Completed' },
  { value: 'customer_created', label: 'Customer Created' },
  { value: 'loyalty_tier_changed', label: 'Loyalty Tier Changed' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'order_refunded', label: 'Order Refunded' },
];

const ACTION_OPTIONS = [
  { value: 'send_email', label: 'Send Email' },
  { value: 'send_sms', label: 'Send SMS' },
  { value: 'add_loyalty_points', label: 'Add Loyalty Points' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'webhook', label: 'Webhook' },
];

function triggerLabel(trigger: string) {
  return trigger
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function timeAgo(iso?: string) {
  return iso ? _timeAgo(iso) : 'Never';
}

// ─── CreateRuleModal ──────────────────────────────────────────────────────────

interface RuleFormState {
  name: string;
  trigger: string;
  condition: string;
  actions: string[];
  enabled: boolean;
}

const EMPTY_RULE_FORM: RuleFormState = {
  name: '',
  trigger: 'order_completed',
  condition: '',
  actions: [],
  enabled: true,
};

interface CreateRuleModalProps {
  initial?: RuleFormState & { id?: string };
  onClose: () => void;
  onSaved: () => void;
}

function CreateRuleModal({ initial, onClose, onSaved }: CreateRuleModalProps) {
  const { toast } = useToast();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<RuleFormState>(initial ?? EMPTY_RULE_FORM);
  const [saving, setSaving] = useState(false);

  function toggleAction(val: string) {
    setForm((f) => ({
      ...f,
      actions: f.actions.includes(val)
        ? f.actions.filter((a) => a !== val)
        : [...f.actions, val],
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit && initial?.id) {
        await apiFetch(`automations/rules/${initial.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        toast({ title: 'Rule updated', description: `"${form.name}" has been updated.`, variant: 'success' });
      } else {
        await apiFetch('automations/rules', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        toast({ title: 'Rule created', description: `"${form.name}" has been created.`, variant: 'success' });
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, isEdit ? 'Failed to update rule.' : 'Failed to create rule.');
      toast({ title: isEdit ? 'Failed to update rule' : 'Failed to create rule', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Rule' : 'Create Rule'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSave(e)} className="space-y-5 p-6">
          {/* Rule name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Rule Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Welcome email on signup"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Trigger <span className="text-red-500">*</span>
            </label>
            <select
              value={form.trigger}
              onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {TRIGGER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Condition */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Condition <span className="text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <input
              value={form.condition}
              onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
              placeholder='e.g. min_order_value >= 50'
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Actions */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Actions <span className="text-xs font-normal text-gray-400">(select all that apply)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ACTION_OPTIONS.map((opt) => {
                const selected = form.actions.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleAction(opt.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.enabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  form.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AutomationsClient() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useAutomations();
  const rules = data?.data ?? [];
  const enabled = rules.filter((r) => r.enabled).length;
  const totalRuns = rules.reduce((s, r) => s + (r.runCount ?? 0), 0);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<(RuleFormState & { id: string }) | null>(null);

  async function handleRun(rule: AutomationRule) {
    setRunningId(rule.id);
    try {
      await apiFetch(`automation-rules/${rule.id}/run`, { method: 'POST' });
      toast({ title: 'Rule triggered', description: `"${rule.name}" ran successfully.`, variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to run rule.');
      toast({ title: 'Failed to run rule', description: msg, variant: 'destructive' });
    } finally {
      setRunningId(null);
    }
  }

  function handleEdit(rule: AutomationRule) {
    setEditingRule({
      id: rule.id,
      name: rule.name,
      trigger: rule.trigger,
      condition: '',
      actions: [],
      enabled: rule.enabled,
    });
  }

  async function handleDelete(rule: AutomationRule) {
    if (!confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`automations/rules/${rule.id}`, { method: 'DELETE' });
      toast({ title: 'Rule deleted', description: `"${rule.name}" has been deleted.`, variant: 'success' });
      void refetch?.();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to delete rule.');
      toast({ title: 'Failed to delete rule', description: msg, variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      {/* Modals */}
      {showCreateModal && (
        <CreateRuleModal
          onClose={() => setShowCreateModal(false)}
          onSaved={() => { void refetch?.(); }}
        />
      )}
      {editingRule && (
        <CreateRuleModal
          initial={editingRule}
          onClose={() => setEditingRule(null)}
          onSaved={() => { void refetch?.(); }}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Automations</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${rules.length} rules · ${enabled} active`}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Create Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Rules', value: isLoading ? '—' : enabled.toString() },
          { label: 'Total Runs (All Time)', value: isLoading ? '—' : totalRuns.toLocaleString() },
          { label: 'Rules Configured', value: isLoading ? '—' : rules.length.toString() },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Rules list */}
      {isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-500 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
          Failed to load automations.
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse h-24 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center dark:border-gray-700">
          <Zap className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">No automation rules yet. Create your first rule to automate workflows.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule: AutomationRule) => (
            <div key={rule.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 rounded-xl p-2.5 ${rule.enabled ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <Zap className={`h-5 w-5 ${rule.enabled ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{rule.name}</p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-500">When:</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${triggerColors[rule.trigger] ?? 'bg-gray-100 text-gray-600'}`}>
                        {triggerLabel(rule.trigger)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {rule.runCount} runs · Last: {timeAgo(rule.lastRunAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRun(rule)}
                    disabled={runningId === rule.id}
                    title="Run now"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-700"
                  >
                    {runningId === rule.id
                      ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
                      : <Play className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleEdit(rule)}
                    title="Edit rule"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void handleDelete(rule)}
                    title="Delete rule"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                      rule.enabled
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {rule.enabled ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {rule.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
