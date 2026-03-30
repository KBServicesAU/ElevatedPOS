'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus, ChevronRight, X, Check, Eye, Pencil, Truck,
  XCircle, Search, Trash2, ChevronLeft,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/formatting';

// ─── Types ───────────────────────────────────────────────────────────────────

type POStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';

interface POLineItem {
  id: string;
  productName: string;
  sku: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number; // cents
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: POStatus;
  lineItems: POLineItem[];
  totalCost: number; // cents
  expectedDate: string;
  shippingAddress: string;
  createdAt: string;
}

interface Supplier {
  id: string;
  name: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_SUPPLIERS: Supplier[] = [
  { id: 'sup-1', name: 'Fresh Valley Produce' },
  { id: 'sup-2', name: 'Metro Wholesale Foods' },
  { id: 'sup-3', name: 'Pacific Beverages Co.' },
];

const MOCK_POS: PurchaseOrder[] = [
  {
    id: 'po-1',
    poNumber: 'PO-2024-0041',
    supplierId: 'sup-1',
    supplierName: 'Fresh Valley Produce',
    status: 'received',
    lineItems: [
      { id: 'li-1', productName: 'Cherry Tomatoes (1kg)', sku: 'VEG-CT1KG', orderedQty: 20, receivedQty: 20, unitCost: 450 },
      { id: 'li-2', productName: 'Baby Spinach (500g)', sku: 'VEG-BSP500', orderedQty: 15, receivedQty: 15, unitCost: 380 },
    ],
    totalCost: 14700,
    expectedDate: '2024-03-10',
    shippingAddress: '123 Main St, Sydney NSW 2000',
    createdAt: '2024-03-06',
  },
  {
    id: 'po-2',
    poNumber: 'PO-2024-0042',
    supplierId: 'sup-2',
    supplierName: 'Metro Wholesale Foods',
    status: 'sent',
    lineItems: [
      { id: 'li-3', productName: 'Arborio Rice (5kg)', sku: 'DRY-AR5KG', orderedQty: 10, receivedQty: 0, unitCost: 1200 },
      { id: 'li-4', productName: 'Olive Oil Extra Virgin (1L)', sku: 'OIL-EVOO1L', orderedQty: 24, receivedQty: 0, unitCost: 890 },
      { id: 'li-5', productName: 'Canned Tomatoes (400g)', sku: 'CAN-TOM400', orderedQty: 48, receivedQty: 0, unitCost: 210 },
    ],
    totalCost: 43560,
    expectedDate: '2024-03-18',
    shippingAddress: '123 Main St, Sydney NSW 2000',
    createdAt: '2024-03-12',
  },
  {
    id: 'po-3',
    poNumber: 'PO-2024-0043',
    supplierId: 'sup-1',
    supplierName: 'Fresh Valley Produce',
    status: 'partial',
    lineItems: [
      { id: 'li-6', productName: 'Broccoli (1kg)', sku: 'VEG-BRO1KG', orderedQty: 25, receivedQty: 10, unitCost: 320 },
      { id: 'li-7', productName: 'Carrots (1kg)', sku: 'VEG-CAR1KG', orderedQty: 30, receivedQty: 30, unitCost: 180 },
    ],
    totalCost: 13400,
    expectedDate: '2024-03-15',
    shippingAddress: '123 Main St, Sydney NSW 2000',
    createdAt: '2024-03-11',
  },
  {
    id: 'po-4',
    poNumber: 'PO-2024-0044',
    supplierId: 'sup-3',
    supplierName: 'Pacific Beverages Co.',
    status: 'draft',
    lineItems: [
      { id: 'li-8', productName: 'Sparkling Water (500ml 24pk)', sku: 'BEV-SW500-24', orderedQty: 5, receivedQty: 0, unitCost: 2400 },
    ],
    totalCost: 12000,
    expectedDate: '2024-03-22',
    shippingAddress: '123 Main St, Sydney NSW 2000',
    createdAt: '2024-03-14',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<POStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  received: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ─── New PO Modal ─────────────────────────────────────────────────────────────

interface NewPOModalProps {
  onClose: () => void;
  onSave: (po: PurchaseOrder, asDraft: boolean) => void;
}

interface NewLineItem {
  productName: string;
  sku: string;
  qty: string;
  unitCost: string;
}

function NewPOModal({ onClose, onSave }: NewPOModalProps) {
  const [step, setStep] = useState(1);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [shippingAddress, setShippingAddress] = useState('123 Main St, Sydney NSW 2000');
  const [lineItems, setLineItems] = useState<NewLineItem[]>([
    { productName: '', sku: '', qty: '', unitCost: '' },
  ]);

  const selectedSupplier = MOCK_SUPPLIERS.find((s) => s.id === supplierId);

  function addLine() {
    setLineItems((prev) => [...prev, { productName: '', sku: '', qty: '', unitCost: '' }]);
  }

  function removeLine(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof NewLineItem, value: string) {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [field]: value } : li)));
  }

  const totalCents = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.qty) || 0;
    const cost = parseFloat(li.unitCost) || 0;
    return sum + Math.round(qty * cost * 100);
  }, 0);

  function handleSubmit(asDraft: boolean) {
    const po: PurchaseOrder = {
      id: `po-${Date.now()}`,
      poNumber: `PO-2024-${String(Math.floor(Math.random() * 900) + 100)}`,
      supplierId,
      supplierName: selectedSupplier?.name ?? '',
      status: asDraft ? 'draft' : 'sent',
      lineItems: lineItems
        .filter((li) => li.productName)
        .map((li, i) => ({
          id: `li-new-${i}`,
          productName: li.productName,
          sku: li.sku,
          orderedQty: parseFloat(li.qty) || 0,
          receivedQty: 0,
          unitCost: Math.round(parseFloat(li.unitCost) * 100) || 0,
        })),
      totalCost: totalCents,
      expectedDate,
      shippingAddress,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    onSave(po, asDraft);
    onClose();
  }

  const step1Valid = supplierId && expectedDate && shippingAddress;
  const step2Valid = lineItems.some((li) => li.productName && li.qty && li.unitCost);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Purchase Order</h2>
            <p className="text-sm text-gray-500">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-800">
          {['Supplier', 'Items', 'Review'].map((label, i) => (
            <button
              key={label}
              onClick={() => {
                if (i + 1 < step) setStep(i + 1);
              }}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                step === i + 1
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : step > i + 1
                  ? 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  : 'text-gray-400 dark:text-gray-600'
              }`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Supplier <span className="text-red-500">*</span>
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">Select a supplier…</option>
                  {MOCK_SUPPLIERS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Expected Delivery Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Shipping Address
                </label>
                <textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium uppercase text-gray-500">
                <span className="col-span-4">Product Name</span>
                <span className="col-span-2">SKU</span>
                <span className="col-span-2">Qty</span>
                <span className="col-span-3">Unit Cost ($)</span>
                <span className="col-span-1" />
              </div>
              {lineItems.map((li, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <input
                    placeholder="Product name"
                    value={li.productName}
                    onChange={(e) => updateLine(idx, 'productName', e.target.value)}
                    className="col-span-4 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <input
                    placeholder="SKU"
                    value={li.sku}
                    onChange={(e) => updateLine(idx, 'sku', e.target.value)}
                    className="col-span-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <input
                    type="number"
                    placeholder="0"
                    value={li.qty}
                    onChange={(e) => updateLine(idx, 'qty', e.target.value)}
                    className="col-span-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={li.unitCost}
                    onChange={(e) => updateLine(idx, 'unitCost', e.target.value)}
                    className="col-span-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <button
                    onClick={() => removeLine(idx)}
                    disabled={lineItems.length === 1}
                    className="col-span-1 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={addLine}
                className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700"
              >
                <Plus className="h-4 w-4" /> Add Line Item
              </button>
              <div className="mt-2 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                Total: <span className="text-indigo-600">{formatCurrency(totalCents)}</span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-gray-500">Supplier</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{selectedSupplier?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Expected Date</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{expectedDate ? formatDate(expectedDate) : '—'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-gray-500">Shipping Address</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{shippingAddress}</dd>
                  </div>
                </dl>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 text-left text-xs font-medium uppercase text-gray-500">Product</th>
                    <th className="pb-2 text-right text-xs font-medium uppercase text-gray-500">Qty</th>
                    <th className="pb-2 text-right text-xs font-medium uppercase text-gray-500">Unit Cost</th>
                    <th className="pb-2 text-right text-xs font-medium uppercase text-gray-500">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lineItems.filter((li) => li.productName).map((li, i) => (
                    <tr key={i}>
                      <td className="py-2 text-gray-900 dark:text-white">{li.productName}</td>
                      <td className="py-2 text-right text-gray-600 dark:text-gray-400">{li.qty}</td>
                      <td className="py-2 text-right text-gray-600 dark:text-gray-400">${parseFloat(li.unitCost || '0').toFixed(2)}</td>
                      <td className="py-2 text-right font-medium text-gray-900 dark:text-white">
                        {formatCurrency(Math.round((parseFloat(li.qty) || 0) * (parseFloat(li.unitCost) || 0) * 100))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 dark:border-gray-700">
                    <td colSpan={3} className="pt-3 text-right font-semibold text-gray-900 dark:text-white">Total</td>
                    <td className="pt-3 text-right text-lg font-bold text-indigo-600">{formatCurrency(totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex gap-2">
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 1 ? !step1Valid : step === 2 ? !step2Valid : false}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleSubmit(true)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Save as Draft
                </button>
                <button
                  onClick={() => handleSubmit(false)}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <Truck className="h-4 w-4" /> Send to Supplier
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Receive Items Modal ──────────────────────────────────────────────────────

interface ReceiveModalProps {
  po: PurchaseOrder;
  onClose: () => void;
  onReceive: (poId: string, received: Record<string, number>) => void;
}

function ReceiveModal({ po, onClose, onReceive }: ReceiveModalProps) {
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(po.lineItems.map((li) => [li.id, String(li.orderedQty - li.receivedQty)])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});

  function handleSubmit() {
    const received = Object.fromEntries(
      Object.entries(quantities).map(([id, qty]) => [id, parseFloat(qty) || 0]),
    );
    onReceive(po.id, received);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Receive Items</h2>
            <p className="text-sm text-gray-500">{po.poNumber} · {po.supplierName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-6">
          <div className="space-y-4">
            {po.lineItems.map((li) => (
              <div key={li.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{li.productName}</p>
                    <p className="text-xs text-gray-400">{li.sku}</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    Ordered: {li.orderedQty} · Previously received: {li.receivedQty}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Received Qty</label>
                    <input
                      type="number"
                      min="0"
                      max={li.orderedQty - li.receivedQty}
                      value={quantities[li.id] ?? ''}
                      onChange={(e) => setQuantities((q) => ({ ...q, [li.id]: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Condition Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Good condition"
                      value={notes[li.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [li.id]: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            ))}
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
            className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Check className="h-4 w-4" /> Confirm Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FilterTab = 'all' | 'draft' | 'sent' | 'received';

export function PurchaseOrdersClient() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/proxy/purchase-orders');
        if (res.ok) {
          const json = await res.json();
          setOrders(json.data ?? MOCK_POS);
        } else {
          setOrders(MOCK_POS);
        }
      } catch {
        setOrders(MOCK_POS);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return orders;
    if (activeTab === 'received') return orders.filter((o) => o.status === 'received');
    return orders.filter((o) => o.status === activeTab);
  }, [orders, activeTab]);

  function handleNewPO(po: PurchaseOrder) {
    setOrders((prev) => [po, ...prev]);
  }

  function handleReceive(poId: string, received: Record<string, number>) {
    setOrders((prev) =>
      prev.map((po) => {
        if (po.id !== poId) return po;
        const updated = po.lineItems.map((li) => ({
          ...li,
          receivedQty: li.receivedQty + (received[li.id] ?? 0),
        }));
        const allReceived = updated.every((li) => li.receivedQty >= li.orderedQty);
        const anyReceived = updated.some((li) => li.receivedQty > 0);
        return {
          ...po,
          lineItems: updated,
          status: allReceived ? 'received' : anyReceived ? 'partial' : po.status,
        };
      }),
    );
  }

  function handleCancel(poId: string) {
    setOrders((prev) =>
      prev.map((po) => (po.id === poId ? { ...po, status: 'cancelled' } : po)),
    );
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'sent', label: 'Sent' },
    { key: 'received', label: 'Received' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Purchase Orders</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${orders.length} orders total`}
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> New Purchase Order
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">PO Number</th>
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Supplier</th>
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Items</th>
              <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Total (AUD)</th>
              <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Expected</th>
              <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: `${60 + Math.random() * 30}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.map((po) => (
                  <tr key={po.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-4">
                      <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">{po.poNumber}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">{po.supplierName}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[po.status]}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-400">
                      {po.lineItems.length}
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(po.totalCost)}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(po.expectedDate)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {(po.status === 'draft' || po.status === 'sent') && (
                          <button
                            title="View / Edit"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                          >
                            {po.status === 'draft' ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        )}
                        {(po.status === 'sent' || po.status === 'partial') && (
                          <button
                            title="Receive Items"
                            onClick={() => setReceiveTarget(po)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-green-600 dark:hover:bg-gray-800"
                          >
                            <Truck className="h-4 w-4" />
                          </button>
                        )}
                        {po.status !== 'cancelled' && po.status !== 'received' && (
                          <button
                            title="Cancel"
                            onClick={() => handleCancel(po.id)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                  No purchase orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showNewModal && (
        <NewPOModal
          onClose={() => setShowNewModal(false)}
          onSave={(po) => handleNewPO(po)}
        />
      )}
      {receiveTarget && (
        <ReceiveModal
          po={receiveTarget}
          onClose={() => setReceiveTarget(null)}
          onReceive={handleReceive}
        />
      )}
    </div>
  );
}
