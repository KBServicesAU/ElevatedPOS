'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/lib/use-toast';

interface Invoice {
  id: string;
  stripeInvoiceId: string;
  stripeCustomerId: string;
  customerName?: string;
  customer?: { name?: string };
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  dueDate?: string;
  invoiceUrl?: string;
  invoicePdf?: string;
  createdAt: string;
}

interface InvoiceItem {
  description: string;
  amount: string;
  quantity: string;
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  uncollectible: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  void: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
};

function formatPrice(cents: number, currency = 'aud'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default function InvoicesPage() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [memo, setMemo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', amount: '', quantity: '1' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { orgId?: string } | null) => {
        const id = me?.orgId ?? null;
        setOrgId(id);
        if (!id) { setLoading(false); return; }
        return fetch(`/api/proxy/integrations/api/v1/connect/invoices/${id}`)
          .then((r) => r.json())
          .then((data: { invoices: Invoice[] }) => setInvoices(data.invoices ?? []))
          .catch(() => {
            setInvoices([]);
            toast({ title: 'Error', description: 'Failed to load invoices. Please try refreshing the page.', variant: 'destructive' });
          })
          .finally(() => setLoading(false));
      })
      .catch(() => { setOrgId(null); setLoading(false); });
  }, []);

  function addItem() {
    setItems((prev) => [...prev, { description: '', amount: '', quantity: '1' }]);
  }

  function updateItem(i: number, field: keyof InvoiceItem, value: string) {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const total = items.reduce((sum, item) => {
    const amount = parseFloat(item.amount) || 0;
    const qty = parseInt(item.quantity) || 1;
    return sum + amount * qty * 100;
  }, 0);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/proxy/integrations/api/v1/connect/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          customerEmail,
          customerName,
          items: items.map((item) => ({
            description: item.description,
            amount: Math.round(parseFloat(item.amount) * 100),
            quantity: parseInt(item.quantity) || 1,
          })),
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          memo: memo || undefined,
          autoSend,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to create invoice');
      }
      const newInv = (await res.json()) as Invoice;
      setInvoices((prev) => [newInv, ...prev]);
      setShowNew(false);
      setCustomerEmail('');
      setCustomerName('');
      setMemo('');
      setDueDate('');
      setItems([{ description: '', amount: '', quantity: '1' }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(invoiceId: string) {
    setSending(invoiceId);
    try {
      const res = await fetch(`/api/proxy/integrations/api/v1/connect/invoices/${invoiceId}/send`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.stripeInvoiceId === invoiceId ? { ...inv, status: 'open' } : inv
        )
      );
      toast({ title: 'Invoice sent', description: 'The invoice has been sent to the customer.', variant: 'default' });
    } catch (err) {
      toast({
        title: 'Failed to send invoice',
        description: err instanceof Error ? err.message : 'Could not send invoice.',
        variant: 'destructive',
      });
    } finally {
      setSending(null);
    }
  }

  async function handleDownloadPdf(inv: Invoice) {
    setDownloadingPdf(inv.id);
    try {
      // If the invoice already has a direct PDF URL, open it
      if (inv.invoicePdf) {
        window.open(inv.invoicePdf, '_blank');
        return;
      }
      const res = await fetch(`/api/proxy/integrations/api/v1/connect/invoices/${inv.id}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${inv.stripeInvoiceId ?? inv.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: 'Failed to download PDF',
        description: err instanceof Error ? err.message : 'Could not download invoice PDF.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingPdf(null);
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 mt-1">Create and send invoices to your customers.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + New Invoice
        </button>
      </div>

      {/* New invoice modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 my-4">
            <h2 className="text-lg font-bold mb-4">Create Invoice</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer email
                  </label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer name
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Line items */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Items</label>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        required
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(i, 'description', e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        placeholder="Price"
                        value={item.amount}
                        onChange={(e) => updateItem(i, 'amount', e.target.value)}
                        className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="number"
                        required
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                        className="w-16 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Add item
                </button>
                <div className="mt-3 text-right text-sm font-semibold text-gray-700">
                  Total: {formatPrice(total)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Memo</label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="Optional note"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSend}
                  onChange={(e) => setAutoSend(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Send invoice immediately via email</span>
              </label>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Creating...' : autoSend ? 'Create & Send' : 'Create Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <div className="text-4xl mb-3">🧾</div>
          <h3 className="font-semibold text-lg mb-1">No invoices yet</h3>
          <p className="text-gray-500 text-sm mb-4">
            Create your first invoice to bill a customer.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
          >
            + New Invoice
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Due</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {inv.customerName ?? inv.customer?.name ?? (
                      <span className="font-mono text-xs text-gray-400">
                        {inv.stripeCustomerId ? `…${inv.stripeCustomerId.slice(-8)}` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {formatPrice(inv.amountDue, inv.currency)}
                    {inv.amountPaid > 0 && inv.amountPaid < inv.amountDue && (
                      <span className="text-xs text-gray-400 ml-1">
                        ({formatPrice(inv.amountPaid, inv.currency)} paid)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {inv.dueDate
                      ? new Date(inv.dueDate).toLocaleDateString('en-AU')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {inv.invoiceUrl && (
                        <a
                          href={inv.invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          View ↗
                        </a>
                      )}
                      <button
                        onClick={() => { void handleDownloadPdf(inv); }}
                        disabled={downloadingPdf === inv.id}
                        className="text-xs text-gray-500 hover:text-gray-800 font-medium disabled:opacity-50"
                        title="Download PDF"
                      >
                        {downloadingPdf === inv.id ? 'Downloading…' : 'PDF ↓'}
                      </button>
                      {inv.status === 'draft' && (
                        <button
                          onClick={() => { void handleSend(inv.stripeInvoiceId); }}
                          disabled={sending === inv.stripeInvoiceId}
                          className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                        >
                          {sending === inv.stripeInvoiceId ? 'Sending...' : 'Send'}
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
    </div>
  );
}
