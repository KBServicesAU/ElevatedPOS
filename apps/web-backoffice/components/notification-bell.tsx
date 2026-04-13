'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, AlertTriangle, Info, ShoppingCart, Package, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { timeAgo } from '../lib/formatting';

interface Notification {
  id: string;
  type: 'alert' | 'info' | 'order' | 'stock' | 'customer';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

// Icon per notification type
const typeIcon: Record<Notification['type'], React.ElementType> = {
  alert: AlertTriangle,
  info: Info,
  order: ShoppingCart,
  stock: Package,
  customer: Users,
};

const typeColor: Record<Notification['type'], string> = {
  alert: 'text-red-500 bg-red-50 dark:bg-red-900/20',
  info: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
  order: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20',
  stock: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20',
  customer: 'text-green-500 bg-green-50 dark:bg-green-900/20',
};

// Demo notifications shown when backend is unavailable
const DEMO_NOTIFICATIONS: Notification[] = [
  { id: '1', type: 'stock', title: 'Low stock alert', body: 'Flat White Blend is below threshold (3 units remaining).', read: false, createdAt: new Date(Date.now() - 12 * 60_000).toISOString() },
  { id: '2', type: 'order', title: 'New order #1042', body: 'Table 4 — $47.50 · 3 items. Awaiting processing.', read: false, createdAt: new Date(Date.now() - 28 * 60_000).toISOString() },
  { id: '3', type: 'customer', title: 'New customer registered', body: 'Sarah Mitchell joined via loyalty sign-up.', read: true, createdAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: '4', type: 'alert', title: 'End-of-day report ready', body: 'Yesterday\'s sales report is available in Reports.', read: true, createdAt: new Date(Date.now() - 14 * 3600_000).toISOString() },
];

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [prefetchedUnread, setPrefetchedUnread] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.length > 0
    ? notifications.filter((n) => !n.read).length
    : (prefetchedUnread ?? 0);

  // Prefetch unread count on mount (so badge shows without opening panel)
  useEffect(() => {
    apiFetch('notifications/unread-count')
      .then((data: unknown) => {
        const count =
          data && typeof data === 'object' && 'count' in data
            ? Number((data as { count: unknown }).count)
            : typeof data === 'number'
              ? data
              : null;
        if (count !== null && !isNaN(count)) setPrefetchedUnread(count);
        else setPrefetchedUnread(DEMO_NOTIFICATIONS.filter((n) => !n.read).length);
      })
      .catch(() => setPrefetchedUnread(DEMO_NOTIFICATIONS.filter((n) => !n.read).length));
  }, []);

  // Fetch full list on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch('notifications?limit=20&sort=createdAt:desc')
      .then((data: unknown) => {
        // API may return { data: [...] } or a bare array
        const list =
          data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data: unknown }).data)
            ? (data as { data: unknown[] }).data
            : Array.isArray(data)
              ? data
              : null;
        const resolved = list ? (list as Notification[]) : DEMO_NOTIFICATIONS;
        setNotifications(resolved);
        setPrefetchedUnread(resolved.filter((n) => !n.read).length);
      })
      .catch(() => {
        setNotifications(DEMO_NOTIFICATIONS);
        setPrefetchedUnread(DEMO_NOTIFICATIONS.filter((n) => !n.read).length);
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const markAllRead = async () => {
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    setPrefetchedUnread(0);
    try {
      await apiFetch('notifications/mark-all-read', { method: 'POST' });
    } catch {
      // optimistic — ignore errors
    }
  };

  const markRead = async (id: string) => {
    setNotifications((ns) => {
      const wasUnread = ns.find((n) => n.id === id && !n.read);
      if (wasUnread) setPrefetchedUnread((c) => Math.max(0, (c ?? 1) - 1));
      return ns.map((n) => (n.id === id ? { ...n, read: true } : n));
    });
    try {
      await apiFetch(`notifications/${id}/read`, { method: 'PATCH' });
    } catch {
      // optimistic
    }
  };

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-elevatedpos-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Bell className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">All caught up!</p>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = typeIcon[n.type] ?? Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                      !n.read ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''
                    }`}
                  >
                    <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${typeColor[n.type]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                          {n.title}
                        </p>
                        <span className="flex-shrink-0 text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.body}</p>
                    </div>
                    {!n.read && (
                      <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-elevatedpos-600" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
            <a
              href="/dashboard/alerts"
              className="block text-center text-sm font-medium text-elevatedpos-600 hover:text-elevatedpos-700 dark:text-elevatedpos-400"
              onClick={() => setOpen(false)}
            >
              View all alerts →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
