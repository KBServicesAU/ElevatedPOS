'use client';

import { Plus, AlertTriangle, TrendingDown, ArrowUpDown, ClipboardList } from 'lucide-react';
import { useStock, usePurchaseOrders } from '../../../lib/hooks';
import type { StockItem, PurchaseOrder } from '../../../lib/api';

function stockStatus(item: StockItem): 'Critical' | 'Low' | 'OK' {
  if (item.onHand === 0) return 'Critical';
  if (item.onHand <= item.reorderPoint) return 'Low';
  return 'OK';
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

export function InventoryClient() {
  const { data: stockData, isLoading: stockLoading } = useStock();
  const { data: posData, isLoading: posLoading } = usePurchaseOrders();

  const stockItems = stockData?.data ?? [];
  const purchaseOrders = posData?.data ?? [];

  const critical = stockItems.filter((i) => stockStatus(i) === 'Critical').length;
  const low = stockItems.filter((i) => stockStatus(i) === 'Low').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inventory</h2>
          <p className="text-sm text-gray-500">
            {stockLoading
              ? 'Loading…'
              : `${stockItems.length} SKUs tracked · ${critical} critical, ${low} low`}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <ArrowUpDown className="h-4 w-4" /> Stock Transfer
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Create PO
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {!stockLoading && (critical > 0 || low > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/20">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Reorder alert</p>
            <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">
              {critical} item{critical !== 1 ? 's' : ''} critically low, {low} item{low !== 1 ? 's' : ''} below
              reorder point.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stock table */}
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Stock Levels</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Item</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">On Hand</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Reorder At</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {stockLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '80%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : stockItems.map((item: StockItem) => {
                    const status = stockStatus(item);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {item.productName ?? item.productId}
                          </p>
                          <p className="text-xs text-gray-400">{item.sku ?? item.productId.slice(0, 8)}</p>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                          {item.onHand} {item.unit}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                          {item.reorderPoint} {item.unit}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              status === 'Critical'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : status === 'Low'
                                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}
                          >
                            {status !== 'OK' && <TrendingDown className="h-3 w-3" />}
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              {!stockLoading && stockItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                    No stock items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pending POs */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Purchase Orders</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {posLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                ))}
              </div>
            ) : purchaseOrders.length === 0 ? (
              <div className="p-5 text-center text-sm text-gray-400">No open purchase orders</div>
            ) : (
              purchaseOrders.map((po: PurchaseOrder) => (
                <div key={po.id} className="px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{po.poNumber}</p>
                      <p className="text-xs text-gray-400">{po.supplierName ?? po.supplierId}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        po.status === 'shipped'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}
                    >
                      {po.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {po.lineCount} items · {formatCurrency(po.totalCost)}
                    </span>
                    <span>ETA: {formatDate(po.expectedAt)}</span>
                  </div>
                </div>
              ))
            )}
            <div className="p-5">
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 py-3 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700">
                <ClipboardList className="h-4 w-4" /> View all POs
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
