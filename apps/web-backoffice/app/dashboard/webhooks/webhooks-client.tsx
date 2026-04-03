'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Trash2, Play, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/lib/use-toast';

interface DeliveryLog {
  id: string;
  status: 'success' | 'failed';
  responseCode: number;
  timestamp: string;
  event: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastDelivery: string | null;
  successRate: number;
  deliveryLogs: DeliveryLog[];
}

const ALL_EVENTS = [
  'order.created',
  'order.completed',
  'payment.captured',
  'customer.created',
  'product.updated',
  'inventory.low_stock',
];

const MOCK_WEBHOOKS: Webhook[] = [
  {
    id: '1',
    url: 'https://hooks.example.com/pos-events',
    events: ['order.created', 'order.completed', 'payment.captured'],
    active: true,
    lastDelivery: '2026-03-23T10:30:00Z',
    successRate: 98.5,
    deliveryLogs: [
      { id: 'd1', status: 'success', responseCode: 200, timestamp: '2026-03-23T10:30:00Z', event: 'order.created' },
      { id: 'd2', status: 'success', responseCode: 200, timestamp: '2026-03-23T09:15:00Z', event: 'payment.captured' },
      { id: 'd3', status: 'failed', responseCode: 503, timestamp: '2026-03-22T18:00:00Z', event: 'order.completed' },
      { id: 'd4', status: 'success', responseCode: 200, timestamp: '2026-03-22T16:45:00Z', event: 'order.created' },
      { id: 'd5', status: 'success', responseCode: 200, timestamp: '2026-03-22T14:20:00Z', event: 'payment.captured' },
    ],
  },
  {
    id: '2',
    url: 'https://crm.example.com/webhooks/elevatedpos',
    events: ['customer.created', 'order.completed'],
    active: false,
    lastDelivery: '2026-03-20T08:00:00Z',
    successRate: 75.0,
    deliveryLogs: [
      { id: 'd6', status: 'failed', responseCode: 404, timestamp: '2026-03-20T08:00:00Z', event: 'customer.created' },
      { id: 'd7', status: 'success', responseCode: 200, timestamp: '2026-03-19T17:30:00Z', event: 'order.completed' },
      { id: 'd8', status: 'failed', responseCode: 500, timestamp: '2026-03-19T12:00:00Z', event: 'customer.created' },
    ],
  },
];

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WebhooksClient() {
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerWebhook, setDrawerWebhook] = useState<Webhook | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  useEffect(() => {
    setIsLoading(true);
    fetch('/api/proxy/webhooks')
      .then((r) => r.json())
      .then((json) => {
        const data: Webhook[] = Array.isArray(json) ? json : json.data ?? [];
        setWebhooks(data);
      })
      .catch(() => setWebhooks([]))
      .finally(() => setIsLoading(false));
  }, []);

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  function openModal() {
    setNewUrl('');
    setSelectedEvents([]);
    setShowModal(true);
  }

  async function handleSave() {
    if (!newUrl.trim() || selectedEvents.length === 0) {
      toast({ title: 'Missing fields', description: 'Please enter a URL and select at least one event.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = { url: newUrl, events: selectedEvents };
      const res = await fetch('/api/proxy/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({})) as Partial<Webhook>;
      // Spread API response first (so our local state wins for UI-critical fields)
      const created: Webhook = {
        lastDelivery: null,
        successRate: 100,
        deliveryLogs: [],
        ...json,
        // These must always reflect what we submitted, not potentially stale API echo
        id: json.id ?? String(Date.now()),
        url: newUrl,
        events: selectedEvents,
        active: json.active ?? true,
      };
      setWebhooks((prev) => [...prev, created]);
      toast({ title: 'Webhook created', description: `Endpoint registered for ${selectedEvents.length} event(s).`, variant: 'success' });
      setShowModal(false);
    } catch {
      toast({ title: 'Failed to create webhook', description: 'Could not register the endpoint. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      await fetch(`/api/proxy/webhooks/${id}/test`, { method: 'POST' });
      toast({ title: 'Test sent', description: 'A test payload has been dispatched to the endpoint.', variant: 'success' });
    } catch {
      toast({ title: 'Test failed', description: 'Could not send test payload. Check endpoint availability.', variant: 'destructive' });
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/proxy/webhooks/${id}`, { method: 'DELETE' });
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast({ title: 'Webhook deleted', description: 'Endpoint has been removed.', variant: 'success' });
    } catch {
      toast({ title: 'Delete failed', description: 'Could not remove the endpoint. Please try again.', variant: 'destructive' });
    }
  }

  async function handleToggle(id: string) {
    const webhook = webhooks.find((w) => w.id === id);
    if (!webhook) return;
    const newActive = !webhook.active;
    // Optimistically update
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, active: newActive } : w)));
    try {
      await fetch(`/api/proxy/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newActive }),
      });
    } catch {
      // Revert on failure
      setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, active: !newActive } : w)));
      toast({ title: 'Update failed', description: 'Could not update webhook status.', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Webhooks</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLoading ? 'Loading…' : `${webhooks.length} endpoints configured`}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Add Webhook
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Endpoint URL</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Events</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Last Delivery</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Success Rate</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '70%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : webhooks.map((wh) => (
                  <tr
                    key={wh.id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    onClick={() => setDrawerWebhook(wh)}
                  >
                    <td className="px-5 py-4 max-w-xs">
                      <p className="truncate font-mono text-sm text-gray-900 dark:text-white">{wh.url}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {wh.events.slice(0, 2).map((e) => (
                          <span
                            key={e}
                            className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400"
                          >
                            {e}
                          </span>
                        ))}
                        {wh.events.length > 2 && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                            +{wh.events.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          wh.active
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {wh.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {wh.lastDelivery ? formatTimestamp(wh.lastDelivery) : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-sm font-semibold ${
                          wh.successRate >= 90
                            ? 'text-green-600 dark:text-green-400'
                            : wh.successRate >= 70
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {wh.successRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleTest(wh.id)}
                          disabled={testingId === wh.id}
                          title="Test"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          {testingId === wh.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleToggle(wh.id)}
                          title={wh.active ? 'Deactivate' : 'Activate'}
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
                          {wh.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDelete(wh.id)}
                          title="Delete"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            {!isLoading && webhooks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                  No webhooks configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Webhook Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Add Webhook</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Events
                </label>
                <div className="space-y-2">
                  {ALL_EVENTS.map((event) => (
                    <label key={event} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(event)}
                        onChange={() => toggleEvent(event)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">{event}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !newUrl || selectedEvents.length === 0}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Add Webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Logs Drawer */}
      {drawerWebhook && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerWebhook(null)} />
          <div className="flex w-full max-w-md flex-col bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delivery Logs</h3>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400 font-mono max-w-xs">
                  {drawerWebhook.url}
                </p>
              </div>
              <button
                onClick={() => setDrawerWebhook(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {drawerWebhook.deliveryLogs.length === 0 ? (
                <p className="text-center text-sm text-gray-400">No deliveries yet.</p>
              ) : (
                <div className="space-y-3">
                  {drawerWebhook.deliveryLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
                    >
                      {log.status === 'success' ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-medium text-gray-900 dark:text-white">
                            {log.event}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              log.status === 'success'
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {log.responseCode}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">{formatTimestamp(log.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
