'use client';

import { useState, useEffect } from 'react';
import {
  Plus, X, Mail, Phone, Globe, MapPin, Clock, Package,
  CalendarDays, Pencil, ChevronRight, Truck, Trash2,
} from 'lucide-react';
import { formatDollars, formatDate } from '@/lib/formatting';
// v2.7.40 — route through the shared apiFetch / /api/proxy so the
// session cookie is exchanged for a Bearer token server-side. The
// proxy route handler handles this transparently (/api/proxy/[...path]).
import { apiFetch } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentTerms = 'COD' | 'Net7' | 'Net14' | 'Net30';

interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  paymentTerms: PaymentTerms;
  leadTimeDays: number;
  notes: string;
  productCount: number;
  lastOrderDate: string;
}

interface RecentOrder {
  poNumber: string;
  date: string;
  status: string;
  total: number;
}

interface SupplierProduct {
  name: string;
  sku: string;
  lastCost: number;
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  received: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const PAYMENT_TERMS_OPTIONS: PaymentTerms[] = ['COD', 'Net7', 'Net14', 'Net30'];

// ─── Add/Edit Supplier Modal ──────────────────────────────────────────────────

interface SupplierModalProps {
  existing?: Supplier;
  onClose: () => void;
  onSave: (supplier: Supplier) => void;
}

// v2.7.40 — the inventory service stores `address` as a JSONB object
// (`{raw: "123 King St"}`). Rendering it directly in JSX crashes React
// with "Objects are not valid as a React child" — which is why the
// Supplier edit modal and detail slide-in threw "This page ran into
// an error". Coerce to a string for display/form use.
function addressToString(address: unknown): string {
  if (typeof address === 'string') return address;
  if (address && typeof address === 'object') {
    const obj = address as Record<string, unknown>;
    if (typeof obj.raw === 'string') return obj.raw;
    const parts = [obj.street, obj.suburb, obj.state, obj.postcode]
      .filter((p): p is string => typeof p === 'string' && p.length > 0);
    return parts.join(', ');
  }
  return '';
}

function SupplierModal({ existing, onClose, onSave }: SupplierModalProps) {
  const [form, setForm] = useState<Omit<Supplier, 'id' | 'productCount' | 'lastOrderDate'>>({
    name: existing?.name ?? '',
    contactName: existing?.contactName ?? '',
    email: existing?.email ?? '',
    phone: existing?.phone ?? '',
    website: existing?.website ?? '',
    address: addressToString(existing?.address),
    paymentTerms: existing?.paymentTerms ?? 'Net30',
    leadTimeDays: existing?.leadTimeDays ?? 7,
    notes: existing?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setError('');
    setSaving(true);
    try {
      const path = existing ? `suppliers/${existing.id}` : 'suppliers';
      const method = existing ? 'PATCH' : 'POST';
      const json = await apiFetch<{ data?: Supplier } | Supplier>(path, {
        method,
        body: JSON.stringify(form),
      });
      const saved: Supplier = ('data' in json && json.data) ? json.data : json as Supplier;
      onSave({
        id: saved.id ?? existing?.id ?? `sup-${Date.now()}`,
        name: saved.name ?? form.name,
        contactName: saved.contactName ?? form.contactName,
        email: saved.email ?? form.email,
        phone: saved.phone ?? form.phone,
        website: saved.website ?? form.website,
        address: saved.address ?? form.address,
        paymentTerms: (saved.paymentTerms ?? form.paymentTerms) as PaymentTerms,
        leadTimeDays: saved.leadTimeDays ?? form.leadTimeDays,
        notes: saved.notes ?? form.notes,
        productCount: saved.productCount ?? existing?.productCount ?? 0,
        lastOrderDate: saved.lastOrderDate ?? existing?.lastOrderDate ?? new Date().toISOString().slice(0, 10),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  }

  const isValid = form.name.trim() && form.email.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {existing ? 'Edit Supplier' : 'Add Supplier'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Supplier Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="e.g. Fresh Valley Produce"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Contact Name</label>
              <input
                value={form.contactName}
                onChange={(e) => set('contactName', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="contact@supplier.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="+61 2 xxxx xxxx"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Website</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="https://example.com"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Address</label>
              <input
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="Street, Suburb, State, Postcode"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Payment Terms</label>
              <select
                value={form.paymentTerms}
                onChange={(e) => set('paymentTerms', e.target.value as PaymentTerms)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {PAYMENT_TERMS_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Lead Time (days)</label>
              <input
                type="number"
                min="0"
                value={form.leadTimeDays}
                onChange={(e) => set('leadTimeDays', parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="Delivery schedule, special terms…"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800 space-y-3">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={!isValid || saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {saving ? 'Saving…' : existing ? 'Save Changes' : 'Add Supplier'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Supplier Detail Slide-in ─────────────────────────────────────────────────

type DetailTab = 'info' | 'orders' | 'products';

interface SupplierDetailProps {
  supplier: Supplier;
  onClose: () => void;
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
}

function SupplierDetail({ supplier, onClose, onEdit, onDelete }: SupplierDetailProps) {
  const [tab, setTab] = useState<DetailTab>('info');
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (tab === 'orders' && recentOrders.length === 0) {
      setOrdersLoading(true);
      apiFetch<{ data?: RecentOrder[] } | RecentOrder[]>(`purchase-orders?supplierId=${supplier.id}`)
        .then((json) => setRecentOrders(Array.isArray(json) ? json : (json.data ?? [])))
        .catch(() => setRecentOrders([]))
        .finally(() => setOrdersLoading(false));
    }
    if (tab === 'products' && products.length === 0) {
      setProductsLoading(true);
      apiFetch<{ data?: SupplierProduct[] } | SupplierProduct[]>(`products?supplierId=${supplier.id}`)
        .then((json) => setProducts(Array.isArray(json) ? json : (json.data ?? [])))
        .catch(() => setProducts([]))
        .finally(() => setProductsLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, supplier.id]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-md flex-col bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{supplier.name}</h2>
            <p className="text-sm text-gray-500">{supplier.contactName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(supplier)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
            {confirmDelete ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Delete?</span>
                <button
                  onClick={() => onDelete(supplier)}
                  className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800">
          {(['info', 'orders', 'products'] as DetailTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              {t === 'orders' ? 'Recent Orders' : t === 'products' ? 'Products' : 'Info'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'info' && (
            <dl className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Email</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">{supplier.email}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Phone</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">{supplier.phone || '—'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Globe className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Website</dt>
                  <dd className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                    {supplier.website ? (
                      <a href={supplier.website} target="_blank" rel="noreferrer">{supplier.website}</a>
                    ) : '—'}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Address</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">{addressToString(supplier.address) || '—'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Payment Terms</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">{supplier.paymentTerms}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Lead Time</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">{supplier.leadTimeDays} days</dd>
                </div>
              </div>
              {supplier.notes && (
                <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                  <p className="text-xs font-medium text-gray-500">Notes</p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{supplier.notes}</p>
                </div>
              )}
            </dl>
          )}

          {tab === 'orders' && (
            <div className="space-y-3">
              {ordersLoading && <p className="text-sm text-gray-400">Loading…</p>}
              {!ordersLoading && recentOrders.length === 0 && (
                <p className="text-sm text-gray-400">No orders yet.</p>
              )}
              {recentOrders.map((order) => (
                <div key={order.poNumber} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">{order.poNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[order.status] ?? STATUS_BADGE.draft}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>{formatDate(order.date)}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{formatDollars(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'products' && (
            <div className="space-y-3">
              {productsLoading && <p className="text-sm text-gray-400">Loading…</p>}
              {!productsLoading && products.length === 0 && (
                <p className="text-sm text-gray-400">No products linked.</p>
              )}
              {products.map((product) => (
                <div key={product.sku} className="flex items-center justify-between rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Last Cost</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDollars(product.lastCost)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Supplier Card ────────────────────────────────────────────────────────────

interface SupplierCardProps {
  supplier: Supplier;
  onClick: () => void;
}

function SupplierCard({ supplier, onClick }: SupplierCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{supplier.name}</h3>
          <p className="mt-0.5 text-sm text-gray-500">{supplier.contactName}</p>
        </div>
        <button
          onClick={onClick}
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Mail className="h-3.5 w-3.5 text-gray-400" /> {supplier.email}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Phone className="h-3.5 w-3.5 text-gray-400" /> {supplier.phone}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Clock className="h-3.5 w-3.5 text-gray-400" /> {supplier.leadTimeDays} day lead time
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-gray-100 pt-4 dark:border-gray-800">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Package className="h-3.5 w-3.5" />
          <span>{supplier.productCount} products</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Last order {formatDate(supplier.lastOrderDate)}</span>
        </div>
      </div>

      <div className="mt-3">
        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {supplier.paymentTerms}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SuppliersClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [detailTarget, setDetailTarget] = useState<Supplier | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  async function loadSuppliers() {
    try {
      const json = await apiFetch<{ data?: Supplier[] }>('suppliers');
      setSuppliers(json.data ?? []);
    } catch {
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSuppliers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSaveSupplier(supplier: Supplier) {
    // Optimistically update local state so the UI is instant
    setSuppliers((prev) => {
      const idx = prev.findIndex((s) => s.id === supplier.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = supplier;
        return next;
      }
      return [supplier, ...prev];
    });
    // If we were viewing the edited supplier in the detail panel, update it
    if (detailTarget?.id === supplier.id) setDetailTarget(supplier);
    // Re-fetch to ensure list is in sync with what the server stored
    void loadSuppliers();
  }

  function handleEditFromDetail(supplier: Supplier) {
    setEditTarget(supplier);
    setDetailTarget(null);
  }

  async function handleDeleteSupplier(supplier: Supplier) {
    setDeletingIds((prev) => new Set(prev).add(supplier.id));
    setDetailTarget(null);
    try {
      await apiFetch(`suppliers/${supplier.id}`, { method: 'DELETE' });
      setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id));
    } catch (err) {
      // Re-open the detail panel so the user can retry; show error via alert
      setDetailTarget(supplier);
      // Non-critical: surface the error in the console; a toast would require importing useToast
      console.error('Failed to delete supplier:', err instanceof Error ? err.message : err);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(supplier.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Suppliers</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${suppliers.length} suppliers`}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Add Supplier
        </button>
      </div>

      {/* Cards grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="space-y-3">
                  <div className="h-5 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-1/3 rounded bg-gray-100 dark:bg-gray-800" />
                  <div className="mt-4 space-y-2">
                    <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                </div>
              </div>
            ))
          : suppliers.map((supplier) => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                onClick={() => setDetailTarget(supplier)}
              />
            ))}
        {!isLoading && suppliers.length === 0 && (
          <div className="col-span-3 py-16 text-center text-sm text-gray-400">
            No suppliers yet. Add your first supplier to get started.
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <SupplierModal
          onClose={() => setShowAddModal(false)}
          onSave={handleSaveSupplier}
        />
      )}
      {editTarget && (
        <SupplierModal
          existing={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveSupplier}
        />
      )}
      {detailTarget && (
        <SupplierDetail
          supplier={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={handleEditFromDetail}
          onDelete={(s) => { void handleDeleteSupplier(s); }}
        />
      )}
    </div>
  );
}
