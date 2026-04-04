'use client';

import { useState, useEffect } from 'react';
import {
  Plus, ChevronDown, ChevronRight, MoreVertical, Tag,
  Search, X, Check,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatting';

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
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PRICE_LISTS: PriceList[] = [
  {
    id: 'pl-retail',
    name: 'Retail',
    type: 'retail',
    description: 'Standard retail pricing for walk-in customers',
    adjustmentType: 'per_product',
    adjustmentValue: 0,
    isDefault: true,
    isActive: true,
    productCount: 142,
    overrides: [
      { id: 'ov-1', productId: 'p-1', productName: 'Flat White', sku: 'SKU-001', basePrice: 450, overridePrice: 450 },
      { id: 'ov-2', productId: 'p-2', productName: 'Long Black', sku: 'SKU-002', basePrice: 400, overridePrice: 400 },
    ],
  },
  {
    id: 'pl-wholesale',
    name: 'Wholesale',
    type: 'wholesale',
    description: '20% off for wholesale / trade accounts',
    adjustmentType: 'percent_off',
    adjustmentValue: 20,
    isDefault: false,
    isActive: true,
    productCount: 98,
    overrides: [],
  },
  {
    id: 'pl-staff',
    name: 'Staff',
    type: 'staff',
    description: 'Staff discount — 30% off all items',
    adjustmentType: 'percent_off',
    adjustmentValue: 30,
    isDefault: false,
    isActive: true,
    productCount: 142,
    overrides: [],
  },
];

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
  onCreate: (pl: Omit<PriceList, 'id' | 'productCount' | 'overrides'>) => void;
}

function CreatePriceListModal({ onClose, onCreate }: CreateModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PriceListType>('custom');
  const [description, setDescription] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('percent_off');
  const [adjustmentValue, setAdjustmentValue] = useState(0);
  const [isDefault, setIsDefault] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      type,
      description: description.trim(),
      adjustmentType,
      adjustmentValue,
      isDefault,
      isActive: true,
    });
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
            Create Price List
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
              Create Price List
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

function AddOverrideModal({ priceListId, onClose, onAdd }: AddOverrideModalProps) {
  const [productSearch, setProductSearch] = useState('');
  const [overridePrice, setOverridePrice] = useState('');

  // Mock product search results
  const mockProducts = [
    { id: 'p-1', name: 'Flat White', sku: 'SKU-001', basePrice: 450 },
    { id: 'p-2', name: 'Long Black', sku: 'SKU-002', basePrice: 400 },
    { id: 'p-3', name: 'Latte', sku: 'SKU-003', basePrice: 500 },
    { id: 'p-4', name: 'Cappuccino', sku: 'SKU-004', basePrice: 480 },
    { id: 'p-5', name: 'Espresso', sku: 'SKU-005', basePrice: 350 },
  ];

  const filtered = productSearch.length >= 1
    ? mockProducts.filter((p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase()),
      )
    : mockProducts;

  const [selectedProduct, setSelectedProduct] = useState<(typeof mockProducts)[0] | null>(null);

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
      sku: selectedProduct.sku,
      basePrice: selectedProduct.basePrice,
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
            {!selectedProduct && filtered.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedProduct(p); setProductSearch(p.name); setOverridePrice((p.basePrice / 100).toFixed(2)); }}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.sku}</p>
                    </div>
                    <span className="text-gray-500 dark:text-gray-400">{formatCurrency(p.basePrice)}</span>
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
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [addOverrideForId, setAddOverrideForId] = useState<string | null>(null);

  // Fetch price lists (with mock fallback)
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/proxy/price-lists');
        if (res.ok) {
          const json = await res.json();
          setPriceLists(json.data ?? []);
        } else {
          setPriceLists([]);
        }
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
      const res = await fetch('/api/proxy/price-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, currency: 'AUD', channels: [], locationIds: [] }),
      });
      if (res.ok) {
        const json = await res.json() as { data?: { id?: string } };
        id = json.data?.id ?? id;
      }
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
    // Persist to API (POST /api/proxy/price-lists/:id/entries)
    try {
      await fetch(`/api/proxy/price-lists/${priceListId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
                  return (
                    <>
                      <tr
                        key={pl.id}
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
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded row — product overrides */}
                      {isExpanded && (
                        <tr key={`${pl.id}-expanded`}>
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
                    </>
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

      {/* Modals */}
      {showCreateModal && (
        <CreatePriceListModal onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
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
