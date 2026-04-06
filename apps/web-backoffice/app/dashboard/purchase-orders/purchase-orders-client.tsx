'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, ChevronRight, X, Check, Eye, Pencil, Truck,
  XCircle, Trash2, ChevronLeft, Mail, Printer, Sparkles,
  AlertTriangle, Loader2, ShoppingCart,
} from 'lucide-react';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/formatting';
import { useToast } from '@/lib/use-toast';
import { apiFetch } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type POStatus =
  | 'draft'
  | 'confirmed'
  | 'sent'
  | 'partial'
  | 'received'
  | 'closed'
  | 'cancelled';

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

// ─── AI Forecast Types ────────────────────────────────────────────────────────

interface ForecastItem {
  productId: string;
  productName: string;
  sku: string;
  currentStock: number;
  forecastedDemand: number;
  suggestedOrderQty: number;
  supplierId?: string;
  supplierName?: string;
  unitCost?: number; // cents
}

interface ForecastResponse {
  items: ForecastItem[];
  forecastDays: number;
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<POStatus, string> = {
  draft:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  confirmed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  sent:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  partial:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  received:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed:    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ─── AI Forecast Panel ────────────────────────────────────────────────────────

interface ForecastPanelProps {
  onClose: () => void;
  onAddToPO: (item: ForecastItem) => void;
}

function ForecastPanel({ onClose, onAddToPO }: ForecastPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ForecastItem[]>([]);
  const [forecastDays, setForecastDays] = useState(14);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        // Try the dedicated forecast endpoint first, fall back to AI reorder-suggestions shape
        const res = await apiFetch<ForecastResponse | { items: ForecastItem[] }>(
          'purchase-orders/forecast?days=14',
        );
        const isFull = 'forecastDays' in res;
        const fetched = isFull ? (res as ForecastResponse) : res;
        setItems(fetched.items ?? []);
        if (isFull) setForecastDays((res as ForecastResponse).forecastDays);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to load forecast data.'));
        toast({ title: 'Forecast unavailable', description: getErrorMessage(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [toast]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 sm:items-start sm:pt-16 sm:pr-6">
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900 sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">AI Demand Forecast</h2>
              <p className="text-xs text-gray-500">Products needing restock in next {forecastDays} days</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm">Analysing sales data…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-500">No restock needed in the next {forecastDays} days.</p>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.productId}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {item.productName}
                      </p>
                      <p className="text-xs text-gray-400">{item.sku}</p>
                    </div>
                    <button
                      onClick={() => { onAddToPO(item); onClose(); }}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Add to PO
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-white p-2 dark:bg-gray-800">
                      <p className="text-gray-400">Current Stock</p>
                      <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">{item.currentStock}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 dark:bg-gray-800">
                      <p className="text-gray-400">Forecast Demand</p>
                      <p className="mt-0.5 font-semibold text-amber-600">{item.forecastedDemand}</p>
                    </div>
                    <div className="rounded-lg bg-indigo-50 p-2 dark:bg-indigo-900/30">
                      <p className="text-indigo-400">Suggested Qty</p>
                      <p className="mt-0.5 font-semibold text-indigo-700 dark:text-indigo-300">{item.suggestedOrderQty}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-6 py-3 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New PO Modal ─────────────────────────────────────────────────────────────

interface NewPOModalProps {
  onClose: () => void;
  onSave: (po: PurchaseOrder) => void;
  /** Pre-fill line items from AI forecast */
  prefillItem?: ForecastItem;
}

interface NewLineItem {
  productName: string;
  sku: string;
  qty: string;
  unitCost: string;
}

function forecastItemToLine(item: ForecastItem): NewLineItem {
  return {
    productName: item.productName,
    sku: item.sku,
    qty: String(item.suggestedOrderQty),
    unitCost: item.unitCost ? (item.unitCost / 100).toFixed(2) : '',
  };
}

function NewPOModal({ onClose, onSave, prefillItem }: NewPOModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [supplierId, setSupplierId] = useState(prefillItem?.supplierId ?? '');
  const [expectedDate, setExpectedDate] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [lineItems, setLineItems] = useState<NewLineItem[]>(
    prefillItem ? [forecastItemToLine(prefillItem)] : [{ productName: '', sku: '', qty: '', unitCost: '' }],
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    apiFetch<Supplier[] | { data: Supplier[] }>('suppliers')
      .then((json) => setSuppliers(Array.isArray(json) ? json : (json.data ?? [])))
      .catch(() => setSuppliers([]));
  }, []);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

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

  async function handleSubmit(asDraft: boolean) {
    setSaveError('');
    setSaving(true);
    const payload = {
      supplierId,
      supplierName: selectedSupplier?.name ?? '',
      status: asDraft ? 'draft' : 'confirmed',
      expectedDate,
      shippingAddress,
      lineItems: lineItems
        .filter((li) => li.productName)
        .map((li) => ({
          productName: li.productName,
          sku: li.sku,
          orderedQty: parseFloat(li.qty) || 0,
          unitCost: Math.round(parseFloat(li.unitCost) * 100) || 0,
        })),
    };
    try {
      const json = await apiFetch<{ data?: PurchaseOrder } | PurchaseOrder>('purchase-orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const saved = ('data' in json && json.data) ? json.data : json as PurchaseOrder;
      toast({
        title: asDraft ? 'Draft saved' : 'PO confirmed',
        description: `Purchase order ${saved.poNumber} ${asDraft ? 'saved as draft' : 'confirmed'}.`,
        variant: 'success',
      });
      onSave(saved);
      onClose();
    } catch (err) {
      setSaveError(getErrorMessage(err, 'Failed to create purchase order.'));
    } finally {
      setSaving(false);
    }
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
              onClick={() => { if (i + 1 < step) setStep(i + 1); }}
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
                  {suppliers.map((s) => (
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
                {saveError && (
                  <p className="w-full text-sm text-red-600 dark:text-red-400">{saveError}</p>
                )}
                <button
                  onClick={() => void handleSubmit(true)}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save as Draft'}
                </button>
                <button
                  onClick={() => void handleSubmit(false)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> {saving ? 'Confirming…' : 'Confirm PO'}
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
  onReceived: (updatedPO: PurchaseOrder) => void;
}

function ReceiveModal({ po, onClose, onReceived }: ReceiveModalProps) {
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(po.lineItems.map((li) => [li.id, String(li.orderedQty - li.receivedQty)])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    const items = po.lineItems.map((li) => ({
      id: li.id,
      qtyReceived: parseFloat(quantities[li.id] ?? '0') || 0,
    }));
    try {
      const result = await apiFetch<{ data?: PurchaseOrder } | PurchaseOrder>(
        `purchase-orders/${po.id}/receive`,
        {
          method: 'POST',
          body: JSON.stringify({ items }),
        },
      );
      const updated = ('data' in result && result.data) ? result.data : result as PurchaseOrder;

      // Also update local stock levels
      const stockItems = po.lineItems
        .filter((li) => (parseFloat(quantities[li.id] ?? '0') || 0) > 0)
        .map((li) => ({
          productName: li.productName,
          sku: li.sku,
          qty: parseFloat(quantities[li.id] ?? '0') || 0,
          notes: notes[li.id] ?? '',
        }));
      if (stockItems.length > 0) {
        try {
          await apiFetch<unknown>('stock/receive', {
            method: 'POST',
            body: JSON.stringify({ poId: po.id, items: stockItems }),
          });
        } catch {
          // Non-fatal — PO receive already succeeded
        }
      }

      toast({
        title: 'Stock received',
        description: `${items.filter((i) => i.qtyReceived > 0).length} item(s) received for ${po.poNumber}.`,
        variant: 'success',
      });
      onReceived(updated);
      onClose();
    } catch (err) {
      toast({
        title: 'Receive failed',
        description: getErrorMessage(err, 'Could not record receipt. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
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
                    Ordered: {li.orderedQty} · Prev. received: {li.receivedQty}
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
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Confirm Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FilterTab = 'all' | 'draft' | 'confirmed' | 'sent' | 'received';

export function PurchaseOrdersClient() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [forecastPrefill, setForecastPrefill] = useState<ForecastItem | undefined>(undefined);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  // Auto-open create modal when navigated with ?action=new (e.g. from Inventory "Create PO")
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowNewModal(true);
    }
  }, [searchParams]);

  useEffect(() => {
    async function load() {
      try {
        const json = await apiFetch<{ data: PurchaseOrder[] } | PurchaseOrder[]>('purchase-orders');
        const data = Array.isArray(json) ? json : (json.data ?? []);
        setOrders(data);
      } catch {
        setOrders([]);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return orders;
    if (activeTab === 'received') return orders.filter((o) => o.status === 'received');
    return orders.filter((o) => o.status === activeTab);
  }, [orders, activeTab]);

  function handleNewPO(po: PurchaseOrder) {
    setOrders((prev) => [po, ...prev]);
  }

  function handleReceived(updatedPO: PurchaseOrder) {
    setOrders((prev) => prev.map((o) => (o.id === updatedPO.id ? updatedPO : o)));
  }

  async function handleEmailSupplier(po: PurchaseOrder) {
    setEmailingId(po.id);
    try {
      await apiFetch<unknown>(`purchase-orders/${po.id}/email`, { method: 'POST' });
      toast({
        title: 'Email sent',
        description: `PO ${po.poNumber} emailed to ${po.supplierName}.`,
        variant: 'success',
      });
      // Advance status draft→confirmed→sent if it was confirmed
      if (po.status === 'confirmed') {
        setOrders((prev) =>
          prev.map((o) => (o.id === po.id ? { ...o, status: 'sent' } : o)),
        );
      }
    } catch (err) {
      toast({
        title: 'Email failed',
        description: getErrorMessage(err, 'Could not send email to supplier.'),
        variant: 'destructive',
      });
    } finally {
      setEmailingId(null);
    }
  }

  async function handlePrintPO(po: PurchaseOrder) {
    setPrintingId(po.id);
    try {
      // Try to fetch a PDF blob; fall back to window.print()
      const res = await fetch(`/api/proxy/purchase-orders/${po.id}/pdf`);
      if (res.ok && res.headers.get('content-type')?.includes('pdf')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${po.poNumber}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'PDF downloaded', description: `${po.poNumber}.pdf`, variant: 'success' });
      } else {
        window.print();
      }
    } catch {
      // PDF endpoint not available — fall back to browser print
      window.print();
    } finally {
      setPrintingId(null);
    }
  }

  function handleCancel(poId: string) {
    setOrders((prev) =>
      prev.map((po) => (po.id === poId ? { ...po, status: 'cancelled' } : po)),
    );
  }

  function handleForecastAddToPO(item: ForecastItem) {
    setForecastPrefill(item);
    setShowForecast(false);
    setShowNewModal(true);
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'draft',     label: 'Draft' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'sent',      label: 'Sent' },
    { key: 'received',  label: 'Received' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Purchase Orders</h2>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${orders.length} orders total`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForecast(true)}
            className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
          >
            <Sparkles className="h-4 w-4" /> AI Forecast
          </button>
          <button
            onClick={() => { setForecastPrefill(undefined); setShowNewModal(true); }}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> New Purchase Order
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800 w-fit flex-wrap">
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
        <div className="overflow-x-auto">
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
                          <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">{po.poNumber}</span>
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
                          {/* View / Edit */}
                          {(po.status === 'draft' || po.status === 'confirmed') && (
                            <button
                              title={po.status === 'draft' ? 'Edit Draft' : 'View PO'}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            >
                              {po.status === 'draft' ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          )}
                          {po.status === 'sent' && (
                            <button
                              title="View PO"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}

                          {/* Receive Stock */}
                          {(po.status === 'sent' || po.status === 'partial') && (
                            <button
                              title="Receive Stock"
                              onClick={() => setReceiveTarget(po)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-green-600 dark:hover:bg-gray-800 dark:hover:text-green-400"
                            >
                              <Truck className="h-4 w-4" />
                            </button>
                          )}

                          {/* Email Supplier */}
                          {(po.status === 'confirmed' || po.status === 'sent') && (
                            <button
                              title="Email Supplier"
                              disabled={emailingId === po.id}
                              onClick={() => void handleEmailSupplier(po)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                            >
                              {emailingId === po.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Mail className="h-4 w-4" />
                              }
                            </button>
                          )}

                          {/* Print / PDF */}
                          {po.status !== 'cancelled' && (
                            <button
                              title="Print / Download PDF"
                              disabled={printingId === po.id}
                              onClick={() => void handlePrintPO(po)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            >
                              {printingId === po.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Printer className="h-4 w-4" />
                              }
                            </button>
                          )}

                          {/* Cancel */}
                          {po.status !== 'cancelled' && po.status !== 'received' && po.status !== 'closed' && (
                            <button
                              title="Cancel PO"
                              onClick={() => handleCancel(po.id)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800 dark:hover:text-red-400"
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
      </div>

      {/* Modals / Panels */}
      {showForecast && (
        <ForecastPanel
          onClose={() => setShowForecast(false)}
          onAddToPO={handleForecastAddToPO}
        />
      )}
      {showNewModal && (
        <NewPOModal
          onClose={() => { setShowNewModal(false); setForecastPrefill(undefined); }}
          onSave={handleNewPO}
          prefillItem={forecastPrefill}
        />
      )}
      {receiveTarget && (
        <ReceiveModal
          po={receiveTarget}
          onClose={() => setReceiveTarget(null)}
          onReceived={handleReceived}
        />
      )}
    </div>
  );
}
