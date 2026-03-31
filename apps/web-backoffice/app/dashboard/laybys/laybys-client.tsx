'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { CalendarCheck, Plus, X, AlertCircle } from 'lucide-react';

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

const MOCK_DATA: Layby[] = [
  { id: 'lb1', agreementNumber: 'LB-2026-0031', customerName: 'Emma Johnson', total: 850, paid: 425, status: 'active', nextPaymentDate: 'Apr 1, 2026', nextPaymentAmount: 213, createdAt: 'Jan 10, 2026', itemsSummary: 'Sony WH-1000XM5 Headphones' },
  { id: 'lb2', agreementNumber: 'LB-2026-0030', customerName: 'Marcus Lee', total: 1200, paid: 400, status: 'active', nextPaymentDate: 'Mar 28, 2026', nextPaymentAmount: 400, createdAt: 'Jan 28, 2026', itemsSummary: 'Dyson V15 Vacuum + Accessories' },
  { id: 'lb3', agreementNumber: 'LB-2026-0028', customerName: 'Sophie Wilson', total: 450, paid: 450, status: 'completed', nextPaymentDate: null, nextPaymentAmount: null, createdAt: 'Dec 1, 2025', itemsSummary: 'KitchenAid Stand Mixer' },
  { id: 'lb4', agreementNumber: 'LB-2026-0025', customerName: 'David Chen', total: 2000, paid: 800, status: 'active', nextPaymentDate: 'Apr 5, 2026', nextPaymentAmount: 400, createdAt: 'Nov 10, 2025', itemsSummary: 'Apple iPad Pro 13", Magic Keyboard' },
  { id: 'lb5', agreementNumber: 'LB-2026-0022', customerName: 'Anika Patel', total: 600, paid: 0, status: 'cancelled', nextPaymentDate: null, nextPaymentAmount: null, createdAt: 'Oct 20, 2025', itemsSummary: 'Espresso Machine DeLonghi La Specialista' },
  { id: 'lb6', agreementNumber: 'LB-2026-0019', customerName: 'James O\'Brien', total: 380, paid: 380, status: 'completed', nextPaymentDate: null, nextPaymentAmount: null, createdAt: 'Sep 14, 2025', itemsSummary: 'Samsung Galaxy Buds Pro × 2' },
  { id: 'lb7', agreementNumber: 'LB-2026-0035', customerName: 'Lily Nguyen', total: 700, paid: 175, status: 'active', nextPaymentDate: 'Mar 25, 2026', nextPaymentAmount: 175, createdAt: 'Feb 25, 2026', itemsSummary: 'GoPro HERO12 + Accessories Bundle' },
];

type FilterTab = 'active' | 'completed' | 'cancelled' | 'all';

const STATUS_STYLES: Record<Layby['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

export default function LaybysClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<Layby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

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
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Lay-by
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
    </div>
  );
}
