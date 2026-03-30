'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, Filter, MoreVertical, Tag, Package, ToggleLeft, ToggleRight, Zap, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts, useCategories } from '@/lib/hooks';
import { apiFetch } from '@/lib/api';
import type { Product } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { formatCurrency, getErrorMessage } from '@/lib/formatting';

// ─── 86 toggle ────────────────────────────────────────────────────────────────

async function patchAvailability(productId: string, available: boolean): Promise<void> {
  const res = await fetch(`/api/proxy/products/${productId}/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ available }),
  });
  if (!res.ok) throw new Error(`Failed to update availability: HTTP ${res.status}`);
}

// ─── Typesense search fetch ────────────────────────────────────────────────────

interface SearchResponse {
  results: Product[];
  total: number;
  page: number;
  facets: { categories: { value: string; count: number }[] };
  typesense: boolean;
}

async function fetchSearchResults(query: string, categoryId?: string, limit = 30): Promise<SearchResponse> {
  const qs = new URLSearchParams({ q: query, limit: String(limit) });
  if (categoryId) qs.set('categoryId', categoryId);
  const res = await fetch(`/api/proxy/search/products?${qs}`);
  if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
  return res.json() as Promise<SearchResponse>;
}

// ─── Add Product Modal ─────────────────────────────────────────────────────────

interface AddProductForm {
  name: string;
  sku: string;
  categoryId: string;
  basePrice: string; // dollars, as string input
  productType: string;
  status: string;
  isSoldInstore: boolean;
  trackStock: boolean;
}

const EMPTY_FORM: AddProductForm = {
  name: '',
  sku: '',
  categoryId: '',
  basePrice: '',
  productType: 'standard',
  status: 'active',
  isSoldInstore: true,
  trackStock: true,
};

interface AddProductModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddProductModal({ onClose, onSaved }: AddProductModalProps) {
  const [form, setForm] = useState<AddProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { data: categoriesData } = useCategories();
  const categories = categoriesData?.data ?? [];
  const { toast } = useToast();

  function set<K extends keyof AddProductForm>(key: K, value: AddProductForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        categoryId: form.categoryId || undefined,
        basePrice: Math.round(parseFloat(form.basePrice) * 100), // convert to cents
        productType: form.productType,
        status: form.status,
        isSoldInstore: form.isSoldInstore,
        trackStock: form.trackStock,
      };
      await apiFetch('products', { method: 'POST', body: JSON.stringify(payload) });
      toast({ title: 'Product created', description: `"${form.name}" has been added to the catalog.`, variant: 'success' });
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Product</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Flat White"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* SKU */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">SKU</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => set('sku', e.target.value)}
                placeholder="Auto-generated"
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* Base Price */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Price ($) <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={form.basePrice}
                onChange={(e) => set('basePrice', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
              <select
                value={form.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Product Type */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
              <select
                value={form.productType}
                onChange={(e) => set('productType', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="standard">Standard</option>
                <option value="variant">Variant</option>
                <option value="bundle">Bundle</option>
                <option value="service">Service</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <div className="flex gap-3">
              {['active', 'inactive', 'draft'].map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={form.status === s}
                    onChange={() => set('status', s)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm capitalize text-gray-700 dark:text-gray-300">{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-6">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.isSoldInstore}
                onChange={(e) => set('isSoldInstore', e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Sold in-store</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.trackStock}
                onChange={(e) => set('trackStock', e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Track stock</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name || !form.basePrice}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CatalogClient() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  // Track optimistic 86 state: productId -> available override
  const [availabilityOverrides, setAvailabilityOverrides] = useState<Record<string, boolean>>({});
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Typesense search state
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [isTypesenseResult, setIsTypesenseResult] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: productsData, isLoading: productsLoading } = useProducts({
    categoryId: selectedCategory || undefined,
    limit: 100,
  });
  const { data: categoriesData } = useCategories();

  const baseProducts = productsData?.data ?? [];
  const categories = categoriesData?.data ?? [];

  // Debounced Typesense search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (search.length < 2) {
      setSearchResults(null);
      setIsTypesenseResult(false);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await fetchSearchResults(search, selectedCategory || undefined, 30);
        setSearchResults(data.results);
        setSearchTotal(data.total);
        setIsTypesenseResult(data.typesense);
      } catch {
        // On error fall back to base list — no-op
        setSearchResults(null);
        setIsTypesenseResult(false);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, selectedCategory]);

  // Rerun search when category filter changes while a query is active
  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
  };

  const products = useMemo(() => {
    const base = searchResults !== null ? searchResults : baseProducts;
    return base.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (typeFilter && p.productType !== typeFilter) return false;
      return true;
    });
  }, [searchResults, baseProducts, statusFilter, typeFilter]);
  const isLoading = search.length >= 2 ? searchLoading : productsLoading;
  const total = searchResults !== null ? searchTotal : (productsData?.pagination?.total ?? baseProducts.length);
  const activeFilterCount = [statusFilter, typeFilter].filter(Boolean).length;

  const handleToggle86 = useCallback(async (product: Product) => {
    const currentAvailable = availabilityOverrides[product.id] ?? product.status === 'active';
    const nextAvailable = !currentAvailable;

    // Optimistic update
    setAvailabilityOverrides((prev) => ({ ...prev, [product.id]: nextAvailable }));
    setTogglingIds((prev) => new Set(prev).add(product.id));

    try {
      await patchAvailability(product.id, nextAvailable);
      toast({
        title: nextAvailable ? 'Product available' : 'Product 86\'d',
        description: `${product.name} is now ${nextAvailable ? 'available' : 'marked as 86\'d'}.`,
        variant: nextAvailable ? 'success' : 'default',
      });
    } catch {
      // Roll back on failure
      setAvailabilityOverrides((prev) => ({ ...prev, [product.id]: currentAvailable }));
      toast({ title: 'Failed to update availability', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }
  }, [availabilityOverrides, toast]);

  return (
    <div className="space-y-6">
      {showAddProduct && (
        <AddProductModal
          onClose={() => setShowAddProduct(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Product Catalog</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${total} products across ${categories.length} categories`}
          </p>
        </div>
        <button
          onClick={() => setShowAddProduct(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          {/* Typesense badge — shown only when results are from Typesense */}
          {isTypesenseResult && search.length >= 2 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400 dark:bg-gray-700 dark:text-gray-500">
              <Zap className="h-2.5 w-2.5" /> Typesense
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleCategoryChange('')}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              selectedCategory === ''
                ? 'bg-indigo-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id === selectedCategory ? '' : cat.id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {cat.name}
            </button>
          ))}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">All types</option>
              <option value="simple">Simple</option>
              <option value="variable">Variable</option>
              <option value="composite">Composite</option>
              <option value="service">Service</option>
            </select>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setStatusFilter(''); setTypeFilter(''); }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 dark:text-gray-400"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
          <p className="ml-auto text-xs text-gray-400">{products.length} result{products.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* Product table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Product</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Category</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Price</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">86</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: j >= 5 ? 24 : '80%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : products.map((product: Product) => {
                  const isAvailable = availabilityOverrides[product.id] ?? product.status === 'active';
                  const isToggling = togglingIds.has(product.id);

                  return (
                    <tr key={product.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${!isAvailable ? 'opacity-60' : ''}`}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                            <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{product.name}</p>
                            <p className="text-xs text-gray-400">{product.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                          <Tag className="h-3 w-3" /> {product.categoryName ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">
                        {formatCurrency(product.basePrice)}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400 capitalize">
                        {product.productType}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            product.status === 'active'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          }`}
                        >
                          {product.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggle86(product)}
                            disabled={isToggling}
                            title={isAvailable ? 'Mark as 86d (unavailable)' : 'Restore availability'}
                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                              isAvailable
                                ? 'border border-gray-200 text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-400'
                                : 'border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40'
                            }`}
                          >
                            {isAvailable
                              ? <ToggleRight className="h-3.5 w-3.5" />
                              : <ToggleLeft className="h-3.5 w-3.5" />
                            }
                            {isAvailable ? '86' : '86d'}
                          </button>
                          {!isAvailable && (
                            <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              86&apos;d
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            {!isLoading && products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
