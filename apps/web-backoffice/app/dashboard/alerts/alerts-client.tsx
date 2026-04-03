'use client';

import { useState, useEffect, useCallback } from 'react';
import { XCircle, AlertTriangle, Info, CheckCircle, ExternalLink, BellOff } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { timeAgo } from '@/lib/formatting';

type Alert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  category: string;
  locationName: string;
  createdAt: string;
  isRead: boolean;
  actionUrl?: string;
};

const MOCK_ALERTS: Alert[] = [
  {
    id: 'a1',
    severity: 'critical',
    title: 'Low Stock: Oat Milk',
    message: 'Oat Milk (1L) is at 2 units — below the minimum threshold of 10. Reorder immediately to avoid stockouts.',
    category: 'Inventory',
    locationName: 'Sydney CBD',
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    isRead: false,
    actionUrl: '/dashboard/inventory',
  },
  {
    id: 'a2',
    severity: 'critical',
    title: 'KDS Offline',
    message: 'Kitchen Display System at Station 2 has been unreachable for 8 minutes. Orders may not be reaching the kitchen.',
    category: 'Hardware',
    locationName: 'Surry Hills',
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    isRead: false,
  },
  {
    id: 'a3',
    severity: 'warning',
    title: 'Payment Terminal Offline',
    message: 'Terminal PAX-03 has lost connectivity. Cash payments only until the terminal is reconnected.',
    category: 'Hardware',
    locationName: 'Newtown',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    isRead: false,
  },
  {
    id: 'a4',
    severity: 'warning',
    title: 'Cash Variance Detected',
    message: 'End-of-day cash count is $47.50 short of the expected amount. A manager review is required.',
    category: 'Finance',
    locationName: 'Sydney CBD',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    isRead: true,
    actionUrl: '/dashboard/reports',
  },
  {
    id: 'a5',
    severity: 'info',
    title: 'Xero Integration Connected',
    message: 'Your Xero accounting integration was successfully connected. Daily sales summaries will now sync automatically.',
    category: 'Integrations',
    locationName: 'All Locations',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    isRead: true,
    actionUrl: '/dashboard/integrations',
  },
  {
    id: 'a6',
    severity: 'info',
    title: 'System Maintenance Scheduled',
    message: 'A scheduled maintenance window is planned for Sunday 2:00 AM – 4:00 AM AEST. Brief downtime may occur.',
    category: 'System',
    locationName: 'All Locations',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    isRead: true,
  },
];

type FilterTab = 'all' | 'critical' | 'warning' | 'info';

const severityConfig = {
  critical: {
    icon: XCircle,
    iconClass: 'text-red-500',
    bgClass: 'bg-red-50 dark:bg-red-900/10',
    borderClass: 'border-red-200 dark:border-red-900/30',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label: 'Critical',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-orange-500',
    bgClass: 'bg-orange-50 dark:bg-orange-900/10',
    borderClass: 'border-orange-200 dark:border-orange-900/30',
    badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    label: 'Warning',
  },
  info: {
    icon: Info,
    iconClass: 'text-blue-500',
    bgClass: 'bg-blue-50 dark:bg-blue-900/10',
    borderClass: 'border-blue-200 dark:border-blue-900/30',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    label: 'Info',
  },
};

export function AlertsClient() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Alert[] }>('alerts?limit=50&sort=createdAt:desc');
      const list = Array.isArray(res.data) ? res.data : [];
      setAlerts(list);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unreadCount = (severity?: FilterTab) =>
    alerts.filter((a) => !a.isRead && (severity === 'all' || severity === undefined ? true : a.severity === severity)).length;

  const filtered = activeTab === 'all' ? alerts : alerts.filter((a) => a.severity === activeTab);

  function markRead(id: string) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
    apiFetch(`alerts/${id}/read`, { method: 'PATCH' }).catch(() => { /* optimistic */ });
  }

  function markAllRead() {
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
    apiFetch('alerts/mark-all-read', { method: 'POST' }).catch(() => { /* optimistic */ });
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'critical', label: 'Critical' },
    { key: 'warning', label: 'Warning' },
    { key: 'info', label: 'Info' },
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

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {tabs.map(({ key, label }) => {
          const count = key === 'all' ? totalUnread : alerts.filter((a) => !a.isRead && a.severity === key).length;
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
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">No {activeTab !== 'all' ? activeTab : ''} alerts to show.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => {
            const cfg = severityConfig[alert.severity];
            const SeverityIcon = cfg.icon;
            return (
              <div
                key={alert.id}
                onClick={() => markRead(alert.id)}
                className={`relative cursor-pointer overflow-hidden rounded-xl border p-5 shadow-sm transition-opacity ${
                  alert.isRead ? 'opacity-60' : ''
                } ${cfg.bgClass} ${cfg.borderClass}`}
              >
                {/* Unread indicator */}
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
