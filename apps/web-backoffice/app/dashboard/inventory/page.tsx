import type { Metadata } from 'next';
import { Plus, AlertTriangle, TrendingDown, ArrowUpDown, ClipboardList } from 'lucide-react';

export const metadata: Metadata = { title: 'Inventory' };

const stockItems = [
  { sku: 'SKU-001', name: 'Oat Milk 1L', location: 'Main Store', qty: 2, reorderPoint: 10, unit: 'cartons', status: 'Critical' },
  { sku: 'SKU-002', name: 'Arabica Beans 1kg', location: 'Main Store', qty: 8, reorderPoint: 10, unit: 'bags', status: 'Low' },
  { sku: 'SKU-003', name: 'Almond Milk 1L', location: 'Main Store', qty: 24, reorderPoint: 10, unit: 'cartons', status: 'OK' },
  { sku: 'SKU-004', name: 'Whole Milk 2L', location: 'Main Store', qty: 18, reorderPoint: 12, unit: 'cartons', status: 'OK' },
  { sku: 'SKU-005', name: 'Single Origin Beans 250g', location: 'Main Store', qty: 5, reorderPoint: 8, unit: 'bags', status: 'Low' },
  { sku: 'SKU-006', name: 'Vanilla Syrup 750ml', location: 'Main Store', qty: 3, reorderPoint: 4, unit: 'bottles', status: 'Low' },
  { sku: 'SKU-007', name: 'Paper Cups 12oz', location: 'Main Store', qty: 450, reorderPoint: 200, unit: 'pcs', status: 'OK' },
  { sku: 'SKU-008', name: 'Lids', location: 'Main Store', qty: 380, reorderPoint: 200, unit: 'pcs', status: 'OK' },
];

const pendingOrders = [
  { po: 'PO-0041', supplier: 'Pacific Dairy Co.', items: 4, total: '$320.00', eta: 'Tomorrow', status: 'Confirmed' },
  { po: 'PO-0040', supplier: 'Origin Roasters', items: 2, total: '$280.00', eta: 'Mar 22', status: 'Shipped' },
];

export default function InventoryPage() {
  const critical = stockItems.filter((i) => i.status === 'Critical').length;
  const low = stockItems.filter((i) => i.status === 'Low').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inventory</h2>
          <p className="text-sm text-gray-500">{stockItems.length} SKUs tracked · {critical} critical, {low} low</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <ArrowUpDown className="h-4 w-4" /> Stock Transfer
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700">
            <Plus className="h-4 w-4" /> Create PO
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {(critical > 0 || low > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/20">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Reorder alert</p>
            <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">
              {critical} item{critical !== 1 ? 's' : ''} critically low, {low} item{low !== 1 ? 's' : ''} below reorder point.
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
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Qty</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Reorder At</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {stockItems.map((item) => (
                <tr key={item.sku} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.sku}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                    {item.qty} {item.unit}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                    {item.reorderPoint} {item.unit}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.status === 'Critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      item.status === 'Low' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {item.status !== 'OK' && <TrendingDown className="h-3 w-3" />}
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pending POs */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Purchase Orders</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {pendingOrders.map((po) => (
              <div key={po.po} className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{po.po}</p>
                    <p className="text-xs text-gray-400">{po.supplier}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    po.status === 'Shipped' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>
                    {po.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>{po.items} items · {po.total}</span>
                  <span>ETA: {po.eta}</span>
                </div>
              </div>
            ))}
            <div className="p-5">
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 py-3 text-sm text-gray-500 hover:border-nexus-400 hover:text-nexus-600 dark:border-gray-700">
                <ClipboardList className="h-4 w-4" /> View all POs
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
