'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { FileText, Plus, X, Eye, Send, CheckCircle, Ban, Trash2, Loader2, ExternalLink, Search } from 'lucide-react';

// v2.7.51 — minimal product shape for the "add from catalog" picker.
// The catalog service returns a much richer object; we only consume the
// fields we surface in the invoice line item.
interface CatalogProduct {
  id: string;
  name: string;
  sku?: string | null;
  price: number | string;
}

// ── Types matching the stripeInvoices DB row ──────────────────────────────────

/**
 * Status values stored in our DB (Stripe-native) mapped to display labels.
 * Stripe:  draft | open | paid | uncollectible | void
 * Display: Draft | Sent  | Paid | Cancelled     | Cancelled
 */
type StripeInvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
type DisplayStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

interface InvoiceMetadata {
  customerName?: string | null;
  customerEmail?: string | null;
  memo?: string | null;
}

interface StripeInvoiceRow {
  id: string;               // UUID in our DB
  stripeInvoiceId: string;  // 'in_xxx'
  stripeCustomerId: string;
  status: StripeInvoiceStatus;
  amountDue: number;        // cents
  amountPaid: number;       // cents
  currency: string;
  dueDate: string | null;   // ISO date string or null
  invoiceUrl: string | null;
  invoicePdf: string | null;
  metadata: InvoiceMetadata;
  createdAt: string;
}

interface InvoiceItem {
  productName: string;
  qty: number;
  unitPrice: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDisplayStatus(stripe: StripeInvoiceStatus): DisplayStatus {
  if (stripe === 'open') return 'sent';
  if (stripe === 'void' || stripe === 'uncollectible') return 'cancelled';
  return stripe as DisplayStatus;
}

function fmtAmount(cents: number, currency = 'AUD') {
  return (cents / 100).toLocaleString('en-AU', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function calcTotals(items: InvoiceItem[], taxRate: number) {
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const tax = subtotal * (taxRate / 100);
  return { subtotal, tax, total: subtotal + tax };
}

const emptyItem = (): InvoiceItem => ({ productName: '', qty: 1, unitPrice: 0 });

// ── Status styles ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<DisplayStatus, string> = {
  draft:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sent:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  paid:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoicesClient() {
  const { toast } = useToast();

  const [orgId, setOrgId]           = useState<string | null>(null);
  const [invoices, setInvoices]     = useState<StripeInvoiceRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<DisplayStatus | 'all'>('all');
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [viewInvoice, setViewInvoice] = useState<StripeInvoiceRow | null>(null);
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

  // v2.7.51 — catalog picker state. When the merchant clicks "Add from
  // Catalog" in the invoice form, we open a modal with a searchable list
  // of products. Selecting one populates the chosen line-item row with
  // name, sku and unit price.
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogPickerForRow, setCatalogPickerForRow] = useState<number | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // ── Fetch org identity on mount ───────────────────────────────────────────

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { orgId?: string } | null) => { setOrgId(me?.orgId ?? null); })
      .catch(() => setOrgId(null));
  }, []);

  // ── Load invoices whenever orgId is known ─────────────────────────────────

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ invoices: StripeInvoiceRow[] }>(`connect/invoices/${id}`);
      setInvoices(res.invoices ?? []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orgId) void load(orgId);
    else setLoading(false);
  }, [orgId, load]);

  // ── Form helpers ──────────────────────────────────────────────────────────

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

  // v2.7.51 — catalog picker helpers.
  function openCatalogPickerFor(rowIndex: number) {
    setCatalogPickerForRow(rowIndex);
    setCatalogPickerOpen(true);
    setCatalogSearch('');
    setCatalogResults([]);
  }

  function selectCatalogProduct(p: CatalogProduct) {
    if (catalogPickerForRow == null) return;
    const price = typeof p.price === 'string' ? Number(p.price) : p.price;
    const labeledName = p.sku ? `${p.name} (${p.sku})` : p.name;
    setForm((prev) => {
      const updated = [...prev.lineItems];
      updated[catalogPickerForRow] = {
        productName: labeledName,
        qty: prev.lineItems[catalogPickerForRow]?.qty || 1,
        unitPrice: Number.isFinite(price) ? price : 0,
      };
      return { ...prev, lineItems: updated };
    });
    setCatalogPickerOpen(false);
    setCatalogPickerForRow(null);
  }

  // Debounced catalog search — fires while the picker is open.
  useEffect(() => {
    if (!catalogPickerOpen) return;
    const term = catalogSearch.trim();
    setCatalogLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const qs = new URLSearchParams();
          if (term) qs.set('search', term);
          qs.set('limit', '20');
          qs.set('isActive', 'true');
          const res = await apiFetch<{ data: CatalogProduct[] }>(`products?${qs.toString()}`);
          setCatalogResults(Array.isArray(res?.data) ? res.data : []);
        } catch {
          setCatalogResults([]);
        } finally {
          setCatalogLoading(false);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [catalogSearch, catalogPickerOpen]);

  // ── Create invoice ────────────────────────────────────────────────────────
  //
  // v2.7.51 — same class of bug as v2.7.42 (silent send-success but no email
  // delivered). When autoSend=true, the integrations service creates the
  // Stripe invoice and calls Stripe's sendInvoice — but Stripe-hosted email
  // silently fails for sandbox/unfinished Connect accounts. The reliable
  // path is the notifications-service /send-email endpoint (which uses
  // template:'custom' with our branded HTML, fixed in v2.7.40). After a
  // successful create we now ALSO call /send-email so the customer
  // actually receives an email regardless of the Stripe Connect state.
  //
  // We also force a fresh reload (with loading=true) — previously a stale
  // render could briefly show the list as empty ("All (0)") between the
  // toast and the list refresh, leading users to think the invoice
  // disappeared.

  interface CreateInvoiceResponse {
    invoiceId?: string;
    status?: string;
    amountDue?: number;
    invoiceUrl?: string | null;
    invoicePdf?: string | null;
  }

  async function handleSave(autoSend: boolean) {
    if (!form.customerName) return;
    setSaving(true);
    try {
      // Map frontend line items to the Stripe invoice items format.
      // `amount` is in cents (unitPrice is in dollars).
      const created = await apiFetch<CreateInvoiceResponse>('connect/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerName: form.customerName,
          customerEmail: form.customerEmail || undefined,
          items: form.lineItems.map((it) => ({
            description: it.productName,
            amount: Math.round(it.unitPrice * 100), // cents
            quantity: it.qty,
          })),
          dueDate: form.dueDate || undefined,
          memo: form.notes || undefined,
          autoSend,
        }),
      });

      // When autoSend=true, ALSO trigger the branded notifications-service
      // email. Stripe's hosted send is unreliable on sandbox/Connect — the
      // notifications path is what actually lands in the customer's inbox.
      if (autoSend && created?.invoiceId && form.customerEmail) {
        try {
          await apiFetch(`connect/invoices/${created.invoiceId}/send-email`, { method: 'POST' });
        } catch (sendErr) {
          // Non-fatal: the invoice itself was created and Stripe was asked
          // to send. Surface a softer warning so the merchant knows the
          // branded email failed but the invoice is still queryable.
          const msg = sendErr instanceof Error ? sendErr.message : 'Branded email failed';
          console.warn('[invoices] /send-email failed after create', sendErr);
          toast({
            title: 'Invoice created, but email send failed',
            description: msg,
            variant: 'destructive',
          });
          resetForm();
          setShowModal(false);
          if (orgId) {
            setLoading(true);
            await load(orgId);
          }
          return;
        }
      }

      toast({
        title: autoSend ? 'Invoice sent' : 'Invoice saved as draft',
        description: `Invoice for ${form.customerName} has been ${autoSend ? 'sent to ' + (form.customerEmail || 'customer') : 'saved'}.`,
        variant: 'success',
      });

      resetForm();
      setShowModal(false);

      // Force a clean reload so the new row shows up immediately.
      // Without setLoading(true) we briefly render the (now-stale)
      // previous list, which made users think the invoice vanished.
      if (orgId) {
        setLoading(true);
        await load(orgId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save invoice';
      toast({ title: 'Failed to save invoice', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // ── Invoice actions ───────────────────────────────────────────────────────

  async function handleSend(stripeInvoiceId: string) {
    setUpdatingId(stripeInvoiceId);
    try {
      // v2.7.40 — previously only called /connect/invoices/:id/send which
      // asks Stripe to email the hosted invoice. That flow silently fails
      // when the Connect account isn't fully onboarded. We now also trigger
      // /send-email which sends a branded ElevatedPOS email via our
      // notifications service, so the customer always receives something.
      try {
        await apiFetch(`connect/invoices/${stripeInvoiceId}/send`, { method: 'POST' });
      } catch (stripeErr) {
        // Stripe send may fail on sandbox / unfinished Connect — that's OK,
        // the notifications-service path below is our reliable fallback.
        console.warn('[invoices] Stripe send failed, falling back to notifications email', stripeErr);
      }
      await apiFetch(`connect/invoices/${stripeInvoiceId}/send-email`, { method: 'POST' });
      toast({ title: 'Invoice sent', variant: 'success' });
      if (orgId) await load(orgId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send';
      toast({ title: 'Failed to send invoice', description: msg, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleMarkPaid(stripeInvoiceId: string) {
    setUpdatingId(stripeInvoiceId);
    try {
      await apiFetch(`connect/invoices/${stripeInvoiceId}/mark-paid`, { method: 'POST' });
      toast({ title: 'Invoice marked as paid', variant: 'success' });
      if (orgId) await load(orgId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to mark paid';
      toast({ title: 'Failed to update invoice', description: msg, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleVoid(stripeInvoiceId: string) {
    setUpdatingId(stripeInvoiceId);
    try {
      await apiFetch(`connect/invoices/${stripeInvoiceId}/void`, { method: 'POST' });
      toast({ title: 'Invoice voided', variant: 'success' });
      if (orgId) await load(orgId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to void';
      toast({ title: 'Failed to void invoice', description: msg, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const TABS: { id: DisplayStatus | 'all'; label: string }[] = [
    { id: 'all',       label: `All (${invoices.length})` },
    { id: 'draft',     label: `Draft (${invoices.filter((i) => i.status === 'draft').length})` },
    { id: 'sent',      label: `Sent (${invoices.filter((i) => i.status === 'open').length})` },
    { id: 'paid',      label: `Paid (${invoices.filter((i) => i.status === 'paid').length})` },
    { id: 'cancelled', label: `Voided (${invoices.filter((i) => i.status === 'void' || i.status === 'uncollectible').length})` },
  ];

  const filtered = activeTab === 'all'
    ? invoices
    : activeTab === 'sent'
      ? invoices.filter((i) => i.status === 'open')
      : activeTab === 'cancelled'
        ? invoices.filter((i) => i.status === 'void' || i.status === 'uncollectible')
        : invoices.filter((i) => i.status === activeTab);

  const previewTotals = calcTotals(form.lineItems, Number(form.taxRate) || 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Invoices</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Create and send Stripe invoices to your customers</p>
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

      {/* No account prompt */}
      {!loading && !orgId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 dark:border-gray-700 dark:bg-gray-800/40">
          <FileText className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Could not load your account. Please refresh.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && orgId && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 dark:border-gray-700 dark:bg-gray-800/40">
          <FileText className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No {activeTab !== 'all' ? activeTab : ''} invoices found.</p>
        </div>
      )}

      {/* Table */}
      {!loading && orgId && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Invoice</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Customer</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Amount</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Due Date</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((inv) => {
                const displayStatus = toDisplayStatus(inv.status);
                const isUpdating = updatingId === inv.stripeInvoiceId;
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-400 dark:text-gray-500">
                      {inv.stripeInvoiceId}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {inv.metadata?.customerName || inv.stripeCustomerId}
                      </p>
                      {inv.metadata?.customerEmail && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">{inv.metadata.customerEmail}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[displayStatus]}`}>
                        {displayStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium text-gray-900 dark:text-white">
                      {fmtAmount(inv.amountDue, inv.currency)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{fmtDate(inv.dueDate)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {/* View / open in Stripe */}
                        <button
                          onClick={() => setViewInvoice(inv)}
                          title="View details"
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {inv.invoiceUrl && (
                          <a
                            href={inv.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open invoice in Stripe"
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {/* Send (draft only) */}
                        {inv.status === 'draft' && (
                          <button
                            onClick={() => void handleSend(inv.stripeInvoiceId)}
                            disabled={isUpdating}
                            title="Send Invoice"
                            className="rounded p-1 text-blue-500 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                          >
                            {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {/* Mark paid (open only) */}
                        {inv.status === 'open' && (
                          <button
                            onClick={() => void handleMarkPaid(inv.stripeInvoiceId)}
                            disabled={isUpdating}
                            title="Mark as Paid (offline)"
                            className="rounded p-1 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                          >
                            {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {/* Void (draft or open only) */}
                        {(inv.status === 'draft' || inv.status === 'open') && (
                          <button
                            onClick={() => void handleVoid(inv.stripeInvoiceId)}
                            disabled={isUpdating}
                            title="Void Invoice"
                            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        // Append a fresh row, then immediately open the catalog picker for it.
                        const nextIndex = form.lineItems.length;
                        setForm((prev) => ({ ...prev, lineItems: [...prev.lineItems, emptyItem()] }));
                        openCatalogPickerFor(nextIndex);
                      }}
                      className="flex items-center gap-1 text-xs text-elevatedpos-600 hover:text-elevatedpos-500 dark:text-elevatedpos-400"
                    >
                      <Search className="h-3 w-3" /> Add from Catalog
                    </button>
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      <Plus className="h-3 w-3" /> Add Row
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {form.lineItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Product / service name"
                        value={item.productName}
                        onChange={(e) => updateLineItem(idx, 'productName', e.target.value)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => openCatalogPickerFor(idx)}
                        title="Pick a product from your catalog"
                        className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-elevatedpos-600 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-elevatedpos-400 transition-colors"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                      <input
                        type="number" min="1" placeholder="Qty"
                        value={item.qty}
                        onChange={(e) => updateLineItem(idx, 'qty', Number(e.target.value))}
                        className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      />
                      <input
                        type="number" min="0" step="0.01" placeholder="Unit $"
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
                    type="number" min="0" max="100" placeholder="10 (GST)"
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
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Notes / Memo</label>
                <textarea
                  rows={3}
                  placeholder="Optional notes visible on the invoice…"
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
                onClick={() => { void handleSave(false); }}
                disabled={!form.customerName || saving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                Save as Draft
              </button>
              <button
                onClick={() => { void handleSave(true); }}
                disabled={!form.customerName || !form.customerEmail || saving}
                title={!form.customerEmail ? 'Email required to send' : undefined}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="h-4 w-4 text-elevatedpos-600" />
                Invoice Details
              </h2>
              <button onClick={() => setViewInvoice(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Stripe ID</p>
                  <p className="font-mono text-gray-700 dark:text-gray-300 text-xs">{viewInvoice.stripeInvoiceId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Status</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[toDisplayStatus(viewInvoice.status)]}`}>
                    {toDisplayStatus(viewInvoice.status)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Customer</p>
                  <p className="font-medium text-gray-900 dark:text-white">{viewInvoice.metadata?.customerName || '—'}</p>
                  {viewInvoice.metadata?.customerEmail && (
                    <p className="text-xs text-gray-500">{viewInvoice.metadata.customerEmail}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Amount Due</p>
                  <p className="font-bold text-gray-900 dark:text-white">{fmtAmount(viewInvoice.amountDue, viewInvoice.currency)}</p>
                  {viewInvoice.amountPaid > 0 && (
                    <p className="text-xs text-emerald-600">Paid: {fmtAmount(viewInvoice.amountPaid, viewInvoice.currency)}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Due Date</p>
                  <p className="text-gray-700 dark:text-gray-300">{fmtDate(viewInvoice.dueDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Created</p>
                  <p className="text-gray-700 dark:text-gray-300">{fmtDate(viewInvoice.createdAt)}</p>
                </div>
              </div>

              {viewInvoice.metadata?.memo && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewInvoice.metadata.memo}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {viewInvoice.invoiceUrl && (
                  <a
                    href={viewInvoice.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View Invoice
                  </a>
                )}
                {viewInvoice.invoicePdf && (
                  <a
                    href={viewInvoice.invoicePdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5" /> Download PDF
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v2.7.51 — Catalog product picker for invoice line items */}
      {catalogPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Search className="h-4 w-4 text-elevatedpos-600" />
                Add Product from Catalog
              </h2>
              <button
                onClick={() => { setCatalogPickerOpen(false); setCatalogPickerForRow(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search products by name or SKU…"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {catalogLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                  ))}
                </div>
              )}
              {!catalogLoading && catalogResults.length === 0 && (
                <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  {catalogSearch.trim() ? 'No products match that search.' : 'Type to search or browse below…'}
                </p>
              )}
              {!catalogLoading && catalogResults.length > 0 && (
                <ul className="space-y-1.5">
                  {catalogResults.map((p) => {
                    const price = typeof p.price === 'string' ? Number(p.price) : p.price;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => selectCatalogProduct(p)}
                          className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:border-elevatedpos-500 hover:bg-elevatedpos-50/40 dark:border-gray-700 dark:hover:border-elevatedpos-400 dark:hover:bg-elevatedpos-900/10 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                            {p.sku && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">SKU: {p.sku}</p>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap ml-3">
                            {Number.isFinite(price)
                              ? price.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
                              : '$0.00'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <button
                onClick={() => { setCatalogPickerOpen(false); setCatalogPickerForRow(null); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
