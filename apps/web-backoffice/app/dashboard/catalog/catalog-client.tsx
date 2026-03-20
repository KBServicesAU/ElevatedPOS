'use client';

import { useState } from 'react';
import { Plus, Search, Filter, MoreVertical, Tag, Package } from 'lucide-react';
import { useProducts, useCategories } from '../../../lib/hooks';
import type { Product } from '../../../lib/api';

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function stockLabel(p: Product) {
  if (!p.trackStock) return 'Untracked';
  return 'In Stock'; // real stock level comes from inventory service
}

function stockColor(p: Product) {
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
}

export function CatalogClient() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const { data: productsData, isLoading: productsLoading } = useProducts({
    search: search || undefined,
    categoryId: selectedCategory || undefined,
    limit: 100,
  });
  const { data: categoriesData } = useCategories();

  const products = productsData?.data ?? [];
  const categories = categoriesData?.data ?? [];
  const total = productsData?.pagination?.total ?? products.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Product Catalog</h2>
          <p className="text-sm text-gray-500">
            {productsLoading ? 'Loading…' : `${total} products across ${categories.length} categories`}
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
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
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('')}
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
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? '' : cat.id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {cat.name}
            </button>
          ))}
          <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <Filter className="h-4 w-4" /> Filter
          </button>
        </div>
      </div>

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
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {productsLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: j === 5 ? 24 : '80%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : products.map((product: Product) => (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
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
                      <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
            {!productsLoading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
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
