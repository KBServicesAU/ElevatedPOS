'use client';

import { useState, useEffect } from 'react';
import {
  Plus, X, Mail, Phone, Globe, MapPin, Clock, Package,
  CalendarDays, Pencil, ChevronRight, Truck,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/formatting';

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

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-1',
    name: 'Fresh Valley Produce',
    contactName: 'Rachel Kim',
    email: 'rachel@freshvalley.com.au',
    phone: '+61 2 9345 6789',
    website: 'https://freshvalley.com.au',
    address: '45 Farm Road, Penrith NSW 2750',
    paymentTerms: 'Net14',
    leadTimeDays: 2,
    notes: 'Preferred produce supplier. Delivers Mon/Wed/Fri.',
    productCount: 18,
    lastOrderDate: '2024-03-11',
  },
  {
    id: 'sup-2',
    name: 'Metro Wholesale Foods',
    contactName: 'David Chen',
    email: 'david.chen@metrowholesale.com',
    phone: '+61 2 8765 4321',
    website: 'https://metrowholesale.com',
    address: '12 Industrial Ave, Silverwater NSW 2128',
    paymentTerms: 'Net30',
    leadTimeDays: 5,
    notes: 'Large range of dry goods and pantry staples.',
    productCount: 54,
    lastOrderDate: '2024-03-12',
  },
  {
    id: 'sup-3',
    name: 'Pacific Beverages Co.',
    contactName: 'Sophie Martin',
    email: 'sophie@pacificbev.com.au',
    phone: '+61 2 7890 1234',
    website: 'https://pacificbev.com.au',
    address: '88 Waterfront Dr, Pyrmont NSW 2009',
    paymentTerms: 'COD',
    leadTimeDays: 3,
    notes: 'Specialises in premium beverages and water.',
    productCount: 12,
    lastOrderDate: '2024-03-14',
  },
];

const RECENT_ORDERS_MAP: Record<string, RecentOrder[]> = {
  'sup-1': [
    { poNumber: 'PO-2024-0041', date: '2024-03-06', status: 'received', total: 14700 },
    { poNumber: 'PO-2024-0043', date: '2024-03-11', status: 'partial', total: 13400 },
    { poNumber: 'PO-2024-0038', date: '2024-02-26', status: 'received', total: 9200 },
  ],
  'sup-2': [
    { poNumber: 'PO-2024-0042', date: '2024-03-12', status: 'sent', total: 43560 },
    { poNumber: 'PO-2024-0035', date: '2024-02-18', status: 'received', total: 38900 },
  ],
  'sup-3': [
    { poNumber: 'PO-2024-0044', date: '2024-03-14', status: 'draft', total: 12000 },
    { poNumber: 'PO-2024-0032', date: '2024-02-10', status: 'received', total: 8400 },
  ],
};

const PRODUCTS_MAP: Record<string, SupplierProduct[]> = {
  'sup-1': [
    { name: 'Cherry Tomatoes (1kg)', sku: 'VEG-CT1KG', lastCost: 450 },
    { name: 'Baby Spinach (500g)', sku: 'VEG-BSP500', lastCost: 380 },
    { name: 'Broccoli (1kg)', sku: 'VEG-BRO1KG', lastCost: 320 },
    { name: 'Carrots (1kg)', sku: 'VEG-CAR1KG', lastCost: 180 },
  ],
  'sup-2': [
    { name: 'Arborio Rice (5kg)', sku: 'DRY-AR5KG', lastCost: 1200 },
    { name: 'Olive Oil Extra Virgin (1L)', sku: 'OIL-EVOO1L', lastCost: 890 },
    { name: 'Canned Tomatoes (400g)', sku: 'CAN-TOM400', lastCost: 210 },
  ],
  'sup-3': [
    { name: 'Sparkling Water (500ml 24pk)', sku: 'BEV-SW500-24', lastCost: 2400 },
    { name: 'Still Water (1L 12pk)', sku: 'BEV-STW1L-12', lastCost: 1800 },
  ],
};

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

function SupplierModal({ existing, onClose, onSave }: SupplierModalProps) {
  const [form, setForm] = useState<Omit<Supplier, 'id' | 'productCount' | 'lastOrderDate'>>({
    name: existing?.name ?? '',
    contactName: existing?.contactName ?? '',
    email: existing?.email ?? '',
    phone: existing?.phone ?? '',
    website: existing?.website ?? '',
    address: existing?.address ?? '',
    paymentTerms: existing?.paymentTerms ?? 'Net30',
    leadTimeDays: existing?.leadTimeDays ?? 7,
    notes: existing?.notes ?? '',
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit() {
    const supplier: Supplier = {
      id: existing?.id ?? `sup-${Date.now()}`,
      ...form,
      productCount: existing?.productCount ?? 0,
      lastOrderDate: existing?.lastOrderDate ?? new Date().toISOString().slice(0, 10),
    };
    onSave(supplier);
    onClose();
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

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {existing ? 'Save Changes' : 'Add Supplier'}
          </button>
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
}

function SupplierDetail({ supplier, onClose, onEdit }: SupplierDetailProps) {
  const [tab, setTab] = useState<DetailTab>('info');
  const recentOrders = RECENT_ORDERS_MAP[supplier.id] ?? [];
  const products = PRODUCTS_MAP[supplier.id] ?? [];

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
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">{supplier.address || '—'}</dd>
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
              {recentOrders.length === 0 && (
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
                    <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'products' && (
            <div className="space-y-3">
              {products.length === 0 && (
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
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(product.lastCost)}</p>
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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/proxy/suppliers');
        if (res.ok) {
          const json = await res.json();
          setSuppliers(json.data ?? MOCK_SUPPLIERS);
        } else {
          setSuppliers(MOCK_SUPPLIERS);
        }
      } catch {
        setSuppliers(MOCK_SUPPLIERS);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  function handleSaveSupplier(supplier: Supplier) {
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
  }

  function handleEditFromDetail(supplier: Supplier) {
    setEditTarget(supplier);
    setDetailTarget(null);
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
        />
      )}
    </div>
  );
}
