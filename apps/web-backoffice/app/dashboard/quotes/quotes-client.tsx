'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { FileText, Plus, X, AlertCircle, Eye, ArrowRight, Ban, Trash2 } from 'lucide-react';

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'expired' | 'cancelled';

interface QuoteItem {
  productName: string;
  qty: number;
  unitPrice: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  customerName: string;
  status: QuoteStatus;
  items: QuoteItem[];
  discountPct: number;
  total: number;
  validUntil: string;
  notes: string;
  createdAt: string;
}

interface QuotesResponse {
  data: Quote[];
}

const MOCK_DATA: Quote[] = [
  {
    id: 'q1',
    quoteNumber: 'QT-2026-0001',
    customerName: 'Acme Corp',
    status: 'draft',
    items: [
      { productName: 'MacBook Pro 16"', qty: 2, unitPrice: 3499 },
      { productName: 'Magic Mouse', qty: 2, unitPrice: 99 },
    ],
    discountPct: 5,
    total: 6841.1,
    validUntil: 'Apr 15, 2026',
    notes: 'Awaiting final approval from procurement.',
    createdAt: 'Mar 10, 2026',
  },
  {
    id: 'q2',
    quoteNumber: 'QT-2026-0002',
    customerName: 'Blue Ridge Logistics',
    status: 'sent',
    items: [
      { productName: 'Dell UltraSharp 27"', qty: 5, unitPrice: 749 },
      { productName: 'Logitech MX Keys', qty: 5, unitPrice: 119 },
    ],
    discountPct: 10,
    total: 3870,
    validUntil: 'Apr 1, 2026',
    notes: 'Bulk discount applied.',
    createdAt: 'Mar 15, 2026',
  },
  {
    id: 'q3',
    quoteNumber: 'QT-2026-0003',
    customerName: 'Greenleaf Studio',
    status: 'accepted',
    items: [
      { productName: 'iPad Pro 12.9"', qty: 3, unitPrice: 1299 },
      { productName: 'Apple Pencil', qty: 3, unitPrice: 129 },
    ],
    discountPct: 0,
    total: 4284,
    validUntil: 'Apr 10, 2026',
    notes: 'Ready for order conversion.',
    createdAt: 'Mar 5, 2026',
  },
  {
    id: 'q4',
    quoteNumber: 'QT-2026-0004',
    customerName: 'Harrington & Sons',
    status: 'expired',
    items: [
      { productName: 'HP LaserJet Pro', qty: 1, unitPrice: 599 },
    ],
    discountPct: 0,
    total: 599,
    validUntil: 'Feb 28, 2026',
    notes: 'Customer did not respond in time.',
    createdAt: 'Feb 14, 2026',
  },
];

type FilterTab = 'all' | QuoteStatus;

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  expired: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

const emptyItem = (): QuoteItem => ({ productName: '', qty: 1, unitPrice: 0 });

function calcTotal(items: QuoteItem[], discountPct: number): number {
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  return subtotal * (1 - discountPct / 100);
}

export default function QuotesClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    customerName: '',
    lineItems: [emptyItem()],
    discountPct: '',
    validUntil: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<QuotesResponse>('quotes');
      setItems(res.data ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setForm({ customerName: '', lineItems: [emptyItem()], discountPct: '', validUntil: '', notes: '' });
  }

  function updateLineItem(index: number, field: keyof QuoteItem, value: string | number) {
    setForm((prev) => {
      const updated = [...prev.lineItems];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, lineItems: updated };
    });
  }

  function addLineItem() {
    setForm((prev) => ({ ...prev, lineItems: [...prev.lineItems, emptyItem()] }));
  }

  function removeLineItem(index: number) {
    setForm((prev) => ({ ...prev, lineItems: prev.lineItems.filter((_, i) => i !== index) }));
  }

  async function handleSave(status: 'draft' | 'sent') {
    if (!form.customerName) return;
    setSaving(true);
    const discount = Number(form.discountPct) || 0;
    const total = calcTotal(form.lineItems, discount);
    try {
      await apiFetch('quotes', {
        method: 'POST',
        body: JSON.stringify({
          customerName: form.customerName,
          items: form.lineItems,
          discountPct: discount,
          validUntil: form.validUntil,
          notes: form.notes,
          status,
        }),
      });
      const newQuote: Quote = {
        id: `q${Date.now()}`,
        quoteNumber: `QT-2026-${String(items.length + 1).padStart(4, '0')}`,
        customerName: form.customerName,
        status,
        items: form.lineItems,
        discountPct: discount,
        total,
        validUntil: form.validUntil || 'N/A',
        notes: form.notes,
        createdAt: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
      };
      setItems((prev) => [newQuote, ...prev]);
      resetForm();
      setShowModal(false);
      toast({ title: status === 'sent' ? 'Quote sent' : 'Quote saved', description: `Quote for ${form.customerName} has been ${status === 'sent' ? 'sent' : 'saved as draft'}.`, variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to save quote', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleConvert(id: string) {
    setConvertingId(id);
    try {
      await apiFetch(`quotes/${id}/convert`, { method: 'POST' });
      setItems((prev) => prev.map((q) => q.id === id ? { ...q, status: 'accepted' as QuoteStatus } : q));
      toast({ title: 'Quote converted to order', description: 'The quote has been successfully converted.', variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to convert quote', description: msg, variant: 'destructive' });
    } finally {
      setConvertingId(null);
    }
  }

  function handleCancel(id: string) {
    setItems((prev) => prev.map((q) => q.id === id ? { ...q, status: 'cancelled' as QuoteStatus } : q));
  }

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `All (${items.length})` },
    { id: 'draft', label: `Draft (${items.filter((i) => i.status === 'draft').length})` },
    { id: 'sent', label: `Sent (${items.filter((i) => i.status === 'sent').length})` },
    { id: 'accepted', label: `Accepted (${items.filter((i) => i.status === 'accepted').length})` },
    { id: 'expired', label: `Expired (${items.filter((i) => i.status === 'expired').length})` },
  ];

  const filtered = activeTab === 'all' ? items : items.filter((q) => q.status === activeTab);
  const previewTotal = calcTotal(form.lineItems, Number(form.discountPct) || 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Quotes</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Create and manage sales quotes</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Quote
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
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 dark:border-gray-700 dark:bg-gray-800/40">
          <FileText className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No {activeTab !== 'all' ? activeTab : ''} quotes found.</p>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Quote #</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Customer</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Items</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Total</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Valid Until</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-400 dark:text-gray-500">{quote.quoteNumber}</td>
                  <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white">{quote.customerName}</td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[quote.status]}`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{quote.items.length} item{quote.items.length !== 1 ? 's' : ''}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-gray-900 dark:text-white">${quote.total.toFixed(2)}</td>
                  <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{quote.validUntil}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewQuote(quote)}
                        title="View"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {(quote.status === 'sent' || quote.status === 'accepted') && (
                        <button
                          onClick={() => handleConvert(quote.id)}
                          disabled={convertingId === quote.id}
                          title="Convert to Order"
                          className="rounded p-1 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {quote.status !== 'cancelled' && quote.status !== 'expired' && (
                        <button
                          onClick={() => handleCancel(quote.id)}
                          title="Cancel"
                          className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Quote Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">New Quote</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              {/* Customer */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Customer Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Items</label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="flex items-center gap-1 text-xs text-elevatedpos-600 hover:text-elevatedpos-500 dark:text-elevatedpos-400"
                  >
                    <Plus className="h-3 w-3" /> Add Row
                  </button>
                </div>
                <div className="space-y-2">
                  {form.lineItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Product name"
                        value={item.productName}
                        onChange={(e) => updateLineItem(idx, 'productName', e.target.value)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.qty}
                        onChange={(e) => updateLineItem(idx, 'qty', Number(e.target.value))}
                        className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit $"
                        value={item.unitPrice || ''}
                        onChange={(e) => updateLineItem(idx, 'unitPrice', Number(e.target.value))}
                        className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      />
                      {form.lineItems.length > 1 && (
                        <button onClick={() => removeLineItem(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Discount %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={form.discountPct}
                    onChange={(e) => setForm({ ...form, discountPct: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Valid Until</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Notes</label>
                <textarea
                  rows={3}
                  placeholder="Optional notes for the customer..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 resize-none"
                />
              </div>

              {/* Preview Total */}
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Estimated Total{Number(form.discountPct) > 0 ? ` (${form.discountPct}% off)` : ''}</span>
                <span className="text-base font-bold text-gray-900 dark:text-white">${previewTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSave('draft')}
                disabled={!form.customerName || saving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSave('sent')}
                disabled={!form.customerName || saving}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Send to Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Quote Modal */}
      {viewQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{viewQuote.quoteNumber}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{viewQuote.customerName}</p>
              </div>
              <button onClick={() => setViewQuote(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[viewQuote.status]}`}>
                  {viewQuote.status}
                </span>
                <span className="text-xs text-gray-400">Valid until {viewQuote.validUntil}</span>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Line Items</p>
                <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        <th className="px-4 py-2 text-left text-xs text-gray-400">Product</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-400">Qty</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-400">Unit</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-400">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {viewQuote.items.map((it, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{it.productName}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">{it.qty}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">${it.unitPrice.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-900 dark:text-white">${(it.qty * it.unitPrice).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {viewQuote.discountPct > 0 && (
                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                  <span>Discount ({viewQuote.discountPct}%)</span>
                  <span className="text-red-500">-${(viewQuote.items.reduce((s, it) => s + it.qty * it.unitPrice, 0) * viewQuote.discountPct / 100).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-3">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total</span>
                <span className="text-base font-bold text-gray-900 dark:text-white">${viewQuote.total.toFixed(2)}</span>
              </div>

              {viewQuote.notes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewQuote.notes}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <button
                onClick={() => setViewQuote(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
              {(viewQuote.status === 'sent' || viewQuote.status === 'accepted') && (
                <button
                  onClick={() => { handleConvert(viewQuote.id); setViewQuote(null); }}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
                >
                  <ArrowRight className="h-4 w-4" />
                  Convert to Order
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
