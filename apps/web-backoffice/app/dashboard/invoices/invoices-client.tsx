'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { FileText, Plus, X, Eye, Send, CheckCircle, Ban, Trash2, Loader2 } from 'lucide-react';

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

interface InvoiceItem {
  productName: string;
  qty: number;
  unitPrice: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  dueDate: string;
  notes: string;
  createdAt: string;
}

interface InvoicesResponse {
  data: Invoice[];
}

type FilterTab = 'all' | InvoiceStatus;

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  overdue: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

const emptyItem = (): InvoiceItem => ({ productName: '', qty: 1, unitPrice: 0 });

function calcTotals(items: InvoiceItem[], taxRate: number): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const tax = subtotal * (taxRate / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export default function InvoicesClient() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    lineItems: [emptyItem()],
    taxRate: '',
    dueDate: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<InvoicesResponse>('invoices');
      setInvoices(res.data ?? []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setForm({ customerName: '', customerEmail: '', customerPhone: '', lineItems: [emptyItem()], taxRate: '', dueDate: '', notes: '' });
  }

  function updateLineItem(index: number, field: keyof InvoiceItem, value: string | number) {
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
    const taxRate = Number(form.taxRate) || 0;
    const { subtotal, tax, total } = calcTotals(form.lineItems, taxRate);
    try {
      await apiFetch('invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerName: form.customerName,
          customerEmail: form.customerEmail || undefined,
          customerPhone: form.customerPhone || undefined,
          items: form.lineItems,
          taxRate,
          dueDate: form.dueDate,
          notes: form.notes,
          status,
        }),
      });
      const newInvoice: Invoice = {
        id: `inv${Date.now()}`,
        invoiceNumber: `INV-2026-${String(invoices.length + 1).padStart(4, '0')}`,
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        status,
        items: form.lineItems,
        subtotal,
        tax,
        total,
        dueDate: form.dueDate || 'N/A',
        notes: form.notes,
        createdAt: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
      };
      setInvoices((prev) => [newInvoice, ...prev]);
      resetForm();
      setShowModal(false);
      toast({
        title: status === 'sent' ? 'Invoice sent' : 'Invoice saved',
        description: `Invoice for ${form.customerName} has been ${status === 'sent' ? 'sent' : 'saved as draft'}.`,
        variant: 'success',
      });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to save invoice', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStatus(id: string, status: InvoiceStatus) {
    setUpdatingId(id);
    try {
      await apiFetch(`invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setInvoices((prev) => prev.map((inv) => inv.id === id ? { ...inv, status } : inv));
      const labels: Record<InvoiceStatus, string> = {
        draft: 'Draft',
        sent: 'Sent',
        paid: 'Paid',
        overdue: 'Overdue',
        cancelled: 'Cancelled',
      };
      toast({ title: `Invoice marked as ${labels[status]}`, variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to update invoice', description: msg, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  }

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `All (${invoices.length})` },
    { id: 'draft', label: `Draft (${invoices.filter((i) => i.status === 'draft').length})` },
    { id: 'sent', label: `Sent (${invoices.filter((i) => i.status === 'sent').length})` },
    { id: 'paid', label: `Paid (${invoices.filter((i) => i.status === 'paid').length})` },
    { id: 'overdue', label: `Overdue (${invoices.filter((i) => i.status === 'overdue').length})` },
  ];

  const filtered = activeTab === 'all' ? invoices : invoices.filter((inv) => inv.status === activeTab);
  const previewTotals = calcTotals(form.lineItems, Number(form.taxRate) || 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Invoices</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Create and manage customer invoices</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Invoice
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
          <p className="text-sm text-gray-500 dark:text-gray-400">No {activeTab !== 'all' ? activeTab : ''} invoices found.</p>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Invoice #</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Customer</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Total</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Due Date</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-400 dark:text-gray-500">{inv.invoiceNumber}</td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900 dark:text-white">{inv.customerName}</p>
                    {inv.customerEmail && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">{inv.customerEmail}</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-medium text-gray-900 dark:text-white">${inv.total.toFixed(2)}</td>
                  <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{inv.dueDate}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewInvoice(inv)}
                        title="View"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {inv.status === 'draft' && (
                        <button
                          onClick={() => { void handleUpdateStatus(inv.id, 'sent'); }}
                          disabled={updatingId === inv.id}
                          title="Send Invoice"
                          className="rounded p-1 text-blue-500 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                        >
                          {updatingId === inv.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                      {(inv.status === 'sent' || inv.status === 'overdue') && (
                        <button
                          onClick={() => { void handleUpdateStatus(inv.id, 'paid'); }}
                          disabled={updatingId === inv.id}
                          title="Mark as Paid"
                          className="rounded p-1 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                        >
                          {updatingId === inv.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                      {inv.status !== 'cancelled' && inv.status !== 'paid' && (
                        <button
                          onClick={() => { void handleUpdateStatus(inv.id, 'cancelled'); }}
                          disabled={updatingId === inv.id}
                          title="Cancel"
                          className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
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

      {/* New Invoice Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">New Invoice</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              {/* Customer Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Customer Email</label>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    value={form.customerEmail}
                    onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Customer Phone</label>
                  <input
                    type="tel"
                    placeholder="+61 4xx xxx xxx"
                    value={form.customerPhone}
                    onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                </div>
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
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tax Rate %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={form.taxRate}
                    onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
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

              {/* Preview Totals */}
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>${previewTotals.subtotal.toFixed(2)}</span>
                </div>
                {Number(form.taxRate) > 0 && (
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Tax ({form.taxRate}%)</span>
                    <span>${previewTotals.tax.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total</span>
                  <span className="text-base font-bold text-gray-900 dark:text-white">${previewTotals.total.toFixed(2)}</span>
                </div>
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
                onClick={() => { void handleSave('draft'); }}
                disabled={!form.customerName || saving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                Save as Draft
              </button>
              <button
                onClick={() => { void handleSave('sent'); }}
                disabled={!form.customerName || saving}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Invoice Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{viewInvoice.invoiceNumber}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{viewInvoice.customerName}</p>
              </div>
              <button onClick={() => setViewInvoice(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[viewInvoice.status]}`}>
                  {viewInvoice.status}
                </span>
                {viewInvoice.dueDate && viewInvoice.dueDate !== 'N/A' && (
                  <span className="text-xs text-gray-400">Due {viewInvoice.dueDate}</span>
                )}
              </div>

              {viewInvoice.customerEmail && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{viewInvoice.customerEmail}</p>
              )}

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
                      {viewInvoice.items.map((it, i) => (
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

              <div className="space-y-1.5">
                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>${viewInvoice.subtotal.toFixed(2)}</span>
                </div>
                {viewInvoice.tax > 0 && (
                  <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Tax</span>
                    <span>${viewInvoice.tax.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-2">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total</span>
                  <span className="text-base font-bold text-gray-900 dark:text-white">${viewInvoice.total.toFixed(2)}</span>
                </div>
              </div>

              {viewInvoice.notes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewInvoice.notes}</p>
                </div>
              )}

              <div className="text-xs text-gray-400 dark:text-gray-500">Created {viewInvoice.createdAt}</div>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <button
                onClick={() => setViewInvoice(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
              {viewInvoice.status === 'draft' && (
                <button
                  onClick={() => { void handleUpdateStatus(viewInvoice.id, 'sent'); setViewInvoice(null); }}
                  disabled={updatingId === viewInvoice.id}
                  className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
                >
                  {updatingId === viewInvoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Invoice
                </button>
              )}
              {(viewInvoice.status === 'sent' || viewInvoice.status === 'overdue') && (
                <button
                  onClick={() => { void handleUpdateStatus(viewInvoice.id, 'paid'); setViewInvoice(null); }}
                  disabled={updatingId === viewInvoice.id}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  {updatingId === viewInvoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Mark as Paid
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
