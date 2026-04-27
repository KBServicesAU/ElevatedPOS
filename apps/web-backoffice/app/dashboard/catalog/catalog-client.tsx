'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Pencil,
  Eye,
  Package,
  ChevronDown,
  X,
  Copy,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts, useCategories } from '@/lib/hooks';
import { apiFetch } from '@/lib/api';
import type { Product } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { formatCurrency, getErrorMessage } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
}

interface StockLevel {
  productId: string;
  onHand: number;
}

// ─── Extended Product type for UI ─────────────────────────────────────────────

interface ProductWithChannels extends Product {
  showOnKiosk?: boolean;
  isSoldOnline?: boolean;
  imageUrl?: string;
  weightUnit?: string;
  costPrice?: number;
  barcode?: string;
  gstFree?: boolean;
}

// ─── Modifier types ───────────────────────────────────────────────────────────

interface ModifierOption {
  name: string;
  priceAdjustment: number;
}

interface ModifierGroup {
  id?: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  options: ModifierOption[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchStockLevels(productIds: string[]): Promise<Record<string, number>> {
  if (productIds.length === 0) return {};
  try {
    const res = await fetch(
      `/api/proxy/stock?productIds=${productIds.join(',')}`,
    );
    if (!res.ok) return {};
    const json = (await res.json()) as { data?: StockLevel[] } | StockLevel[];
    const items: StockLevel[] = Array.isArray(json) ? json : (json.data ?? []);
    return Object.fromEntries(items.map((s) => [s.productId, s.onHand]));
  } catch {
    return {};
  }
}

// v2.7.48 — the catalog service stores active state on the boolean
// `isActive` column (see services/catalog/src/db/schema.ts). The previous
// implementation PATCHed `{ status: 'active' | 'inactive' }`, which the
// server's Zod schema silently dropped because no `status` field exists,
// leaving the DB unchanged. UI optimistic updates therefore reverted on
// the next refetch and the merchant saw the active tag stay un-ticked.
async function patchProductStatus(productId: string, status: string): Promise<void> {
  const isActive = status === 'active';
  const res = await fetch(`/api/proxy/catalog/products/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) throw new Error(`Failed to update status: HTTP ${res.status}`);
}

function generateRandomSku(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ─── Status Toggle ─────────────────────────────────────────────────────────────

function StatusToggle({
  product,
  onToggle,
  isToggling,
}: {
  product: ProductWithChannels;
  onToggle: (product: ProductWithChannels) => void;
  isToggling: boolean;
}) {
  // v2.7.48 — read from `isActive` (the field the catalog API actually returns).
  // Fall back to the legacy `status` string for any callers that still set it
  // (e.g. unit tests / fixture data) so this stays backwards compatible.
  const isActive = product.isActive ?? product.status === 'active';
  return (
    <button
      onClick={() => onToggle(product)}
      disabled={isToggling}
      title={isActive ? 'Deactivate product' : 'Activate product'}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
        isActive ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          isActive ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Channel Badges ────────────────────────────────────────────────────────────

function ChannelBadges({ product }: { product: ProductWithChannels }) {
  const channels: { label: string; active: boolean }[] = [
    { label: 'Till', active: !!product.isSoldInstore },
    { label: 'Kiosk', active: !!product.showOnKiosk },
    { label: 'Web', active: !!product.isSoldOnline },
  ];

  const active = channels.filter((c) => c.active);
  if (active.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {active.map((c) => (
        <span
          key={c.label}
          className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ─── Type Badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    standard: { label: 'Standard', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
    weighted: { label: 'Weighted', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    variant: { label: 'Variant', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  };
  const entry = map[type] ?? { label: type, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

// ─── Image Thumbnail ───────────────────────────────────────────────────────────

function ProductThumb({ imageUrl, name }: { imageUrl?: string; name: string }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        className="h-10 w-10 rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
      <Package className="h-5 w-5 text-gray-400" />
    </div>
  );
}

// ─── Modifier Group Form ───────────────────────────────────────────────────────

function ModifierGroupForm({
  onSave,
  onCancel,
}: {
  onSave: (group: ModifierGroup) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [required, setRequired] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [options, setOptions] = useState<ModifierOption[]>([{ name: '', priceAdjustment: 0 }]);

  function addOption() {
    setOptions((prev) => [...prev, { name: '', priceAdjustment: 0 }]);
  }

  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateOption(i: number, field: keyof ModifierOption, value: string | number) {
    setOptions((prev) =>
      prev.map((opt, idx) =>
        idx === i ? { ...opt, [field]: value } : opt,
      ),
    );
  }

  function handleSave() {
    if (!name.trim()) return;
    const validOptions = options.filter((o) => o.name.trim());
    onSave({ name: name.trim(), required, multiSelect, options: validOptions });
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-3 dark:border-indigo-800 dark:bg-indigo-900/10">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Group Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Milk Type"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="rounded accent-indigo-600" />
          Required
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={multiSelect} onChange={(e) => setMultiSelect(e.target.checked)} className="rounded accent-indigo-600" />
          Multi-select
        </label>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">Options</p>
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={opt.name}
                onChange={(e) => updateOption(i, 'name', e.target.value)}
                placeholder="Option name"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <input
                type="number"
                step="0.01"
                value={opt.priceAdjustment}
                onChange={(e) => updateOption(i, 'priceAdjustment', parseFloat(e.target.value) || 0)}
                placeholder="+$0.00"
                className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              {options.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addOption}
          className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
        >
          + Add option
        </button>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">Cancel</button>
        <button type="button" onClick={handleSave} disabled={!name.trim()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Save Group</button>
      </div>
    </div>
  );
}

// ─── Add Product Modal ─────────────────────────────────────────────────────────

interface AddProductModalProps {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

function AddProductModal({ categories, onClose, onSaved }: AddProductModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    categoryId: '',
    basePrice: '',
    costPrice: '',
    imageUrl: '',
    productType: 'standard' as 'standard' | 'variant' | 'kit' | 'service',
    isSoldInstore: true,
    trackStock: true,
    gstFree: false,
  });
  const [imageError, setImageError] = useState(false);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [showModifierForm, setShowModifierForm] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function generateSku() {
    set('sku', generateRandomSku());
  }

  const price = parseFloat(form.basePrice) || 0;
  const cost = parseFloat(form.costPrice) || 0;
  const margin = price > 0 && cost >= 0 && cost <= price
    ? ((price - cost) / price) * 100
    : null;

  function handleAddModifierGroup(group: ModifierGroup) {
    setModifierGroups((prev) => [...prev, group]);
    setShowModifierForm(false);
  }

  function removeModifierGroup(i: number) {
    setModifierGroups((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.sku.trim()) return;
    const parsedPrice = parseFloat(form.basePrice);
    if (isNaN(parsedPrice) || parsedPrice < 0) { setError('Enter a valid base price'); return; }
    setSaving(true);
    try {
      const parsedCost = form.costPrice !== '' ? parseFloat(form.costPrice) : undefined;
      await apiFetch('products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          sku: form.sku.trim(),
          barcode: form.barcode.trim() || undefined,
          categoryId: form.categoryId || undefined,
          basePrice: Math.round(parsedPrice * 100),
          costPrice: parsedCost !== undefined && !isNaN(parsedCost) ? Math.round(parsedCost * 100) : undefined,
          imageUrl: form.imageUrl.trim() || undefined,
          productType: form.productType,
          isSoldInstore: form.isSoldInstore,
          trackStock: form.trackStock,
          gstFree: form.gstFree || undefined,
          modifierGroups: modifierGroups.length > 0 ? modifierGroups : undefined,
        }),
      });
      toast({ title: 'Product created', description: `"${form.name}" has been added.`, variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create product');
      setError(msg);
      toast({ title: 'Failed to create product', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Product</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="overflow-y-auto">
          <div className="space-y-4 p-6">
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>
            )}
            {/* Name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Name <span className="text-red-500">*</span></label>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Flat White" className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </div>
            {/* SKU */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">SKU <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <input required value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="e.g. COFF-FW-001" className="flex-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                <button type="button" onClick={generateSku} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">Generate</button>
              </div>
            </div>
            {/* Barcode */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Barcode</label>
              <input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="e.g. 9300675016022" className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </div>
            {/* Category + Type row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                <select value={form.productType} onChange={(e) => set('productType', e.target.value as typeof form.productType)} className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value="standard">Standard</option>
                  <option value="variant">Variant</option>
                  <option value="kit">Kit</option>
                  <option value="service">Service</option>
                </select>
              </div>
            </div>
            {/* Base Price */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Base Price ($) <span className="text-red-500">*</span></label>
              <input required type="number" min="0" step="0.01" value={form.basePrice} onChange={(e) => set('basePrice', e.target.value)} placeholder="0.00" className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </div>
            {/* Cost Price */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Cost Price (excl. GST) ($)</label>
              <input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} placeholder="0.00" className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              {margin !== null && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Margin: <span className={`font-medium ${margin >= 50 ? 'text-green-600 dark:text-green-400' : margin >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{margin.toFixed(1)}%</span>
                </p>
              )}
            </div>
            {/* Image URL */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Image URL</label>
              <div className="flex gap-3 items-center">
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={(e) => { set('imageUrl', e.target.value); setImageError(false); }}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                {form.imageUrl ? (
                  imageError ? (
                    <div className="h-12 w-12 shrink-0 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <Package className="h-5 w-5 text-gray-400" />
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.imageUrl}
                      alt="Preview"
                      className="h-12 w-12 shrink-0 rounded object-cover"
                      onError={() => setImageError(true)}
                    />
                  )
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Package className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                  </div>
                )}
              </div>
            </div>
            {/* Toggles */}
            <div className="flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.isSoldInstore} onChange={(e) => set('isSoldInstore', e.target.checked)} className="rounded accent-indigo-600" />
                Sold in-store
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.trackStock} onChange={(e) => set('trackStock', e.target.checked)} className="rounded accent-indigo-600" />
                Track stock
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.gstFree} onChange={(e) => set('gstFree', e.target.checked)} className="rounded accent-indigo-600" />
                GST-free (no 10% GST applied)
              </label>
            </div>

            {/* Modifier Groups — shown for non-simple (non-standard) types */}
            {form.productType !== 'standard' && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Modifier Groups</p>
                  {!showModifierForm && (
                    <button
                      type="button"
                      onClick={() => setShowModifierForm(true)}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Group
                    </button>
                  )}
                </div>
                {modifierGroups.length === 0 && !showModifierForm && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No modifier groups yet. Add one to let customers customise this product.</p>
                )}
                {modifierGroups.map((group, i) => (
                  <div key={i} className="mb-2 flex items-start justify-between rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{group.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {group.required ? 'Required' : 'Optional'} · {group.multiSelect ? 'Multi-select' : 'Single'} · {group.options.length} option{group.options.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeModifierGroup(i)}
                      className="ml-2 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {showModifierForm && (
                  <ModifierGroupForm
                    onSave={handleAddModifierGroup}
                    onCancel={() => setShowModifierForm(false)}
                  />
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">Cancel</button>
              <button type="submit" disabled={saving || !form.name.trim() || !form.sku.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Creating…' : 'Create Product'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Bulk Action Bar ───────────────────────────────────────────────────────────

function BulkActionBar({
  selectedCount,
  onClear,
  onActivate,
  onDeactivate,
  bulkLoading,
}: {
  selectedCount: number;
  onClear: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  bulkLoading: boolean;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 dark:border-indigo-800 dark:bg-indigo-900/20">
      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
        {selectedCount} selected
      </span>
      <button
        onClick={onActivate}
        disabled={bulkLoading}
        className="rounded-lg border border-indigo-300 bg-white px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
      >
        Activate
      </button>
      <button
        onClick={onDeactivate}
        disabled={bulkLoading}
        className="rounded-lg border border-indigo-300 bg-white px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
      >
        Deactivate
      </button>
      <button
        onClick={onClear}
        className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400"
      >
        Clear selection
      </button>
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <tr>
      <td colSpan={9} className="px-5 py-16 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <Package className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">No products found</p>
          {!hasFilters ? (
            <>
              <p className="text-sm text-gray-500">Get started by adding your first product.</p>
              <Link
                href="/dashboard/catalog/products/new"
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add your first product
              </Link>
            </>
          ) : (
            <p className="text-sm text-gray-500">Try adjusting your filters.</p>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Select Component ──────────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function CatalogClient() {
  // Task 4: Separate input state from debounced search state
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [duplicatingIds, setDuplicatingIds] = useState<Set<string>>(new Set());

  // SOH map: productId -> onHand quantity
  const [sohMap, setSohMap] = useState<Record<string, number>>({});

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Task 4: 300ms debounce on search input
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: productsData, isLoading: productsLoading } = useProducts({
    categoryId: categoryFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
    limit: 500,
  });

  const { data: categoriesData } = useCategories();

  const baseProducts = (productsData?.data ?? []) as ProductWithChannels[];
  const categories = (categoriesData?.data ?? []) as Category[];

  // Build a category ID -> name lookup map for display
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  // Apply client-side filters for type and channel (not supported by API params)
  const products = useMemo(() => {
    return baseProducts.filter((p) => {
      if (typeFilter) {
        if (typeFilter === 'weighted' && p.productType !== 'weighted' && p.productType !== 'scalable') return false;
        if (typeFilter !== 'weighted' && p.productType !== typeFilter) return false;
      }
      if (channelFilter) {
        if (channelFilter === 'till' && !p.isSoldInstore) return false;
        if (channelFilter === 'kiosk' && !p.showOnKiosk) return false;
        if (channelFilter === 'web' && !p.isSoldOnline) return false;
      }
      return true;
    });
  }, [baseProducts, typeFilter, channelFilter]);

  const total = productsData?.pagination?.total ?? baseProducts.length;

  // Load SOH after products are fetched
  useEffect(() => {
    const ids = baseProducts.filter((p) => p.trackStock).map((p) => p.id);
    if (ids.length === 0) return;
    fetchStockLevels(ids).then((map) => setSohMap(map));
  }, [baseProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Bulk selection ──────────────────────────────────────────────────────────

  const allVisibleIds = products.map((p) => p.id);
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allVisibleIds.some((id) => selectedIds.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allVisibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allVisibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Status toggle ───────────────────────────────────────────────────────────

  const handleToggleStatus = useCallback(
    async (product: ProductWithChannels) => {
      // v2.7.48 — derive currentStatus from the boolean isActive field.
      // The override map continues to use the legacy 'active'|'inactive'
      // strings so existing optimistic-update paths don't change.
      const overridden = statusOverrides[product.id];
      const currentStatus = overridden
        ?? (product.isActive === false ? 'inactive' : 'active');
      const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
      // Immediately flip the toggle (optimistic UI)
      setStatusOverrides((prev) => ({ ...prev, [product.id]: nextStatus }));
      setTogglingIds((prev) => new Set(prev).add(product.id));

      try {
        await patchProductStatus(product.id, nextStatus);
        toast({
          title: nextStatus === 'active' ? 'Product activated' : 'Product deactivated',
          description: `"${product.name}" is now ${nextStatus}.`,
          variant: nextStatus === 'active' ? 'success' : 'default',
        });
        queryClient.invalidateQueries({ queryKey: ['products'] });
      } catch (err) {
        // Revert optimistic update on error
        setStatusOverrides((prev) => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
        toast({
          title: 'Failed to update status',
          description: getErrorMessage(err, 'Please try again.'),
          variant: 'destructive',
        });
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }
    },
    [toast, queryClient, statusOverrides],
  );

  // ─── Task 5: Duplicate product ───────────────────────────────────────────────

  const handleDuplicate = useCallback(
    async (product: ProductWithChannels) => {
      setDuplicatingIds((prev) => new Set(prev).add(product.id));
      try {
        await apiFetch('products', {
          method: 'POST',
          body: JSON.stringify({
            name: `Copy of ${product.name}`,
            sku: generateRandomSku(),
            categoryId: product.categoryId,
            basePrice: product.basePrice,
            productType: product.productType,
            isSoldInstore: product.isSoldInstore,
            trackStock: product.trackStock,
            imageUrl: (product as ProductWithChannels).imageUrl,
            costPrice: (product as ProductWithChannels).costPrice,
            barcode: undefined,
            gstFree: (product as ProductWithChannels).gstFree,
          }),
        });
        toast({
          title: 'Product duplicated',
          description: `"Copy of ${product.name}" has been created.`,
          variant: 'success',
        });
        queryClient.invalidateQueries({ queryKey: ['products'] });
      } catch (err) {
        toast({
          title: 'Failed to duplicate product',
          description: getErrorMessage(err, 'Please try again.'),
          variant: 'destructive',
        });
      } finally {
        setDuplicatingIds((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }
    },
    [toast, queryClient],
  );

  async function handleBulkAction(status: 'active' | 'inactive') {
    if (selectedIds.size === 0 || bulkLoading) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    let successCount = 0;
    await Promise.all(
      ids.map(async (id) => {
        try {
          await patchProductStatus(id, status);
          successCount++;
        } catch { /* individual failures ignored */ }
      }),
    );
    toast({
      title: status === 'active' ? 'Products activated' : 'Products deactivated',
      description: `${successCount} of ${ids.length} product${ids.length !== 1 ? 's' : ''} updated.`,
      variant: successCount > 0 ? 'success' : 'destructive',
    });
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['products'] });
    setBulkLoading(false);
  }

  const hasFilters = !!(searchInput || categoryFilter || typeFilter || channelFilter || statusFilter);

  return (
    <div className="space-y-5">
      {showAddProduct && (
        <AddProductModal
          categories={categories}
          onClose={() => setShowAddProduct(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Products</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {productsLoading ? 'Loading…' : `${total} product${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowAddProduct(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search — Task 4: use searchInput/setSearchInput */}
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {/* Category */}
        <FilterSelect
          value={categoryFilter}
          onChange={setCategoryFilter}
          placeholder="All Categories"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />

        {/* Type */}
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          placeholder="All Types"
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'weighted', label: 'Weighted' },
            { value: 'variant', label: 'Variant' },
          ]}
        />

        {/* Channel */}
        <FilterSelect
          value={channelFilter}
          onChange={setChannelFilter}
          placeholder="All Channels"
          options={[
            { value: 'till', label: 'Till' },
            { value: 'kiosk', label: 'Kiosk' },
            { value: 'web', label: 'Web' },
          ]}
        />

        {/* Status */}
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="All Statuses"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />

        {hasFilters && (
          <button
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setCategoryFilter('');
              setTypeFilter('');
              setChannelFilter('');
              setStatusFilter('');
            }}
            className="text-sm text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onActivate={() => { void handleBulkAction('active'); }}
        onDeactivate={() => { void handleBulkAction('inactive'); }}
        bulkLoading={bulkLoading}
      />

      {/* Products table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                </th>
                <th className="w-14 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Name / SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  SOH
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Channels
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Active
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {productsLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 10 }).map((__, j) => (
                        <td key={j} className="px-4 py-3.5">
                          <div
                            className="h-4 rounded bg-gray-100 dark:bg-gray-800"
                            style={{ width: j === 0 || j === 1 ? 16 : '75%' }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                : products.length === 0
                  ? <EmptyState hasFilters={hasFilters} />
                  : products.map((product) => {
                      const isToggling = togglingIds.has(product.id);
                      const isDuplicating = duplicatingIds.has(product.id);
                      const soh = sohMap[product.id];
                      const sohDisplay = product.trackStock
                        ? soh !== undefined
                          ? String(soh)
                          : '—'
                        : '—';

                      // Task 2: compute margin for display
                      const displayPrice = product.basePrice / 100;
                      const displayCost = product.costPrice !== undefined ? product.costPrice / 100 : null;
                      const displayMargin =
                        displayCost !== null && displayPrice > 0 && displayCost <= displayPrice
                          ? ((displayPrice - displayCost) / displayPrice) * 100
                          : null;

                      return (
                        <tr
                          key={product.id}
                          className={`group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                            selectedIds.has(product.id) ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="px-4 py-3.5">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(product.id)}
                              onChange={() => toggleOne(product.id)}
                              className="h-4 w-4 rounded accent-indigo-600"
                            />
                          </td>

                          {/* Thumbnail */}
                          <td className="px-3 py-3.5">
                            <ProductThumb imageUrl={product.imageUrl} name={product.name} />
                          </td>

                          {/* Name + SKU */}
                          <td className="px-4 py-3.5">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {product.name}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                              {product.sku || '—'}
                            </p>
                          </td>

                          {/* Category */}
                          <td className="px-4 py-3.5">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {(product.categoryId ? categoryMap.get(product.categoryId) : undefined) ?? '—'}
                            </span>
                          </td>

                          {/* Price — Task 2: show cost + margin */}
                          <td className="px-4 py-3.5">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatCurrency(product.basePrice)}
                            </span>
                            {displayCost !== null && (
                              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                                Cost: {formatCurrency(product.costPrice!)}
                                {displayMargin !== null && (
                                  <span className="ml-1 text-gray-400">· {displayMargin.toFixed(0)}% margin</span>
                                )}
                              </p>
                            )}
                          </td>

                          {/* SOH */}
                          <td className="px-4 py-3.5">
                            <span
                              className={`text-sm ${
                                sohDisplay === '—'
                                  ? 'text-gray-400'
                                  : Number(sohDisplay) <= 0
                                    ? 'font-medium text-red-600 dark:text-red-400'
                                    : Number(sohDisplay) <= 5
                                      ? 'font-medium text-amber-600 dark:text-amber-400'
                                      : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {sohDisplay}
                            </span>
                          </td>

                          {/* Type badge */}
                          <td className="px-4 py-3.5">
                            <TypeBadge type={product.productType} />
                          </td>

                          {/* Channel badges */}
                          <td className="px-4 py-3.5">
                            <ChannelBadges product={product} />
                          </td>

                          {/* Status toggle */}
                          <td className="px-4 py-3.5">
                            <StatusToggle
                              product={statusOverrides[product.id]
                                // v2.7.48 — set BOTH `status` (legacy) and the
                                // `isActive` boolean StatusToggle now reads.
                                ? { ...product, status: statusOverrides[product.id], isActive: statusOverrides[product.id] === 'active' }
                                : product}
                              onToggle={handleToggleStatus}
                              isToggling={isToggling}
                            />
                          </td>

                          {/* Actions — Task 5: Duplicate button */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/dashboard/catalog/products/${product.id}`}
                                title="Edit product"
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Link>
                              <Link
                                href={`/dashboard/catalog/products/${product.id}`}
                                title="View product"
                                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
                              >
                                <Eye className="h-3 w-3" /> View
                              </Link>
                              <button
                                title="Duplicate product"
                                disabled={isDuplicating}
                                onClick={() => { void handleDuplicate(product); }}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
            </tbody>
          </table>
        </div>
        {/* Show a note if total exceeds the fetched limit */}
        {!productsLoading && total > baseProducts.length && (
          <p className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800">
            Showing {products.length} of {total} products.{' '}
            <a href="/dashboard/bulk-manage" className="text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-700">
              Use Bulk Manage
            </a>{' '}
            to export or manage all products.
          </p>
        )}
      </div>
    </div>
  );
}
