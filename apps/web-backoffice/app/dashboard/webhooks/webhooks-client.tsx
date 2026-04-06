'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, X, Loader2, Trash2, Play, CheckCircle2, XCircle, Eye, EyeOff, RefreshCw, Copy, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useToast } from '@/lib/use-toast';

interface DeliveryLog {
  id: string;
  status: 'success' | 'failed';
  responseCode: number;
  timestamp: string;
  event: string;
}

interface LogDetail {
  requestBody: unknown;
  responseBody: string;
  responseCode: number;
  duration: number;
  timestamp: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  status: 'active' | 'inactive' | 'suspended';
  lastDelivery: { id: string; event: string; status: string; responseCode: number; createdAt: string } | null;
  successRate: number;
  deliveryLogs: DeliveryLog[];
}

const ALL_EVENTS = [
  'order.created',
  'order.completed',
  'order.cancelled',
  'order.refunded',
  'payment.captured',
  'inventory.adjusted',
  'inventory.low_stock',
  'product.created',
  'product.updated',
  'customer.created',
  'customer.updated',
  'layby.payment_received',
  'gift_card.issued',
  'staff.clocked_in',
];

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ─── LogDetailRow ───────────────────────────────────────────────────────── */
function LogDetailRow({
  log,
  webhookId,
  onRetry,
}: {
  log: DeliveryLog;
  webhookId: string;
  onRetry: (logId: string) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function loadDetail() {
    if (detail) {
      setExpanded((v) => !v);
      return;
    }
    setLoadingDetail(true);
    setExpanded(true);
    try {
      const res = await fetch(`/api/proxy/webhooks/${webhookId}/logs/${log.id}`);
      const json: LogDetail = await res.json();
      setDetail(json);
    } catch {
      toast({ title: 'Failed to load log details', variant: 'destructive' });
      setExpanded(false);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      await fetch(`/api/proxy/webhooks/${webhookId}/logs/${log.id}/retry`, { method: 'POST' });
      toast({ title: 'Retry dispatched', description: 'The event has been re-sent to the endpoint.', variant: 'success' });
      onRetry(log.id);
    } catch {
      toast({ title: 'Retry failed', description: 'Could not retry the delivery.', variant: 'destructive' });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
      {/* Row header — click to expand */}
      <button
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={loadDetail}
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
        <div className="flex-shrink-0 mt-0.5 text-gray-400">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-3">
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading details…
            </div>
          ) : detail ? (
            <>
              {/* Meta */}
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="text-gray-500 dark:text-gray-400">
                  Status:{' '}
                  <span className={`font-semibold ${detail.responseCode < 300 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {detail.responseCode}
                  </span>
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  Duration: <span className="font-semibold text-gray-700 dark:text-gray-300">{detail.duration}ms</span>
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  Time: <span className="font-semibold text-gray-700 dark:text-gray-300">{formatTimestamp(detail.timestamp)}</span>
                </span>
              </div>

              {/* Request body */}
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Request Body</p>
                <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-green-300 leading-relaxed max-h-40">
                  {JSON.stringify(detail.requestBody, null, 2)}
                </pre>
              </div>

              {/* Response body */}
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Response Body</p>
                <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-300 leading-relaxed max-h-40">
                  {detail.responseBody || '(empty)'}
                </pre>
              </div>

              {/* Retry */}
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Retry
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ─── SigningSecretSection ───────────────────────────────────────────────── */
function SigningSecretSection({ webhookId }: { webhookId: string }) {
  const { toast } = useToast();
  const [revealed, setRevealed] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearReveal() {
    setRevealed(false);
    setSecret(null);
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }

  async function handleReveal() {
    if (revealed) {
      clearReveal();
      return;
    }
    setLoadingReveal(true);
    try {
      const res = await fetch(`/api/proxy/webhooks/${webhookId}/secret`);
      const json: { secret: string } = await res.json();
      setSecret(json.secret);
      setRevealed(true);
      // Auto-mask after 30 seconds
      revealTimerRef.current = setTimeout(clearReveal, 30_000);
    } catch {
      toast({ title: 'Failed to reveal secret', variant: 'destructive' });
    } finally {
      setLoadingReveal(false);
    }
  }

  async function handleRotate() {
    setRotating(true);
    setConfirmRotate(false);
    try {
      const res = await fetch(`/api/proxy/webhooks/${webhookId}/rotate-secret`, { method: 'POST' });
      const json: { secret: string } = await res.json();
      clearReveal();
      setNewSecret(json.secret);
      toast({ title: 'Secret rotated', description: 'Your webhook signing secret has been rotated.', variant: 'success' });
    } catch {
      toast({ title: 'Failed to rotate secret', variant: 'destructive' });
    } finally {
      setRotating(false);
    }
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied to clipboard', variant: 'success' });
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Signing Secret</p>

      {/* Current secret display */}
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-800">
          {revealed && secret ? (
            <span className="text-gray-900 dark:text-white break-all">{secret}</span>
          ) : (
            <span className="text-gray-400 dark:text-gray-500 tracking-widest">sk_••••••••••••••••</span>
          )}
        </div>
        <button
          onClick={handleReveal}
          disabled={loadingReveal}
          title={revealed ? 'Hide secret' : 'Reveal secret (shown for 30s)'}
          className="flex-shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {loadingReveal ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : revealed ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
        {revealed && secret && (
          <button
            onClick={() => copyToClipboard(secret)}
            title="Copy secret"
            className="flex-shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
      </div>
      {revealed && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Secret will be hidden automatically after 30 seconds.</p>
      )}

      {/* New secret after rotation */}
      {newSecret && (
        <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-900/20">
          <p className="mb-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">New signing secret — copy it now, it won&apos;t be shown again:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-emerald-800 dark:bg-gray-800 dark:text-emerald-300">
              {newSecret}
            </code>
            <button
              onClick={() => copyToClipboard(newSecret)}
              className="flex-shrink-0 rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-500 transition-colors"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setNewSecret(null)}
            className="mt-2 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Rotate button / confirm dialog */}
      {!confirmRotate ? (
        <button
          onClick={() => setConfirmRotate(true)}
          disabled={rotating}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Rotate Secret
        </button>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20 space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            This will invalidate the current secret. Continue?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRotate}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 transition-colors"
            >
              Yes, Rotate
            </button>
            <button
              onClick={() => setConfirmRotate(false)}
              className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── WebhooksClient ─────────────────────────────────────────────────────── */
export function WebhooksClient() {
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerWebhook, setDrawerWebhook] = useState<Webhook | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  // 'logs' | 'detail' — which section of the drawer is shown
  const [drawerTab, setDrawerTab] = useState<'logs' | 'detail'>('logs');

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

  function openDrawer(wh: Webhook) {
    setDrawerWebhook(wh);
    setDrawerTab('logs');
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
      const raw = await res.json().catch(() => ({})) as { data?: Partial<Webhook> } & Partial<Webhook>;
      const json = raw.data ?? raw;
      const created: Webhook = {
        lastDelivery: null,
        successRate: 100,
        deliveryLogs: [],
        ...json,
        id: json.id ?? String(Date.now()),
        url: newUrl,
        events: selectedEvents,
        active: json.active !== false,
        status: json.status ?? 'active',
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
      if (drawerWebhook?.id === id) setDrawerWebhook(null);
      toast({ title: 'Webhook deleted', description: 'Endpoint has been removed.', variant: 'success' });
    } catch {
      toast({ title: 'Delete failed', description: 'Could not remove the endpoint. Please try again.', variant: 'destructive' });
    }
  }

  async function handleToggle(id: string) {
    const webhook = webhooks.find((w) => w.id === id);
    if (!webhook) return;
    const newStatus = webhook.status === 'active' ? 'inactive' : 'active';
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, status: newStatus as 'active' | 'inactive' | 'suspended' } : w)));
    if (drawerWebhook?.id === id) setDrawerWebhook((prev) => prev ? { ...prev, status: newStatus as 'active' | 'inactive' | 'suspended' } : prev);
    try {
      await fetch(`/api/proxy/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      const revertStatus = newStatus === 'active' ? 'inactive' : 'active';
      setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, status: revertStatus as 'active' | 'inactive' | 'suspended' } : w)));
      if (drawerWebhook?.id === id) setDrawerWebhook((prev) => prev ? { ...prev, status: revertStatus as 'active' | 'inactive' | 'suspended' } : prev);
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
                    onClick={() => openDrawer(wh)}
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
                          wh.status === 'active'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {wh.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {wh.lastDelivery?.createdAt ? formatTimestamp(wh.lastDelivery.createdAt) : '—'}
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
                          title={wh.status === 'active' ? 'Deactivate' : 'Activate'}
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
                          {wh.status === 'active' ? 'Disable' : 'Enable'}
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
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-900 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Add Webhook</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-6 overflow-y-auto flex-1">
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

      {/* Detail / Delivery Logs Drawer */}
      {drawerWebhook && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerWebhook(null)} />
          <div className="flex w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-gray-900">
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Webhook Details</h3>
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

            {/* Drawer tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-800">
              {(['logs', 'detail'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDrawerTab(tab)}
                  className={`px-5 py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
                    drawerTab === tab
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {tab === 'logs' ? 'Delivery Logs' : 'Settings & Secret'}
                </button>
              ))}
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Delivery logs tab */}
              {drawerTab === 'logs' && (
                <>
                  {drawerWebhook.deliveryLogs.length === 0 ? (
                    <p className="text-center text-sm text-gray-400">No deliveries yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {drawerWebhook.deliveryLogs.slice(0, 20).map((log) => (
                        <LogDetailRow
                          key={log.id}
                          log={log}
                          webhookId={drawerWebhook.id}
                          onRetry={(logId) => {
                            // Optimistically mark retried log as success after retry
                            setDrawerWebhook((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                deliveryLogs: prev.deliveryLogs.map((l) =>
                                  l.id === logId ? { ...l, status: 'success' } : l
                                ),
                              };
                            });
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Settings & Secret tab */}
              {drawerTab === 'detail' && (
                <div className="space-y-6">
                  {/* Events subscribed */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Subscribed Events
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {drawerWebhook.events.map((e) => (
                        <span
                          key={e}
                          className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Status toggle */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</p>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          drawerWebhook.status === 'active'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {drawerWebhook.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        onClick={() => handleToggle(drawerWebhook.id)}
                        className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                      >
                        {drawerWebhook.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>

                  {/* Signing Secret */}
                  <SigningSecretSection webhookId={drawerWebhook.id} />

                  {/* Danger zone */}
                  <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">Danger Zone</p>
                    <button
                      onClick={() => {
                        handleDelete(drawerWebhook.id);
                        setDrawerWebhook(null);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Webhook
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
