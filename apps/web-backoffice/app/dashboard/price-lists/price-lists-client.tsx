'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import {
  Plus, ChevronDown, ChevronRight, MoreVertical, Tag,
  Search, X, Check, Pencil, Trash2,
} from 'lucide-react';
import { formatCurrency, getErrorMessage } from '@/lib/formatting';
import { useToast } from '@/lib/use-toast';
// v2.7.40 — route through the shared apiFetch / /api/proxy so the session
// cookie is exchanged for a Bearer token server-side before hitting the
// catalog service (which enforces request.jwtVerify()). Fragments in the
// table are also keyed now so expanding a price list row doesn't crash
// React ("This page ran into an error" on clicking a row).
import { apiFetch } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type PriceListType = 'retail' | 'wholesale' | 'staff' | 'custom';
type AdjustmentType = 'percent_off' | 'fixed_off' | 'per_product';

interface ProductOverride {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  basePrice: number;
  overridePrice: number;
}

interface PriceList {
  id: string;
  name: string;
  type: PriceListType;
  description: string;
  adjustmentType: AdjustmentType;
  adjustmentValue: number;
  isDefault: boolean;
  isActive: boolean;
  productCount: number;
  overrides: ProductOverride[];
  channels?: string[];
  locationIds?: string[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────


function typeLabel(type: PriceListType) {
  const labels: Record<PriceListType, string> = {
    retail: 'Retail',
    wholesale: 'Wholesale',
    staff: 'Staff',
    custom: 'Custom',
  };
  return labels[type];
}

function typeBadgeClass(type: PriceListType) {
  const classes: Record<PriceListType, string> = {
    retail: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    wholesale: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    staff: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    custom: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  };
  return classes[type];
}

function adjustmentDisplay(pl: PriceList) {
  if (pl.adjustmentType === 'percent_off') return `-${pl.adjustmentValue}%`;
  if (pl.adjustmentType === 'fixed_off') return `-$${pl.adjustmentValue.toFixed(2)}`;
  return 'Per product';
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreate?: (pl: Omit<PriceList, 'id' | 'productCount' | 'overrides'>) => void;
  onUpdate?: (pl: Omit<PriceList, 'id' | 'productCount' | 'overrides'>) => void;
  initial?: Partial<PriceList>;
}

function CreatePriceListModal({ onClose, onCreate, onUpdate, initial }: CreateModalProps) {
  const isEdit = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<PriceListType>(initial?.type ?? 'custom');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>(initial?.adjustmentType ?? 'percent_off');
  const [adjustmentValue, setAdjustmentValue] = useState(initial?.adjustmentValue ?? 0);
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      type,
      description: description.trim(),
      adjustmentType,
      adjustmentValue,
      isDefault,
      isActive: initial?.isActive ?? true,
    };
    if (isEdit && onUpdate) {
      onUpdate(payload);
    } else if (!isEdit && onCreate) {
      onCreate(payload);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-pl-title"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <h2 id="create-pl-title" className="text-base font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Price List' : 'Create Price List'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VIP Members"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PriceListType)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="staff">Staff</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Adjustment type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Adjustment Type</label>
            <select
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value as AdjustmentType)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="percent_off">Fixed % off</option>
              <option value="fixed_off">Fixed $ off</option>
              <option value="per_product">Custom per-product</option>
            </select>
          </div>

          {/* Adjustment value */}
          {adjustmentType !== 'per_product' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {adjustmentType === 'percent_off' ? 'Discount (%)' : 'Discount ($)'}
              </label>
              <input
                type="number"
                min={0}
                step={adjustmentType === 'percent_off' ? 1 : 0.01}
                value={adjustmentValue}
                onChange={(e) => setAdjustmentValue(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          )}

          {/* isDefault toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setIsDefault((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDefault ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isDefault ? 'translate-x-4.5' : 'translate-x-0.5'}`}
              />
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">Set as default price list</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {isEdit ? 'Save Changes' : 'Create Price List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Override Modal ───────────────────────────────────────────────────────

interface AddOverrideModalProps {
  priceListId: string;
  onClose: () => void;
  onAdd: (priceListId: string, override: Omit<ProductOverride, 'id'>) => void;
}

interface ApiProduct { id: string; name: string; sku?: string; basePrice?: number; }

function AddOverrideModal({ priceListId, onClose, onAdd }: AddOverrideModalProps) {
  const { toast } = useToast();
  const [productSearch, setProductSearch] = useState('');
  const [overridePrice, setOverridePrice] = useState('');
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchLoading(true);
      const qs = productSearch ? `?search=${encodeURIComponent(productSearch)}&limit=10` : '?limit=10';
      apiFetch<{ data?: ApiProduct[] } | ApiProduct[]>(`products${qs}`)
        .then((json) => {
          const items = Array.isArray(json) ? json : (json.data ?? []);
          setProducts(items);
        })
        .catch(() => {
          setProducts([]);
          toast({ title: 'Error', description: 'Failed to search products. Please try again.', variant: 'destructive' });
        })
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [productSearch]);

  const filtered = products;

  const [selectedProduct, setSelectedProduct] = useState<ApiProduct | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !overridePrice) return;
    const priceCents = Math.round(parseFloat(overridePrice) * 100);
    onAdd(priceListId, {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      sku: selectedProduct.sku ?? '',
      basePrice: selectedProduct.basePrice ?? 0,
      overridePrice: priceCents,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-override-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <h2 id="add-override-title" className="text-base font-semibold text-gray-900 dark:text-white">
            Add Product Override
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* Product search */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Product</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setSelectedProduct(null); }}
                placeholder="Search products…"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            {/* Results dropdown */}
            {!selectedProduct && (
              <div className="rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 max-h-48 overflow-y-auto">
                {searchLoading && (
                  <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Searching…</div>
                )}
                {!searchLoading && filtered.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No products found</div>
                )}
                {!searchLoading && filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedProduct(p); setProductSearch(p.name); setOverridePrice(p.basePrice != null ? (p.basePrice / 100).toFixed(2) : ''); }}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.sku}</p>
                    </div>
                    <span className="text-gray-500 dark:text-gray-400">{p.basePrice != null ? formatCurrency(p.basePrice) : '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Override price */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Override Price ($)</label>
            <input
              type="number"
              required
              min={0}
              step={0.01}
              value={overridePrice}
              onChange={(e) => setOverridePrice(e.target.value)}
              placeholder="0.00"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedProduct || !overridePrice}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Add Override
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PriceListsClient() {
  const { toast } = useToast();
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [addOverrideForId, setAddOverrideForId] = useState<string | null>(null);
  const [editingPriceList, setEditingPriceList] = useState<PriceList | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Fetch price lists (with mock fallback)
  useEffect(() => {
    async function load() {
      try {
        const json = await apiFetch<{ data?: PriceList[] }>('price-lists');
        // v2.7.51 — server may omit `overrides`/`channels`/`locationIds`;
        // default them defensively so the UI never reads `.length` on
        // undefined (clicking a row threw "Cannot read properties of
        // undefined (reading 'length')" before this).
        const list = (json.data ?? []).map((pl) => ({
          ...pl,
          overrides: pl.overrides ?? [],
          productCount: pl.productCount ?? 0,
          channels: pl.channels ?? [],
          locationIds: pl.locationIds ?? [],
        }));
        setPriceLists(list);
      } catch {
        setPriceLists([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async (data: Omit<PriceList, 'id' | 'productCount' | 'overrides'>) => {
    let id = `pl-${Date.now()}`;
    try {
      const json = await apiFetch<{ data?: { id?: string }; id?: string }>('price-lists', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          type: data.type,
          description: data.description,
          adjustmentType: data.adjustmentType,
          adjustmentValue: data.adjustmentValue,
          isDefault: data.isDefault,
          isActive: data.isActive,
          currency: 'AUD',
          channels: data.channels ?? [],
          locationIds: data.locationIds ?? [],
        }),
      });
      id = json.data?.id ?? json.id ?? id;
    } catch {
      // network error — keep local id
    }
    const newPl: PriceList = { ...data, id, productCount: 0, overrides: [] };
    setPriceLists((prev) => [...prev, newPl]);
  };

  const handleAddOverride = async (
    priceListId: string,
    override: Omit<ProductOverride, 'id'>,
  ) => {
    // Persist to API (POST price-lists/:id/entries) via /api/proxy
    try {
      await apiFetch(`price-lists/${priceListId}/entries`, {
        method: 'POST',
        body: JSON.stringify([{ productId: override.productId, price: override.overridePrice }]),
      });
    } catch {
      // optimistic — continue regardless
    }
    setPriceLists((prev) =>
      prev.map((pl) => {
        if (pl.id !== priceListId) return pl;
        return {
          ...pl,
          overrides: [...pl.overrides, { ...override, id: `ov-${Date.now()}` }],
          productCount: pl.productCount + 1,
        };
      }),
    );
  };

  const handleUpdate = async (id: string, data: Omit<PriceList, 'id' | 'productCount' | 'overrides'>) => {
    const backup = priceLists.find((pl) => pl.id === id);
    setPriceLists((prev) =>
      prev.map((pl) => (pl.id === id ? { ...pl, ...data } : pl)),
    );
    try {
      await apiFetch(`price-lists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      toast({ title: 'Price list updated', variant: 'success' });
    } catch (err) {
      if (backup) setPriceLists((prev) => prev.map((pl) => (pl.id === id ? backup : pl)));
      toast({ title: 'Failed to update', description: getErrorMessage(err, 'Please try again.'), variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    const backup = priceLists.find((pl) => pl.id === id);
    setConfirmDeleteId(null);
    setPriceLists((prev) => prev.filter((pl) => pl.id !== id));
    try {
      await apiFetch(`price-lists/${id}`, { method: 'DELETE' });
      toast({ title: 'Price list deleted', variant: 'success' });
    } catch (err) {
      if (backup) setPriceLists((prev) => [...prev, backup]);
      toast({ title: 'Failed to delete', description: getErrorMessage(err, 'Please try again.'), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Price Lists</h2>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${priceLists.length} price lists configured`}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Create Price List
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Name</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Products</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Adjustment</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: j === 5 ? 24 : '70%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : priceLists.map((pl) => {
                  const isExpanded = expandedIds.has(pl.id);
                  // v2.7.40 — Fragment must be keyed because it's the root
                  // element of a .map() iteration. An unkeyed `<>` here
                  // caused React to throw on row expand (the user reported
                  // "This page ran into an error" when clicking a row).
                  return (
                    <Fragment key={pl.id}>
                      <tr
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        onClick={() => toggleExpand(pl.id)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                              : <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                            }
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">{pl.name}</span>
                                {pl.isDefault && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                                    <Check className="h-3 w-3" /> Default
                                  </span>
                                )}
                              </div>
                              {pl.description && (
                                <p className="text-xs text-gray-400">{pl.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadgeClass(pl.type)}`}>
                            {typeLabel(pl.type)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                          {pl.productCount}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">
                          {adjustmentDisplay(pl)}
                        </td>
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              pl.isActive
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}
                          >
                            {pl.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="relative px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === pl.id ? null : pl.id); }}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {menuOpenId === pl.id && (
                            <div className="absolute right-4 top-10 z-20 min-w-[130px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                              <button
                                onClick={() => { setEditingPriceList(pl); setMenuOpenId(null); }}
                                className="flex w-full items-center gap-2 rounded-t-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                onClick={() => { setConfirmDeleteId(pl.id); setMenuOpenId(null); }}
                                className="flex w-full items-center gap-2 rounded-b-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expanded row — product overrides */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-gray-50 px-5 py-4 dark:bg-gray-800/50">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                  Product Overrides ({pl.overrides.length})
                                </h4>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAddOverrideForId(pl.id); }}
                                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                                >
                                  <Plus className="h-3.5 w-3.5" /> Add Override
                                </button>
                              </div>

                              {pl.overrides.length === 0 ? (
                                <p className="text-sm text-gray-400">
                                  {pl.adjustmentType === 'per_product'
                                    ? 'No product overrides yet. Add overrides to set custom prices per product.'
                                    : `All products will be priced at ${adjustmentDisplay(pl)} from the base price.`}
                                </p>
                              ) : (
                                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-gray-100 dark:border-gray-800">
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Product</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">SKU</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Base Price</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Override Price</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Saving</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                      {pl.overrides.map((ov) => {
                                        const saving = ov.basePrice - ov.overridePrice;
                                        const savingPct = ov.basePrice > 0 ? (saving / ov.basePrice) * 100 : 0;
                                        return (
                                          <tr key={ov.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">
                                              {ov.productName}
                                            </td>
                                            <td className="px-4 py-2.5 text-gray-500">{ov.sku}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">
                                              {formatCurrency(ov.basePrice)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                                              {formatCurrency(ov.overridePrice)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                              {saving > 0 ? (
                                                <span className="text-emerald-600 dark:text-emerald-400">
                                                  -{savingPct.toFixed(0)}%
                                                </span>
                                              ) : saving < 0 ? (
                                                <span className="text-red-500">+{Math.abs(savingPct).toFixed(0)}%</span>
                                              ) : (
                                                <span className="text-gray-400">—</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
            {!loading && priceLists.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                      <Tag className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">No price lists</p>
                    <p className="text-xs text-gray-400">Create your first price list to get started.</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Create Price List
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Close menu on outside click */}
      {menuOpenId && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreatePriceListModal onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
      )}
      {editingPriceList && (
        <CreatePriceListModal
          onClose={() => setEditingPriceList(null)}
          initial={editingPriceList}
          onUpdate={(data) => handleUpdate(editingPriceList.id, data)}
        />
      )}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete Price List?</h3>
            <p className="mt-1 text-sm text-gray-500">This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {addOverrideForId && (
        <AddOverrideModal
          priceListId={addOverrideForId}
          onClose={() => setAddOverrideForId(null)}
          onAdd={handleAddOverride}
        />
      )}
    </div>
  );
}
