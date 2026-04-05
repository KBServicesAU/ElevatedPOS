'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { Gift, Plus, X, AlertCircle, Mail, CreditCard } from 'lucide-react';

interface GiftCard {
  id: string;
  code: string;
  balance: number;
  originalAmount: number;
  issuedTo: string;
  issuedDate: string;
  expiryDate: string | null;
  status: 'active' | 'depleted' | 'cancelled';
}

interface GiftCardsResponse {
  data: GiftCard[];
}

type FilterTab = 'active' | 'depleted' | 'cancelled' | 'all';

const STATUS_STYLES: Record<GiftCard['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  depleted: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

// ─── Top Up Modal ──────────────────────────────────────────────────────────────

function TopUpModal({
  card,
  onClose,
  onSuccess,
}: {
  card: GiftCard;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleTopUp() {
    const num = Number(amount);
    if (!num || num <= 0) return;
    setLoading(true);
    try {
      await apiFetch(`gift-cards/${card.id}/top-up`, {
        method: 'POST',
        body: JSON.stringify({ amount: num }),
      });
      const newBalance = card.balance + num;
      onSuccess(newBalance);
      toast({
        title: 'Balance topped up',
        description: `${card.code} balance updated to $${newBalance.toFixed(2)}.`,
        variant: 'success',
      });
      onClose();
    } catch (err) {
      toast({
        title: 'Top-up failed',
        description: getErrorMessage(err, 'Failed to top up gift card.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Top Up Gift Card</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 font-mono">{card.code}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Current Balance</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">${card.balance.toFixed(2)}</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Top-Up Amount ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 25"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
              autoFocus
            />
          </div>
          {amount && Number(amount) > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              New balance will be{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                ${(card.balance + Number(amount)).toFixed(2)}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { void handleTopUp(); }}
            disabled={!amount || Number(amount) <= 0 || loading}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Top Up
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Send Email Modal ──────────────────────────────────────────────────────────

function SendEmailModal({
  card,
  onClose,
}: {
  card: GiftCard;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await apiFetch(`gift-cards/${card.id}/send-email`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      toast({
        title: 'Gift card sent',
        description: `Gift card sent to ${email.trim()}.`,
        variant: 'success',
      });
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to send',
        description: getErrorMessage(err, 'Failed to send gift card email.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Send Gift Card</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 font-mono">{card.code}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Customer Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
              autoFocus
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
            onClick={() => { void handleSend(); }}
            disabled={!email.trim() || loading}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function GiftCardsClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [showModal, setShowModal] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const [form, setForm] = useState({
    amount: '',
    customerName: '',
    expiryDate: '',
    customerEmail: '',
    sendEmail: false,
  });
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // Top-up modal state
  const [topUpCard, setTopUpCard] = useState<GiftCard | null>(null);

  // Send email modal state
  const [sendEmailCard, setSendEmailCard] = useState<GiftCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<GiftCardsResponse>('gift-cards');
      setItems(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gift cards');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel(card: GiftCard) {
    setCancellingId(card.id);
    setConfirmCancelId(null);
    try {
      await apiFetch(`gift-cards/${card.id}/cancel`, { method: 'POST' });
      setItems((prev) => prev.map((c) => c.id === card.id ? { ...c, status: 'cancelled' as const } : c));
      toast({ title: 'Gift card cancelled', description: `${card.code} has been cancelled.`, variant: 'default' });
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to cancel gift card.');
      toast({ title: 'Failed to cancel', description: msg, variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  }

  async function handleIssue() {
    if (!form.amount || !form.customerName) return;
    setIssuing(true);
    try {
      const res = await apiFetch<Partial<GiftCard>>('gift-cards', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(form.amount),
          customerName: form.customerName,
          expiryDate: form.expiryDate || null,
        }),
      });
      const newCard: GiftCard = {
        id: res.id ?? `gc${Date.now()}`,
        code: res.code ?? `GIFT-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        balance: res.balance ?? Number(form.amount),
        originalAmount: res.originalAmount ?? Number(form.amount),
        issuedTo: res.issuedTo ?? form.customerName,
        issuedDate: res.issuedDate ?? new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
        expiryDate: res.expiryDate ?? (form.expiryDate || null),
        status: res.status ?? 'active',
      };
      setItems((prev) => [newCard, ...prev]);

      // Send email if requested
      if (form.sendEmail && form.customerEmail.trim()) {
        try {
          await apiFetch(`gift-cards/${newCard.id}/send-email`, {
            method: 'POST',
            body: JSON.stringify({ email: form.customerEmail.trim() }),
          });
          toast({
            title: 'Gift card sent',
            description: `Gift card sent to ${form.customerEmail.trim()}.`,
            variant: 'success',
          });
        } catch (emailErr) {
          toast({
            title: 'Gift card issued (email failed)',
            description: getErrorMessage(emailErr, 'Card issued but failed to send email.'),
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Gift card issued',
          description: `${newCard.code} — $${Number(form.amount).toFixed(2)} issued to ${form.customerName}.`,
          variant: 'success',
        });
      }

      setForm({ amount: '', customerName: '', expiryDate: '', customerEmail: '', sendEmail: false });
      setShowModal(false);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to issue gift card.');
      toast({ title: 'Failed to issue gift card', description: msg, variant: 'destructive' });
    } finally {
      setIssuing(false);
    }
  }

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'active', label: `Active (${items.filter((i) => i.status === 'active').length})` },
    { id: 'depleted', label: `Depleted (${items.filter((i) => i.status === 'depleted').length})` },
    { id: 'cancelled', label: `Cancelled (${items.filter((i) => i.status === 'cancelled').length})` },
    { id: 'all', label: `All (${items.length})` },
  ];

  const filtered = activeTab === 'all' ? items : items.filter((i) => i.status === activeTab);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Gift Cards</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Issue and manage gift card balances</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Issue Gift Card
        </button>
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
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
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

      {/* Table */}
      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Gift className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No {activeTab !== 'all' ? activeTab : ''} gift cards found.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                <tr>
                  {['Code', 'Balance', 'Issued To', 'Issued Date', 'Expiry', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((card) => {
                  return (
                    <tr key={card.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-700 dark:text-gray-300">{card.code}</td>
                      <td className="px-4 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          card.balance > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          ${card.balance.toFixed(2)}
                        </span>
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">/ ${card.originalAmount}</span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 dark:text-gray-300">{card.issuedTo}</td>
                      <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400">{card.issuedDate}</td>
                      <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400">{card.expiryDate ?? 'No expiry'}</td>
                      <td className="px-4 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[card.status]}`}>
                          {card.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {card.status === 'active' && (
                          confirmCancelId === card.id ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Cancel card?</span>
                              <button
                                onClick={() => { void handleCancel(card); }}
                                disabled={cancellingId === card.id}
                                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                              >
                                {cancellingId === card.id ? 'Cancelling…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setConfirmCancelId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-3">
                              <button
                                onClick={() => setTopUpCard(card)}
                                className="flex items-center gap-1 text-xs font-medium text-elevatedpos-600 hover:text-elevatedpos-500 dark:text-elevatedpos-400 transition-colors"
                              >
                                <CreditCard className="h-3 w-3" />
                                Top Up
                              </button>
                              <button
                                onClick={() => setSendEmailCard(card)}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                              >
                                <Mail className="h-3 w-3" />
                                Send
                              </button>
                              <button
                                onClick={() => setConfirmCancelId(card.id)}
                                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                              >
                                Cancel
                              </button>
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Issue Gift Card Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Issue Gift Card</h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setForm({ amount: '', customerName: '', expiryDate: '', customerEmail: '', sendEmail: false });
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Amount ($) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 50"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>
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
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Expiry Date <span className="text-gray-400">(optional)</span></label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
              </div>

              {/* Email delivery section */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.sendEmail}
                    onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-elevatedpos-600 focus:ring-elevatedpos-500 dark:border-gray-600"
                  />
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Mail className="h-3.5 w-3.5 text-gray-400" />
                    Send to customer via email
                  </span>
                </label>
                {form.sendEmail && (
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    value={form.customerEmail}
                    onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                    autoFocus
                  />
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowModal(false);
                  setForm({ amount: '', customerName: '', expiryDate: '', customerEmail: '', sendEmail: false });
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleIssue(); }}
                disabled={!form.amount || !form.customerName || issuing || (form.sendEmail && !form.customerEmail.trim())}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {issuing ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Gift className="h-4 w-4" />
                )}
                Issue Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Up Modal */}
      {topUpCard && (
        <TopUpModal
          card={topUpCard}
          onClose={() => setTopUpCard(null)}
          onSuccess={(newBalance) => {
            setItems((prev) =>
              prev.map((c) => c.id === topUpCard.id ? { ...c, balance: newBalance } : c)
            );
          }}
        />
      )}

      {/* Send Email Modal */}
      {sendEmailCard && (
        <SendEmailModal
          card={sendEmailCard}
          onClose={() => setSendEmailCard(null)}
        />
      )}
    </div>
  );
}
