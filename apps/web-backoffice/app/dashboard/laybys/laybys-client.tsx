'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { CalendarCheck, Plus, X, AlertCircle, Settings, DollarSign, Trash2 } from 'lucide-react';

interface Layby {
  id: string;
  agreementNumber: string;
  customerName: string;
  total: number;
  paid: number;
  status: 'active' | 'completed' | 'cancelled';
  nextPaymentDate: string | null;
  nextPaymentAmount: number | null;
  createdAt: string;
  itemsSummary: string;
}

interface LaybysResponse {
  data: Layby[];
}

interface LaybyTerms {
  minDepositPct: number;
  maxPeriodWeeks: number;
  cancellationFeePct: number;
  autoCancelMissedPayments: number;
}

type FilterTab = 'active' | 'completed' | 'cancelled' | 'all';

const STATUS_STYLES: Record<Layby['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

/* ─── LaybySettingsModal ─────────────────────────────────────────────────── */
function LaybySettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (terms: LaybyTerms) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [terms, setTerms] = useState<LaybyTerms>({
    minDepositPct: 10,
    maxPeriodWeeks: 12,
    cancellationFeePct: 10,
    autoCancelMissedPayments: 3,
  });

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('settings/layby-terms', {
        method: 'PUT',
        body: JSON.stringify(terms),
      });
      toast({ title: 'Settings saved', description: 'Lay-by terms updated successfully.', variant: 'success' });
      onSaved(terms);
      onClose();
    } catch (err) {
      toast({ title: 'Failed to save settings', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Lay-by Terms Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Minimum Deposit (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="100"
                value={terms.minDepositPct}
                onChange={(e) => setTerms({ ...terms, minDepositPct: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
              <span className="absolute right-3 top-2 text-sm text-gray-400">%</span>
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Minimum deposit required to start a lay-by (default 10%)</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Maximum Lay-by Period (weeks)
            </label>
            <input
              type="number"
              min="1"
              max="104"
              value={terms.maxPeriodWeeks}
              onChange={(e) => setTerms({ ...terms, maxPeriodWeeks: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Maximum duration of a lay-by agreement (default 12 weeks)</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Cancellation Fee (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                value={terms.cancellationFeePct}
                onChange={(e) => setTerms({ ...terms, cancellationFeePct: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
              <span className="absolute right-3 top-2 text-sm text-gray-400">%</span>
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Fee charged on amount paid when a lay-by is cancelled (default 10%)</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Auto-cancel After Missed Payments
            </label>
            <input
              type="number"
              min="1"
              max="12"
              value={terms.autoCancelMissedPayments}
              onChange={(e) => setTerms({ ...terms, autoCancelMissedPayments: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Automatically cancel lay-by after this many consecutive missed payments</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Settings className="h-4 w-4" />
            )}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── RecordPaymentModal ─────────────────────────────────────────────────── */
function RecordPaymentModal({
  layby,
  onClose,
  onSuccess,
}: {
  layby: Layby;
  onClose: () => void;
  onSuccess: (laybyId: string, amountPaid: number) => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(
    layby.nextPaymentAmount != null ? String(layby.nextPaymentAmount) : ''
  );
  const [method, setMethod] = useState<'cash' | 'card' | 'other'>('cash');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const outstanding = layby.total - layby.paid;

  async function handleRecord() {
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) return;
    setSaving(true);
    try {
      await apiFetch(`laybys/${layby.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: amountNum, method, reference }),
      });
      const newPaid = layby.paid + amountNum;
      onSuccess(layby.id, amountNum);
      if (newPaid >= layby.total) {
        toast({ title: 'Layby completed!', description: `${layby.customerName}'s lay-by is now paid in full.`, variant: 'success' });
      } else {
        toast({
          title: `Payment of $${amountNum.toFixed(2)} recorded`,
          description: `Balance owing: $${(layby.total - newPaid).toFixed(2)}`,
          variant: 'success',
        });
      }
      onClose();
    } catch (err) {
      toast({ title: 'Failed to record payment', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Record Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Summary */}
          <div className="rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Agreement</span>
              <span className="font-mono text-xs font-medium text-gray-700 dark:text-gray-300">{layby.agreementNumber}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Customer</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{layby.customerName}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Outstanding balance</span>
              <span className="font-bold text-gray-900 dark:text-white">${outstanding.toFixed(2)}</span>
            </div>
            {layby.nextPaymentAmount != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Next payment due</span>
                <span className="text-elevatedpos-600 dark:text-elevatedpos-400 font-medium">${layby.nextPaymentAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Payment Amount ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={outstanding}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Payment Method</label>
            <div className="flex gap-2">
              {(['cash', 'card', 'other'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${
                    method === m
                      ? 'border-elevatedpos-500 bg-elevatedpos-50 text-elevatedpos-700 dark:bg-elevatedpos-900/30 dark:text-elevatedpos-400 dark:border-elevatedpos-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Reference (optional)</label>
            <input
              type="text"
              placeholder="e.g. receipt number, transaction ID"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRecord}
            disabled={!amount || Number(amount) <= 0 || saving}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <DollarSign className="h-4 w-4" />
            )}
            Record Payment
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── CancelConfirmDialog ────────────────────────────────────────────────── */
function CancelConfirmDialog({
  layby,
  cancellationFeePct,
  onClose,
  onConfirm,
}: {
  layby: Layby;
  cancellationFeePct: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const { toast } = useToast();

  async function handleCancel() {
    setCancelling(true);
    try {
      await apiFetch(`laybys/${layby.id}/cancel`, { method: 'POST' });
      onConfirm();
      toast({ title: 'Lay-by cancelled', description: `Agreement ${layby.agreementNumber} has been cancelled.`, variant: 'success' });
    } catch (err) {
      toast({ title: 'Failed to cancel lay-by', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Cancel Lay-by?</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Cancel lay-by{' '}
            <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{layby.agreementNumber}</span>{' '}
            for <span className="font-medium text-gray-700 dark:text-gray-300">{layby.customerName}</span>?
          </p>
          {cancellationFeePct > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 dark:bg-amber-900/20 dark:border-amber-800">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                A cancellation fee of {cancellationFeePct}% may apply to the amount already paid.
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            Keep Lay-by
          </button>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {cancelling ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Yes, Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── LaybysClient ───────────────────────────────────────────────────────── */
export default function LaybysClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<Layby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('active');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [paymentLayby, setPaymentLayby] = useState<Layby | null>(null);
  const [cancelLayby, setCancelLayby] = useState<Layby | null>(null);

  const [saving, setSaving] = useState(false);
  const [laybyTerms, setLaybyTerms] = useState<LaybyTerms>({
    minDepositPct: 10,
    maxPeriodWeeks: 12,
    cancellationFeePct: 10,
    autoCancelMissedPayments: 3,
  });

  const [form, setForm] = useState({
    customerName: '',
    itemsSummary: '',
    total: '',
    depositAmount: '',
    installmentCount: '4',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<LaybysResponse>('laybys');
      setItems(res.data ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!form.customerName || !form.total || !form.depositAmount) return;
    setSaving(true);
    try {
      await apiFetch('laybys', {
        method: 'POST',
        body: JSON.stringify({
          customerName: form.customerName,
          itemsSummary: form.itemsSummary,
          total: Number(form.total),
          depositAmount: Number(form.depositAmount),
          installmentCount: Number(form.installmentCount),
        }),
      });
      const newLayby: Layby = {
        id: `lb${Date.now()}`,
        agreementNumber: `LB-2026-${String(items.length + 1).padStart(4, '0')}`,
        customerName: form.customerName,
        total: Number(form.total),
        paid: Number(form.depositAmount),
        status: 'active',
        nextPaymentDate: 'Apr 1, 2026',
        nextPaymentAmount: Math.ceil((Number(form.total) - Number(form.depositAmount)) / (Number(form.installmentCount) - 1)),
        createdAt: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
        itemsSummary: form.itemsSummary || 'Miscellaneous items',
      };
      setItems((prev) => [newLayby, ...prev]);
      setForm({ customerName: '', itemsSummary: '', total: '', depositAmount: '', installmentCount: '4' });
      setShowModal(false);
      toast({ title: 'Layby created', description: `Agreement created for ${form.customerName}.`, variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to create layby', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function handlePaymentSuccess(laybyId: string, amountPaid: number) {
    setItems((prev) =>
      prev.map((lb) => {
        if (lb.id !== laybyId) return lb;
        const newPaid = lb.paid + amountPaid;
        return {
          ...lb,
          paid: newPaid,
          status: newPaid >= lb.total ? 'completed' : lb.status,
        };
      })
    );
  }

  function handleCancelSuccess(laybyId: string) {
    setItems((prev) =>
      prev.map((lb) => (lb.id === laybyId ? { ...lb, status: 'cancelled' } : lb))
    );
  }

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'active', label: `Active (${items.filter((i) => i.status === 'active').length})` },
    { id: 'completed', label: `Completed (${items.filter((i) => i.status === 'completed').length})` },
    { id: 'cancelled', label: `Cancelled (${items.filter((i) => i.status === 'cancelled').length})` },
    { id: 'all', label: `All (${items.length})` },
  ];

  const filtered = activeTab === 'all' ? items : items.filter((i) => i.status === activeTab);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Lay-bys</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Manage lay-by payment agreements</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Lay-by
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-elevatedpos-500 text-elevatedpos-600 dark:text-elevatedpos-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 dark:border-gray-700 dark:bg-gray-800/40">
          <CalendarCheck className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No {activeTab !== 'all' ? activeTab : ''} lay-by agreements.</p>
        </div>
      )}

      {/* Cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((layby) => {
            const pct = layby.total > 0 ? Math.round((layby.paid / layby.total) * 100) : 0;
            const owing = layby.total - layby.paid;
            return (
              <div
                key={layby.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{layby.agreementNumber}</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{layby.customerName}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[layby.status]}`}>
                        {layby.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">{layby.itemsSummary}</p>

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>Payment progress — {pct}%</span>
                        <span className="font-mono">${layby.paid.toFixed(0)} / ${layby.total.toFixed(0)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${layby.status === 'completed' ? 'bg-blue-500' : layby.status === 'cancelled' ? 'bg-gray-400' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Active action buttons */}
                    {layby.status === 'active' && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => setPaymentLayby(layby)}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                          Record Payment
                        </button>
                        <button
                          onClick={() => setCancelLayby(layby)}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel Lay-by
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 text-right">
                    {layby.status === 'active' && owing > 0 && (
                      <>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Balance owing</p>
                        <p className="text-base font-bold text-gray-900 dark:text-white">${owing.toFixed(0)}</p>
                        {layby.nextPaymentDate && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Next: ${layby.nextPaymentAmount} on {layby.nextPaymentDate}
                          </p>
                        )}
                      </>
                    )}
                    {layby.status === 'completed' && (
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Paid in full</p>
                    )}
                    {layby.status === 'cancelled' && (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Cancelled</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Lay-by Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">New Lay-by Agreement</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Customer Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Jane Smith"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Items Summary</label>
                <input
                  type="text"
                  placeholder="e.g. Samsung 65&quot; TV"
                  value={form.itemsSummary}
                  onChange={(e) => setForm({ ...form, itemsSummary: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Total ($) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 800"
                    value={form.total}
                    onChange={(e) => setForm({ ...form, total: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Deposit ($) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 200"
                    value={form.depositAmount}
                    onChange={(e) => setForm({ ...form, depositAmount: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Number of Installments</label>
                <select
                  value={form.installmentCount}
                  onChange={(e) => setForm({ ...form, installmentCount: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 bg-white"
                >
                  <option value="2">2 payments</option>
                  <option value="3">3 payments</option>
                  <option value="4">4 payments</option>
                  <option value="6">6 payments</option>
                  <option value="8">8 payments</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.customerName || !form.total || !form.depositAmount || saving}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <CalendarCheck className="h-4 w-4" />
                )}
                Create Agreement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layby Settings Modal */}
      {showSettingsModal && (
        <LaybySettingsModal
          onClose={() => setShowSettingsModal(false)}
          onSaved={(terms) => setLaybyTerms(terms)}
        />
      )}

      {/* Record Payment Modal */}
      {paymentLayby && (
        <RecordPaymentModal
          layby={paymentLayby}
          onClose={() => setPaymentLayby(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Cancel Confirm Dialog */}
      {cancelLayby && (
        <CancelConfirmDialog
          layby={cancelLayby}
          cancellationFeePct={laybyTerms.cancellationFeePct}
          onClose={() => setCancelLayby(null)}
          onConfirm={() => {
            handleCancelSuccess(cancelLayby.id);
            setCancelLayby(null);
          }}
        />
      )}
    </div>
  );
}
