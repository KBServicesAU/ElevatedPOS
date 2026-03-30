'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { Gift, Plus, X, AlertCircle } from 'lucide-react';

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

const MOCK_DATA: GiftCard[] = [
  { id: 'gc1', code: 'GIFT-A4B2-C9D1', balance: 50, originalAmount: 50, issuedTo: 'Emma Johnson', issuedDate: 'Mar 1, 2026', expiryDate: 'Mar 1, 2027', status: 'active' },
  { id: 'gc2', code: 'GIFT-E7F3-G8H5', balance: 25, originalAmount: 100, issuedTo: 'Marcus Lee', issuedDate: 'Feb 14, 2026', expiryDate: 'Feb 14, 2027', status: 'active' },
  { id: 'gc3', code: 'GIFT-I2J6-K4L9', balance: 0, originalAmount: 75, issuedTo: 'Sophie Wilson', issuedDate: 'Jan 10, 2026', expiryDate: 'Jan 10, 2027', status: 'depleted' },
  { id: 'gc4', code: 'GIFT-M3N7-O1P8', balance: 200, originalAmount: 200, issuedTo: 'David Chen', issuedDate: 'Mar 5, 2026', expiryDate: null, status: 'active' },
  { id: 'gc5', code: 'GIFT-Q5R2-S6T4', balance: 0, originalAmount: 50, issuedTo: 'Anika Patel', issuedDate: 'Dec 20, 2025', expiryDate: 'Dec 20, 2026', status: 'cancelled' },
  { id: 'gc6', code: 'GIFT-U9V1-W3X7', balance: 150, originalAmount: 150, issuedTo: 'James O\'Brien', issuedDate: 'Feb 28, 2026', expiryDate: 'Feb 28, 2027', status: 'active' },
  { id: 'gc7', code: 'GIFT-Y8Z4-A2B6', balance: 0, originalAmount: 25, issuedTo: 'Lily Nguyen', issuedDate: 'Nov 5, 2025', expiryDate: 'Nov 5, 2026', status: 'depleted' },
];

type FilterTab = 'active' | 'depleted' | 'cancelled' | 'all';

const STATUS_STYLES: Record<GiftCard['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  depleted: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

export default function GiftCardsClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [showModal, setShowModal] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const [form, setForm] = useState({ amount: '', customerName: '', expiryDate: '' });
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<GiftCardsResponse>('gift-cards');
      setItems(res.data ?? MOCK_DATA);
    } catch {
      setItems(MOCK_DATA);
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
      setForm({ amount: '', customerName: '', expiryDate: '' });
      setShowModal(false);
      toast({ title: 'Gift card issued', description: `${newCard.code} — $${Number(form.amount).toFixed(2)} issued to ${form.customerName}.`, variant: 'success' });
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
          className="flex items-center gap-2 rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-500 transition-colors"
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
                ? 'border-nexus-500 text-nexus-600 dark:text-nexus-400'
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
                  const pct = card.originalAmount > 0 ? Math.round((card.balance / card.originalAmount) * 100) : 0;
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
                                onClick={() => handleCancel(card)}
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
                            <button
                              onClick={() => setConfirmCancelId(card.id)}
                              className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            >
                              Cancel
                            </button>
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
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
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
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-nexus-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Customer Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Jane Smith"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-nexus-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Expiry Date <span className="text-gray-400">(optional)</span></label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-nexus-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
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
                onClick={handleIssue}
                disabled={!form.amount || !form.customerName || issuing}
                className="flex items-center gap-2 rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-500 disabled:opacity-50 transition-colors"
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
    </div>
  );
}
