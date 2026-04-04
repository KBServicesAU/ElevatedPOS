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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchStockLevels(productIds: string[]): Promise<Record<string, number>> {
  if (productIds.length === 0) return {};
  try {
    const res = await fetch(
      `/api/proxy/inventory/stock-levels?productIds=${productIds.join(',')}`,
    );
    if (!res.ok) return {};
    const json = (await res.json()) as { data?: StockLevel[] } | StockLevel[];
    const items: StockLevel[] = Array.isArray(json) ? json : (json.data ?? []);
    return Object.fromEntries(items.map((s) => [s.productId, s.onHand]));
  } catch {
    return {};
  }
}

async function patchProductStatus(productId: string, status: string): Promise<void> {
  const res = await fetch(`/api/proxy/catalog/products/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update status: HTTP ${res.status}`);
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
  const isActive = product.status === 'active';
  return (
    <button
      onClick={() => onToggle(product)}
      disabled={isToggling}
      title={isActive ? 'Deactivate product' : 'Activate product'}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        isActive ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
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

// ─── Bulk Action Bar ───────────────────────────────────────────────────────────

function BulkActionBar({
  selectedCount,
  onClear,
}: {
  selectedCount: number;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 dark:border-indigo-800 dark:bg-indigo-900/20">
      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
        {selectedCount} selected
      </span>
      <button className="rounded-lg border border-indigo-300 bg-white px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
        Activate
      </button>
      <button className="rounded-lg border border-indigo-300 bg-white px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
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
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // SOH map: productId -> onHand quantity
  const [sohMap, setSohMap] = useState<Record<string, number>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const { data: productsData, isLoading: productsLoading } = useProducts({
    categoryId: categoryFilter || undefined,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    limit: 100,
  });

  const { data: categoriesData } = useCategories();

  const baseProducts = (productsData?.data ?? []) as ProductWithChannels[];
  const categories = (categoriesData?.data ?? []) as Category[];

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
      const nextStatus = product.status === 'active' ? 'inactive' : 'active';
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
    [toast, queryClient],
  );

  const hasFilters = !!(search || categoryFilter || typeFilter || channelFilter || statusFilter);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Products</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {productsLoading ? 'Loading…' : `${total} product${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          href="/dashboard/catalog/products/new"
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Product
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
      />

      {/* Products table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
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
                      const soh = sohMap[product.id];
                      const sohDisplay = product.trackStock
                        ? soh !== undefined
                          ? String(soh)
                          : '—'
                        : '—';

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
                              {product.categoryName ?? '—'}
                            </span>
                          </td>

                          {/* Price */}
                          <td className="px-4 py-3.5">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatCurrency(product.basePrice)}
                            </span>
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
                              product={product}
                              onToggle={handleToggleStatus}
                              isToggling={isToggling}
                            />
                          </td>

                          {/* Actions */}
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
                            </div>
                          </td>
                        </tr>
                      );
                    })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
