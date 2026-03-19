import type { Metadata } from 'next';
import { Plus, Search, Filter, MoreVertical, Tag, Package } from 'lucide-react';

export const metadata: Metadata = { title: 'Catalog' };

const products = [
  { id: 'P001', name: 'Flat White', category: 'Coffee', price: '$5.50', variants: 3, status: 'Active', stock: 'In Stock' },
  { id: 'P002', name: 'Croissant', category: 'Pastries', price: '$4.00', variants: 1, status: 'Active', stock: 'In Stock' },
  { id: 'P003', name: 'Iced Latte', category: 'Coffee', price: '$6.00', variants: 4, status: 'Active', stock: 'In Stock' },
  { id: 'P004', name: 'Avocado Toast', category: 'Food', price: '$14.50', variants: 2, status: 'Active', stock: 'In Stock' },
  { id: 'P005', name: 'Single Origin Pour Over', category: 'Coffee', price: '$8.00', variants: 1, status: 'Active', stock: 'Low Stock' },
  { id: 'P006', name: 'Oat Milk Latte', category: 'Coffee', price: '$6.50', variants: 3, status: 'Active', stock: 'Low Stock' },
  { id: 'P007', name: 'Banana Bread', category: 'Pastries', price: '$4.50', variants: 1, status: 'Inactive', stock: 'Out of Stock' },
  { id: 'P008', name: 'Cold Brew', category: 'Coffee', price: '$5.00', variants: 2, status: 'Active', stock: 'In Stock' },
];

const categories = ['All', 'Coffee', 'Pastries', 'Food', 'Drinks'];

export default function CatalogPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Product Catalog</h2>
          <p className="text-sm text-gray-500">{products.length} products across 4 categories</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700">
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-nexus-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="flex gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                cat === 'All'
                  ? 'bg-nexus-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {cat}
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
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Variants</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Stock</th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-nexus-50 dark:bg-nexus-900/30">
                      <Package className="h-4 w-4 text-nexus-600 dark:text-nexus-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    <Tag className="h-3 w-3" /> {product.category}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{product.price}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{product.variants}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    product.stock === 'In Stock' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    product.stock === 'Low Stock' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {product.stock}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    product.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
