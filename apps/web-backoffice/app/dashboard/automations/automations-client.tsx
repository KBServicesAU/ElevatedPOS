'use client';

import { useState } from 'react';
import { Plus, Zap, CheckCircle, XCircle, Play } from 'lucide-react';
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
};

function triggerLabel(trigger: string) {
  return trigger
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function timeAgo(iso?: string) {
  return iso ? _timeAgo(iso) : 'Never';
}

export function AutomationsClient() {
  const { toast } = useToast();
  const { data, isLoading, isError } = useAutomations();
  const rules = data?.data ?? [];
  const enabled = rules.filter((r) => r.enabled).length;
  const totalRuns = rules.reduce((s, r) => s + (r.runCount ?? 0), 0);
  const [runningId, setRunningId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Automations</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${rules.length} rules · ${enabled} active`}
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
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
