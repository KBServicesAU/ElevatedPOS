'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  XCircle, AlertTriangle, Info, CheckCircle, ExternalLink, BellOff,
  Plus, X, Trash2, ToggleLeft, ToggleRight, Settings2, Loader2,
  Mail, MessageSquare, Bell, ChevronDown,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { timeAgo } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

type Alert = {
  id:           string;
  severity:     'critical' | 'warning' | 'info';
  title:        string;
  message:      string;
  category:     string;
  locationName: string;
  createdAt:    string;
  isRead:       boolean;
  actionUrl?:   string;
};

type AlertRuleTrigger = 'low_stock' | 'long_order_queue' | 'high_refund_rate' | 'staff_not_clocked_in';

type AlertRule = {
  id:           string;
  trigger:      AlertRuleTrigger;
  threshold?:   number;
  channels:     Array<'in_app' | 'email' | 'sms'>;
  recipients:   string;
  enabled:      boolean;
  createdAt:    string;
};

type FilterTab     = 'all' | 'critical' | 'warning' | 'info';
type CategoryFilter = 'all' | string;

// ─── Config ───────────────────────────────────────────────────────────────────

const severityConfig = {
  critical: {
    icon:        XCircle,
    iconClass:   'text-red-500',
    bgClass:     'bg-red-50 dark:bg-red-900/10',
    borderClass: 'border-red-200 dark:border-red-900/30',
    badgeClass:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label:       'Critical',
  },
  warning: {
    icon:        AlertTriangle,
    iconClass:   'text-orange-500',
    bgClass:     'bg-orange-50 dark:bg-orange-900/10',
    borderClass: 'border-orange-200 dark:border-orange-900/30',
    badgeClass:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    label:       'Warning',
  },
  info: {
    icon:        Info,
    iconClass:   'text-blue-500',
    bgClass:     'bg-blue-50 dark:bg-blue-900/10',
    borderClass: 'border-blue-200 dark:border-blue-900/30',
    badgeClass:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    label:       'Info',
  },
};

const TRIGGER_OPTIONS: { value: AlertRuleTrigger; label: string; hasThreshold: boolean; thresholdLabel?: string; thresholdSuffix?: string }[] = [
  { value: 'low_stock',           label: 'Low Stock',              hasThreshold: true,  thresholdLabel: 'Threshold (units)', thresholdSuffix: 'units' },
  { value: 'long_order_queue',    label: 'Long Order Queue',       hasThreshold: true,  thresholdLabel: 'Max queue size',    thresholdSuffix: 'orders' },
  { value: 'high_refund_rate',    label: 'High Refund Rate',       hasThreshold: true,  thresholdLabel: 'Rate threshold',    thresholdSuffix: '%' },
  { value: 'staff_not_clocked_in', label: 'Staff Not Clocked In',  hasThreshold: false },
];

// ─── Add Rule Modal ───────────────────────────────────────────────────────────

interface AddRuleModalProps {
  onClose: () => void;
  onSaved: (rule: AlertRule) => void;
}

function AddRuleModal({ onClose, onSaved }: AddRuleModalProps) {
  const { toast } = useToast();
  const [trigger,    setTrigger]    = useState<AlertRuleTrigger>('low_stock');
  const [threshold,  setThreshold]  = useState<number>(10);
  const [channels,   setChannels]   = useState<Array<'in_app' | 'email' | 'sms'>>(['in_app']);
  const [recipients, setRecipients] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const triggerCfg = TRIGGER_OPTIONS.find((t) => t.value === trigger)!;

  function toggleChannel(ch: 'in_app' | 'email' | 'sms') {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (channels.length === 0) { setError('Select at least one notification channel.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await apiFetch<{ data: AlertRule }>('alerts/rules', {
        method: 'POST',
        body: JSON.stringify({
          trigger,
          threshold:  triggerCfg.hasThreshold ? threshold : undefined,
          channels,
          recipients: recipients.trim() || undefined,
        }),
      });
      toast({ title: 'Alert rule created', description: 'You will be notified when the trigger condition is met.', variant: 'success' });
      onSaved(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    } finally { setSaving(false); }
  }

  const channelItems: { id: 'in_app' | 'email' | 'sms'; label: string; Icon: React.ElementType }[] = [
    { id: 'in_app', label: 'In-app',  Icon: Bell           },
    { id: 'email',  label: 'Email',   Icon: Mail           },
    { id: 'sms',    label: 'SMS',     Icon: MessageSquare  },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Add Alert Rule</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 p-6">
          {/* Trigger */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Trigger</label>
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as AlertRuleTrigger)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Threshold — conditional */}
          {triggerCfg.hasThreshold && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {triggerCfg.thresholdLabel}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  min={0}
                  required
                  className="w-32 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                {triggerCfg.thresholdSuffix && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">{triggerCfg.thresholdSuffix}</span>
                )}
              </div>
            </div>
          )}

          {/* Channels */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Notification Channels</label>
            <div className="flex gap-2">
              {channelItems.map(({ id, label, Icon }) => {
                const active = channels.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleChannel(id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-600'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Recipients <span className="font-normal text-gray-400">(optional, comma-separated emails)</span>
            </label>
            <input
              type="text"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="alice@example.com, bob@example.com"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Alert Rules Panel ────────────────────────────────────────────────────────

function AlertRulesPanel() {
  const { toast } = useToast();
  const [rules,        setRules]        = useState<AlertRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [togglingId,   setTogglingId]   = useState<string | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await apiFetch<{ data: AlertRule[] }>('alerts/rules');
      setRules(res.data ?? []);
    } catch {
      setRules([]);
    } finally { setLoadingRules(false); }
  }, []);

  useEffect(() => { void loadRules(); }, [loadRules]);

  async function toggleRule(rule: AlertRule) {
    setTogglingId(rule.id);
    try {
      await apiFetch(`alerts/rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Could not update rule.', variant: 'destructive' });
    } finally { setTogglingId(null); }
  }

  async function deleteRule(id: string) {
    setDeletingId(id);
    try {
      await apiFetch(`alerts/rules/${id}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast({ title: 'Rule deleted', variant: 'success' });
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Could not delete rule.', variant: 'destructive' });
    } finally { setDeletingId(null); }
  }

  function triggerLabel(trigger: AlertRuleTrigger): string {
    return TRIGGER_OPTIONS.find((t) => t.value === trigger)?.label ?? trigger;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Alert Rules</h3>
          {rules.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">{rules.length}</span>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />Add Rule
        </button>
      </div>

      {loadingRules ? (
        <div className="space-y-2 p-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Bell className="h-8 w-8 text-gray-300 dark:text-gray-700" />
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No alert rules yet</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Rules automatically notify you when conditions are met.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {rules.map((rule) => {
            const isToggling = togglingId === rule.id;
            const isDeleting = deletingId === rule.id;
            return (
              <div key={rule.id} className={`flex items-start justify-between gap-4 px-5 py-3.5 ${!rule.enabled ? 'opacity-60' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{triggerLabel(rule.trigger)}</span>
                    {rule.threshold !== undefined && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        &gt; {rule.threshold}
                      </span>
                    )}
                    {!rule.enabled && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">Disabled</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {rule.channels.map((ch) => (
                      <span key={ch} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                        {ch === 'in_app' ? <Bell className="h-3 w-3" /> : ch === 'email' ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                        {ch === 'in_app' ? 'In-app' : ch.charAt(0).toUpperCase() + ch.slice(1)}
                      </span>
                    ))}
                    {rule.recipients && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]" title={rule.recipients}>
                        {rule.recipients}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => void toggleRule(rule)}
                    disabled={isToggling}
                    title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white transition-colors disabled:opacity-40"
                  >
                    {isToggling
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : rule.enabled
                        ? <ToggleRight className="h-4 w-4 text-indigo-500" />
                        : <ToggleLeft className="h-4 w-4" />
                    }
                  </button>
                  <button
                    onClick={() => void deleteRule(rule.id)}
                    disabled={isDeleting}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition-colors disabled:opacity-40"
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <AddRuleModal
          onClose={() => setShowAddModal(false)}
          onSaved={(rule) => { setRules((prev) => [rule, ...prev]); setShowAddModal(false); }}
        />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AlertsClient() {
  const [alerts,     setAlerts]     = useState<Alert[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<FilterTab>('all');
  const [typeFilter, setTypeFilter] = useState<CategoryFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await apiFetch<{ data: Alert[] }>('alerts?limit=50&sort=createdAt:desc');
      const list = Array.isArray(res.data) ? res.data : [];
      setAlerts(list);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Unique categories for "filter by type" dropdown
  const categories = Array.from(new Set(alerts.map((a) => a.category).filter(Boolean)));

  const unreadCount = (severity?: FilterTab) =>
    alerts.filter((a) => !a.isRead && (severity === 'all' || severity === undefined ? true : a.severity === severity)).length;

  const filtered = alerts
    .filter((a) => activeTab === 'all' || a.severity === activeTab)
    .filter((a) => typeFilter === 'all' || a.category === typeFilter);

  function markRead(id: string) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
    apiFetch(`alerts/${id}/read`, { method: 'PATCH' }).catch(() => { /* optimistic */ });
  }

  function markAllRead() {
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
    apiFetch('alerts/mark-all-read', { method: 'POST' }).catch(() => { /* optimistic */ });
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: 'All'      },
    { key: 'critical', label: 'Critical' },
    { key: 'warning',  label: 'Warning'  },
    { key: 'info',     label: 'Info'     },
  ];

  const totalUnread = unreadCount();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Alert Center</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading…' : totalUnread > 0 ? `${totalUnread} unread alert${totalUnread !== 1 ? 's' : ''}` : 'All alerts read'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalUnread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <CheckCircle className="h-4 w-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Alert Rules Panel */}
      <AlertRulesPanel />

      {/* Severity filter tabs + category type filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Severity tabs */}
        <div className="flex flex-1 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {tabs.map(({ key, label }) => {
            const count    = key === 'all' ? totalUnread : alerts.filter((a) => !a.isRead && a.severity === key).length;
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {label}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                      isActive ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filter by type dropdown */}
        {categories.length > 0 && (
          <div className="relative flex-shrink-0">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="all">All types</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        )}
      </div>

      {/* Alert feed */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <BellOff className="h-12 w-12 text-gray-300 dark:text-gray-600" />
          <p className="mt-4 text-base font-medium text-gray-500 dark:text-gray-400">You&apos;re all caught up</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            No {activeTab !== 'all' ? activeTab : ''}{typeFilter !== 'all' ? ` ${typeFilter}` : ''} alerts to show.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => {
            const cfg          = severityConfig[alert.severity];
            const SeverityIcon = cfg.icon;
            return (
              <div
                key={alert.id}
                onClick={() => markRead(alert.id)}
                className={`relative cursor-pointer overflow-hidden rounded-xl border p-5 shadow-sm transition-opacity ${
                  alert.isRead ? 'opacity-60' : ''
                } ${cfg.bgClass} ${cfg.borderClass}`}
              >
                {!alert.isRead && (
                  <span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-indigo-500" />
                )}

                <div className="flex items-start gap-4">
                  <SeverityIcon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${cfg.iconClass}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badgeClass}`}>
                        {cfg.label}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {alert.category}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{alert.locationName}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">{alert.title}</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{alert.message}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(alert.createdAt)}</span>
                      {alert.actionUrl && (
                        <a
                          href={alert.actionUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
                        >
                          Take Action
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
