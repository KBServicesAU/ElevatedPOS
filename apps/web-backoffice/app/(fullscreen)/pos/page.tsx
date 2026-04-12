'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, CreditCard, ShoppingCart,
  Search, X, Minus, Plus, Trash2, ChefHat, Tablet,
  User, Settings, Banknote, DollarSign, LogOut,
  PauseCircle, ListOrdered, RefreshCw, CheckSquare, Square, Lock,
} from 'lucide-react';
import DevicePairingScreen from '@/components/device-pairing-screen';
import { getDeviceToken, getDeviceInfo, fetchWithDeviceAuth, type DeviceInfo } from '@/lib/device-auth';
import { StaffScreen, type StaffMember } from './staff-screen';
import { CartItemModal, type CartItemDiscount } from './cart-item-modal';
import { ProductDetailSheet } from './product-detail-sheet';
import { CustomerSearchModal, type Customer } from './customer-search-modal';
import { FloatEntryModal } from './float-entry-modal';
import { AdjustFloatModal } from './adjust-float-modal';
import { SettingsModal } from './settings-modal';
import { usePrinter } from './printer-context';
import {
  getTillSession, createTillSession, addTillAdjustment, clearTillSession, type TillSession,
} from './till-session';
import { useToast } from '@/lib/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number; // GST-inclusive
  category: string;
  emoji: string;
  description?: string;
  sku?: string;
}

interface CartItem extends Product {
  qty: number;
  cartKey: string;
  discount?: CartItemDiscount;
  note?: string;
}

interface ApiProduct {
  id: string;
  name: string;
  price?: number; // cents, GST-inclusive (legacy)
  basePrice?: string | number; // decimal string from catalog API, e.g. "15.0000"
  categoryId?: string;
  categoryName?: string;
  status?: string;
  description?: string;
  sku?: string;
}

interface ApiCategory {
  id: string;
  name: string;
}

interface HeldOrder {
  key: string;
  cart: CartItem[];
  parkedAt: number;
  total: number;
}

// ─── GST helpers (Australian GST-inclusive pricing) ──────────────────────────

/** Given a GST-inclusive price, return the GST component (price / 11). */
function gstComponent(inclusivePrice: number) {
  return Math.round((inclusivePrice / 11) * 100) / 100;
}

/** Effective cart item total after discount. */
function itemTotal(item: CartItem): number {
  const base = item.price * item.qty;
  if (!item.discount) return base;
  if (item.discount.type === 'pct') return base * (1 - item.discount.value / 100);
  return Math.max(0, base - item.discount.value);
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const CART_KEY = 'elevatedpos_cart';
const HELD_PREFIX = 'elevatedpos_held_';
const OFFLINE_QUEUE_KEY = 'pos_offline_queue';

// ─── Offline queue helpers ────────────────────────────────────────────────────

interface OfflineTransaction {
  id: string;
  queuedAt: number;
  payload: unknown;
}

function getOfflineQueue(): OfflineTransaction[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineTransaction[];
  } catch { return []; }
}

function addToOfflineQueue(payload: unknown) {
  try {
    const queue = getOfflineQueue();
    queue.push({ id: `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`, queuedAt: Date.now(), payload });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* ignore */ }
}

function clearOfflineQueue() {
  try { localStorage.removeItem(OFFLINE_QUEUE_KEY); } catch { /* ignore */ }
}

function saveCart(cart: CartItem[]) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
}

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch { return []; }
}

function clearCart() {
  try { localStorage.removeItem(CART_KEY); } catch { /* ignore */ }
}

function getHeldOrders(): HeldOrder[] {
  try {
    const orders: HeldOrder[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(HELD_PREFIX)) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw) as HeldOrder;
          orders.push(parsed);
        }
      }
    }
    return orders.sort((a, b) => b.parkedAt - a.parkedAt);
  } catch { return []; }
}

function removeHeldOrder(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ─── Mock catalogue ───────────────────────────────────────────────────────────

const MOCK_PRODUCTS: Product[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Flat White',    price: 5.50,  category: 'Coffee',   emoji: '☕', description: 'Single origin espresso, steamed milk', sku: 'FLAT-WHITE' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Iced Latte',    price: 6.00,  category: 'Coffee',   emoji: '🥤', description: 'Cold espresso over ice', sku: 'ICED-LATTE' },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Cold Brew',     price: 5.00,  category: 'Coffee',   emoji: '🧊', description: '12-hour cold brew', sku: 'COLD-BREW' },
  { id: '00000000-0000-0000-0000-000000000004', name: 'Pour Over',     price: 8.00,  category: 'Coffee',   emoji: '☕', description: 'Single origin pour over', sku: 'POUR-OVER' },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Croissant',     price: 4.00,  category: 'Pastries', emoji: '🥐', description: 'Buttery French croissant', sku: 'CROISSANT' },
  { id: '00000000-0000-0000-0000-000000000006', name: 'Banana Bread',  price: 4.50,  category: 'Pastries', emoji: '🍞', description: 'House-made banana bread', sku: 'BANANA-BREAD' },
  { id: '00000000-0000-0000-0000-000000000007', name: 'Avocado Toast', price: 14.50, category: 'Food',     emoji: '🥑', description: 'Sourdough, avocado, dukkah', sku: 'AVO-TOAST' },
  { id: '00000000-0000-0000-0000-000000000008', name: 'Eggs Benedict', price: 18.00, category: 'Food',     emoji: '🍳', description: 'Poached eggs, hollandaise', sku: 'EGGS-BEN' },
];

const MOCK_CATEGORIES = ['All', 'Coffee', 'Pastries', 'Food'];

// ─── App switcher bar ────────────────────────────────────────────────────────

const APPS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', color: 'bg-indigo-500' },
  { id: 'pos',       label: 'POS',       icon: CreditCard,      href: '/pos',       color: 'bg-emerald-500' },
  { id: 'kds',       label: 'KDS',       icon: ChefHat,         href: '/kds',       color: 'bg-orange-500' },
  { id: 'kiosk',     label: 'Kiosk',     icon: Tablet,          href: '/kiosk',     color: 'bg-yellow-500' },
] as const;

function AppBar({
  current,
  deviceLabel,
  staff,
  onStaffLogout,
  onSettings,
  onNoSale,
  onCloseTill,
}: {
  current: string;
  deviceLabel?: string;
  staff?: StaffMember | null;
  onStaffLogout?: () => void;
  onSettings?: () => void;
  onNoSale?: () => void;
  onCloseTill?: () => void;
}) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-[#2a2a3a] bg-[#1a1a2a] px-4">
      <div className="flex items-center gap-1">
        {APPS.map((app) => {
          const Icon = app.icon;
          const active = app.id === current;
          return (
            <Link
              key={app.id}
              href={app.href}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? 'bg-[#2a2a3a] text-white' : 'text-gray-500 hover:bg-[#2a2a3a] hover:text-gray-200'
              }`}
            >
              <Icon className="h-3 w-3" />
              {app.label}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        {onCloseTill && (
          <button
            onClick={onCloseTill}
            title="Close Till / Z-Report"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-amber-500 hover:bg-[#2a2a3a] hover:text-amber-300"
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Close Till</span>
          </button>
        )}
        {onNoSale && (
          <button
            onClick={onNoSale}
            title="No Sale (open drawer)"
            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-[#2a2a3a] hover:text-gray-200"
          >
            <Banknote className="h-3.5 w-3.5" />
          </button>
        )}
        {onSettings && (
          <button
            onClick={onSettings}
            title="Settings"
            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-[#2a2a3a] hover:text-gray-200"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}
        {deviceLabel && (
          <span className="rounded-md bg-[#2a2a3a] px-2 py-0.5 font-mono text-[10px] text-indigo-300">
            {deviceLabel}
          </span>
        )}
        {staff && (
          <div className="flex items-center gap-1.5 rounded-md bg-[#2a2a3a] px-2 py-0.5">
            <User className="h-3 w-3 text-indigo-300" />
            <span className="text-[10px] text-gray-300">
              {staff.firstName} {staff.lastName[0]}.
            </span>
            <button onClick={onStaffLogout} title="Switch staff" className="text-gray-500 hover:text-gray-300">
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Close Till / Z-Report Modal ─────────────────────────────────────────────

function CloseTillModal({
  tillSession,
  cashSales,
  onClose,
}: {
  tillSession: TillSession;
  cashSales: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [countedStr, setCountedStr] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openingFloat = tillSession.openingFloat;
  const expectedCash = openingFloat + cashSales;
  const counted = Number(countedStr) || 0;
  const variance = counted > 0 ? counted - expectedCash : null;

  const handleCloseTill = async () => {
    if (!countedStr) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/proxy/till-sessions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: tillSession.sessionId,
          openingFloat,
          expectedCash,
          countedCash: counted,
          variance: variance ?? 0,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Till close failed: ${res.status}`);

      // Print Z-Report
      window.print();

      clearTillSession();
      toast({ title: 'Till closed. Z-Report printed.', variant: 'success' });
      onClose();
    } catch (err) {
      console.error('Till close error:', err);
      toast({
        title: 'Failed to close till',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-[#1a1a2e] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a3a] px-5 py-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Close Till</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[#2a2a3a] hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Summary rows */}
          <div className="rounded-xl bg-[#0f0f1a] px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Opening float</span>
              <span className="font-semibold text-white">${openingFloat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Total cash sales</span>
              <span className="font-semibold text-white">${cashSales.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-[#2a2a3a] pt-2 text-gray-300 font-medium">
              <span>Expected in drawer</span>
              <span className="font-bold text-white">${expectedCash.toFixed(2)}</span>
            </div>
          </div>

          {/* Counted cash input */}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">
              Counted Cash
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl bg-[#2a2a3a] px-4 py-3 text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="$0.00"
              value={countedStr}
              onChange={(e) => setCountedStr(e.target.value)}
            />
          </div>

          {/* Variance */}
          {variance !== null && (
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
              variance === 0
                ? 'border-green-700 bg-green-950/40 text-green-300'
                : variance > 0
                ? 'border-blue-700 bg-blue-950/40 text-blue-300'
                : 'border-red-700 bg-red-950/40 text-red-300'
            }`}>
              <span className="text-sm font-medium">Variance</span>
              <span className="text-lg font-bold">
                {variance >= 0 ? '+' : ''}${variance.toFixed(2)}
              </span>
            </div>
          )}

          {/* Reason */}
          {variance !== null && variance !== 0 && (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">
                Reason for variance
              </label>
              <textarea
                rows={2}
                className="w-full rounded-xl bg-[#2a2a3a] px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                placeholder="Explain any cash discrepancy…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          <button
            onClick={() => { void handleCloseTill(); }}
            disabled={!countedStr || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-40"
          >
            <Lock className="h-4 w-4" />
            {submitting ? 'Closing…' : 'Close Till & Print Z-Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Held Orders Modal ────────────────────────────────────────────────────────

function HeldOrdersModal({
  onRestore,
  onClose,
}: {
  onRestore: (order: HeldOrder) => void;
  onClose: () => void;
}) {
  const [orders, setOrders] = useState<HeldOrder[]>([]);

  useEffect(() => {
    setOrders(getHeldOrders());
  }, []);

  const handleRestore = (order: HeldOrder) => {
    removeHeldOrder(order.key);
    onRestore(order);
  };

  const handleDelete = (key: string) => {
    removeHeldOrder(key);
    setOrders((prev) => prev.filter((o) => o.key !== key));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-[#1a1a2e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a2a3a] px-5 py-4">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">Held Orders</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[#2a2a3a] hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto px-5 py-4">
          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No held orders</p>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => {
                const itemCount = order.cart.reduce((s, i) => s + i.qty, 0);
                const timeAgo = Math.round((Date.now() - order.parkedAt) / 60000);
                return (
                  <div
                    key={order.key}
                    className="flex items-center gap-3 rounded-xl bg-[#2a2a3a] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">
                        {itemCount} item{itemCount !== 1 ? 's' : ''} — ${order.total.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Parked {timeAgo < 1 ? 'just now' : `${timeAgo}m ago`}
                      </p>
                      <p className="truncate text-xs text-gray-400">
                        {order.cart.map((i) => i.name).join(', ')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleRestore(order)}
                        className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => handleDelete(order.key)}
                        className="rounded-lg bg-[#1a1a2e] px-2.5 py-1 text-xs text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Refund Modal ─────────────────────────────────────────────────────────────

interface RefundOrderLine {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

interface RefundOrder {
  id: string;
  orderNumber: string;
  total: number;
  lines: RefundOrderLine[];
}

function RefundModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [orderNumberInput, setOrderNumberInput] = useState('');
  const [fetchingOrder, setFetchingOrder] = useState(false);
  const [order, setOrder] = useState<RefundOrder | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [refundComplete, setRefundComplete] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);

  const handleLookup = async () => {
    if (!orderNumberInput.trim()) return;
    setFetchingOrder(true);
    setOrder(null);
    setSelectedLines(new Set());
    try {
      const res = await fetchWithDeviceAuth(
        `/api/proxy/orders?orderNumber=${encodeURIComponent(orderNumberInput.trim())}`,
      );
      if (!res.ok) throw new Error('Order not found');
      const data = await res.json() as { data?: RefundOrder[]; id?: string; orderNumber?: string; total?: number; lines?: RefundOrderLine[] };
      // Handle both array and single object response shapes
      const found: RefundOrder | null =
        Array.isArray(data.data) && data.data.length > 0
          ? data.data[0]
          : data.id
          ? { id: data.id, orderNumber: data.orderNumber ?? orderNumberInput, total: data.total ?? 0, lines: data.lines ?? [] }
          : null;
      if (!found) throw new Error('Order not found');
      setOrder(found);
      // Pre-select all lines
      setSelectedLines(new Set(found.lines.map((l) => l.id)));
    } catch (err) {
      toast({ title: 'Order not found', description: String(err instanceof Error ? err.message : err), variant: 'destructive' });
    } finally {
      setFetchingOrder(false);
    }
  };

  const toggleLine = (id: string) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const calcRefundAmount = (): number => {
    if (!order) return 0;
    return order.lines
      .filter((l) => selectedLines.has(l.id))
      .reduce((s, l) => s + l.unitPrice * l.qty, 0);
  };

  const handleProcessRefund = async () => {
    if (!order || selectedLines.size === 0) return;
    const amount = calcRefundAmount();
    setRefundAmount(amount);
    setProcessing(true);
    try {
      const res = await fetchWithDeviceAuth(`/api/proxy/orders/${order.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: order.lines
            .filter((l) => selectedLines.has(l.id))
            .map((l) => ({ lineId: l.id, qty: l.qty })),
          reason: 'POS refund',
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(errData.message ?? 'Refund failed');
      }
      setRefundComplete(true);
      toast({ title: 'Refund processed', description: `$${amount.toFixed(2)} refunded`, variant: 'success' });
    } catch (err) {
      toast({ title: 'Refund failed', description: String(err instanceof Error ? err.message : err), variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-[#1a1a2e] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a3a] px-5 py-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-bold text-white">Process Refund</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[#2a2a3a] hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {refundComplete ? (
            <div className="py-6 text-center">
              <div className="mb-3 text-5xl">✅</div>
              <h3 className="mb-1 text-lg font-bold text-green-400">Refund Complete</h3>
              <p className="text-sm text-gray-400">${refundAmount.toFixed(2)} refunded</p>
              <button
                onClick={onClose}
                className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Order lookup */}
              <div className="mb-4">
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">
                  Order Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={orderNumberInput}
                    onChange={(e) => setOrderNumberInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { void handleLookup(); } }}
                    placeholder="Enter order number…"
                    className="flex-1 rounded-xl bg-[#2a2a3a] px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={() => { void handleLookup(); }}
                    disabled={fetchingOrder}
                    className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {fetchingOrder ? '…' : 'Find'}
                  </button>
                </div>
              </div>

              {order && (
                <>
                  <div className="mb-3 rounded-xl bg-[#0f0f1a] px-4 py-3">
                    <p className="text-xs text-gray-500">Order #{order.orderNumber}</p>
                    <p className="text-sm font-semibold text-white">Total: ${order.total.toFixed(2)}</p>
                  </div>

                  <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Select items to refund</p>
                  <div className="mb-4 max-h-48 space-y-1.5 overflow-y-auto">
                    {order.lines.map((line) => {
                      const selected = selectedLines.has(line.id);
                      return (
                        <button
                          key={line.id}
                          onClick={() => toggleLine(line.id)}
                          className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${
                            selected ? 'bg-indigo-950 ring-1 ring-indigo-500' : 'bg-[#2a2a3a] hover:bg-[#333347]'
                          }`}
                        >
                          {selected
                            ? <CheckSquare className="h-4 w-4 flex-shrink-0 text-indigo-400" />
                            : <Square className="h-4 w-4 flex-shrink-0 text-gray-500" />}
                          <span className="flex-1 text-sm text-white">{line.qty}× {line.name}</span>
                          <span className="text-sm font-semibold text-indigo-300">
                            ${(line.unitPrice * line.qty).toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Refund amount preview */}
                  <div className="mb-4 flex items-center justify-between rounded-xl border border-orange-900 bg-orange-950/30 px-4 py-3">
                    <span className="text-sm text-orange-300">Refund Amount</span>
                    <span className="text-lg font-bold text-orange-400">${calcRefundAmount().toFixed(2)}</span>
                  </div>

                  <button
                    onClick={() => { void handleProcessRefund(); }}
                    disabled={processing || selectedLines.size === 0}
                    className="w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-500 disabled:opacity-40"
                  >
                    {processing ? 'Processing…' : `Process Refund $${calcRefundAmount().toFixed(2)}`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── POS terminal ─────────────────────────────────────────────────────────────

// ─── Offline/Online banner ────────────────────────────────────────────────────

function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    // Initialise from current navigator state
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, justReconnected, setJustReconnected };
}

/**
 * Sync offline transactions when connectivity is restored.
 *
 * NOTE: There is no batch /sync-offline endpoint on the orders service yet.
 * TODO (server-side): Implement POST /api/v1/orders/sync-offline that accepts
 *   { transactions: OfflineTransaction[] } and processes them atomically.
 *
 * For now we replay each queued transaction individually via the standard
 * order creation endpoint. Successfully replayed items are removed from the
 * queue so a partial failure doesn't re-submit already-synced transactions.
 */
async function syncOfflineQueue(toast: ReturnType<typeof useToast>['toast']) {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  let synced = 0;
  const remaining: OfflineTransaction[] = [];

  for (const transaction of queue) {
    try {
      const res = await fetch('/api/proxy/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction.payload),
      });
      if (res.ok) {
        synced++;
      } else {
        console.error('[POS] Offline sync failed for transaction', transaction.id, res.status);
        remaining.push(transaction);
      }
    } catch (err) {
      console.error('[POS] Offline sync network error for transaction', transaction.id, err);
      remaining.push(transaction);
    }
  }

  // Persist only the transactions that failed to sync
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  } catch { /* ignore storage errors */ }

  if (synced > 0) {
    toast({
      title: 'Offline transactions synced',
      description: `${synced} queued transaction${synced !== 1 ? 's' : ''} uploaded.`,
      variant: 'success',
    });
  }
  if (remaining.length > 0) {
    toast({
      title: 'Some transactions failed to sync',
      description: `${remaining.length} transaction${remaining.length !== 1 ? 's' : ''} could not be uploaded. Will retry on next reconnection.`,
      variant: 'destructive',
    });
  }
}

function OfflineBanner({
  isOnline,
  justReconnected,
  onDismissReconnected,
}: {
  isOnline: boolean;
  justReconnected: boolean;
  onDismissReconnected: () => void;
}) {
  useEffect(() => {
    if (!justReconnected) return;
    const timer = setTimeout(() => { onDismissReconnected(); }, 3000);
    return () => clearTimeout(timer);
  }, [justReconnected, onDismissReconnected]);

  if (isOnline && !justReconnected) return null;

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
        <span>⚠️</span>
        <span>You are offline. Transactions will be queued.</span>
      </div>
    );
  }

  // justReconnected = true
  return (
    <div className="flex items-center gap-2 bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
      <span>✓</span>
      <span>Connection restored.</span>
    </div>
  );
}

function POSTerminalInner({ deviceInfo, staff }: { deviceInfo: DeviceInfo | null; staff: StaffMember }) {
  const router = useRouter();
  const { receiptConnected, openCashDrawer: printerOpenCashDrawer, connectPrinter } = usePrinter();
  const { toast } = useToast();

  // ── Network status ────────────────────────────────────────────────────────────
  const { isOnline, justReconnected, setJustReconnected } = useNetworkStatus();

  // When we come back online, attempt to sync any queued transactions
  useEffect(() => {
    if (isOnline && justReconnected) {
      void syncOfflineQueue(toast);
    }
  }, [isOnline, justReconnected, toast]);

  // ── Cart state — initialised from localStorage on mount ──
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartRestored, setCartRestored] = useState(false);

  // Restore cart from localStorage on mount
  useEffect(() => {
    const saved = loadCart();
    if (saved.length > 0) setCart(saved);
    setCartRestored(true);
  }, []);

  // Persist cart to localStorage on every change (after initial restore)
  useEffect(() => {
    if (!cartRestored) return;
    saveCart(cart);
  }, [cart, cartRestored]);

  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [categories, setCategories] = useState<string[]>(MOCK_CATEGORIES);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Modal states
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [longPressProduct, setLongPressProduct] = useState<Product | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdjustFloat, setShowAdjustFloat] = useState(false);
  const [showHeldOrders, setShowHeldOrders] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showCloseTill, setShowCloseTill] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Till session
  const [tillSession, setTillSession] = useState<TillSession | null>(() => getTillSession());
  const [showFloatEntry, setShowFloatEntry] = useState(() => !getTillSession());

  // Staff logout callback (lifted to page level)
  const [staffLogout, setStaffLogout] = useState(false);

  // Long-press tracking
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Barcode scanner input (hidden, always focused) ────────────────────────
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef('');
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep barcode input focused when no modal is open
  const noModalOpen = !editingCartItem && !longPressProduct && !showCustomerSearch &&
    !showSettings && !showAdjustFloat && !showHeldOrders && !showRefund && !showFloatEntry && !showCloseTill;

  useEffect(() => {
    if (noModalOpen) {
      barcodeInputRef.current?.focus();
    }
  }, [noModalOpen]);

  const handleBarcodeKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const scanned = barcodeBufferRef.current.trim();
      barcodeBufferRef.current = '';
      if (barcodeTimerRef.current) {
        clearTimeout(barcodeTimerRef.current);
        barcodeTimerRef.current = null;
      }
      if (!scanned) return;

      // Search by SKU or id
      const match = products.find(
        (p) => p.sku === scanned || p.id === scanned ||
               p.sku?.toLowerCase() === scanned.toLowerCase(),
      );
      if (match) {
        setCart((prev) => {
          const existing = prev.find((i) => i.cartKey === match.id);
          if (existing) return prev.map((i) => i.cartKey === match.id ? { ...i, qty: i.qty + 1 } : i);
          return [...prev, { ...match, qty: 1, cartKey: match.id }];
        });
        toast({ title: `Added: ${match.name}`, variant: 'success', duration: 1500 });
      } else {
        toast({ title: 'Barcode not found', description: scanned, variant: 'destructive', duration: 2000 });
      }
    } else if (e.key.length === 1) {
      // Accumulate characters; reset buffer after 500ms of inactivity
      barcodeBufferRef.current += e.key;
      if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
      barcodeTimerRef.current = setTimeout(() => {
        barcodeBufferRef.current = '';
      }, 500);
    }
  }, [products, toast]);

  // Fetch catalog
  useEffect(() => {
    if (!deviceInfo) return;
    async function loadCatalog() {
      setLoadingCatalog(true);
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          fetchWithDeviceAuth('/api/proxy/catalog/products?limit=100'),
          fetchWithDeviceAuth('/api/proxy/catalog/categories'),
        ]);
        if (productsRes.ok) {
          const productsData = await productsRes.json() as { data?: ApiProduct[] };
          const apiProducts = productsData.data ?? [];
          let categoryMap: Record<string, string> = {};
          if (categoriesRes.ok) {
            const catData = await categoriesRes.json() as { data?: ApiCategory[] };
            const apiCats = catData.data ?? [];
            categoryMap = Object.fromEntries(apiCats.map((c) => [c.id, c.name]));
            setCategories(['All', ...apiCats.map((c) => c.name)]);
          }
          setProducts(apiProducts.map((p) => {
            // basePrice is stored in cents (dashboard multiplies by 100)
            const raw = p.basePrice != null
              ? (typeof p.basePrice === 'string' ? parseFloat(p.basePrice) : p.basePrice)
              : (p.price ?? 0);
            const dollars = raw / 100;
            return {
              id: p.id,
              name: p.name,
              price: isNaN(dollars) ? 0 : dollars,
              category: (p.categoryId && categoryMap[p.categoryId]) ?? p.categoryName ?? 'Other',
              emoji: '🛒',
              description: p.description,
              sku: p.sku,
            };
          }));
        }
      } catch { /* keep mock */ }
      finally { setLoadingCatalog(false); }
    }
    loadCatalog();
  }, [deviceInfo]);

  const filtered = products.filter(
    (p) => (category === 'All' || p.category === category) &&
            p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.cartKey === product.id);
      if (existing) return prev.map((i) => i.cartKey === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1, cartKey: product.id }];
    });
  }, []);

  const removeFromCart = useCallback((cartKey: string) => {
    setCart((prev) => {
      const item = prev.find((i) => i.cartKey === cartKey);
      if (!item) return prev;
      if (item.qty === 1) return prev.filter((i) => i.cartKey !== cartKey);
      return prev.map((i) => i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i);
    });
  }, []);

  // ── Park Sale ────────────────────────────────────────────────────────────────
  const handleParkSale = useCallback(() => {
    if (cart.length === 0) {
      toast({ title: 'Cart is empty', variant: 'destructive', duration: 1500 });
      return;
    }
    const key = `${HELD_PREFIX}${Date.now()}`;
    const total = cart.reduce((s, i) => s + itemTotal(i), 0);
    const held: HeldOrder = { key, cart, parkedAt: Date.now(), total };
    try { localStorage.setItem(key, JSON.stringify(held)); } catch { /* ignore */ }
    setCart([]);
    clearCart();
    toast({ title: 'Sale parked', description: `${cart.reduce((s, i) => s + i.qty, 0)} items held`, variant: 'success', duration: 2000 });
  }, [cart, toast]);

  // GST-inclusive totals
  const cartTotal = cart.reduce((sum, i) => sum + itemTotal(i), 0);
  const gst = gstComponent(cartTotal);
  const exGst = cartTotal - gst;

  const handleCharge = () => {
    if (cart.length === 0) return;

    // When offline: queue the transaction and notify the operator
    if (!isOnline) {
      addToOfflineQueue({
        items: cart.map((i) => ({
          id: i.cartKey, name: i.name, price: i.price, qty: i.qty,
          discount: i.discount ?? null,
          note: i.note ?? null,
        })),
        total: cartTotal,
        exGst,
        gst,
        customerId: selectedCustomer?.id ?? null,
        customerName: selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : null,
        staffId: staff.id,
        staffName: `${staff.firstName} ${staff.lastName}`,
        queueReason: 'offline',
      });
      toast({
        title: 'Transaction queued',
        description: 'You are offline. This transaction will be synced when you reconnect.',
        variant: 'default',
      });
      setCart([]);
      clearCart();
      return;
    }

    // Online path: proceed normally to payment screen
    clearCart();
    const params = new URLSearchParams({
      items: JSON.stringify(cart.map((i) => ({
        id: i.cartKey, name: i.name, price: i.price, qty: i.qty,
        discount: i.discount ? JSON.stringify(i.discount) : undefined,
        note: i.note,
      }))),
      total: cartTotal.toFixed(2),
      exGst: exGst.toFixed(2),
      gst: gst.toFixed(2),
      customerId: selectedCustomer?.id ?? '',
      customerName: selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : '',
      staffId: staff.id,
      staffName: `${staff.firstName} ${staff.lastName}`,
    });
    router.push(`/pos/payment?${params.toString()}`);
  };

  // No Sale — open cash drawer
  const handleNoSale = useCallback(async () => {
    if (tillSession) {
      const updated = addTillAdjustment({
        type: 'no_sale', amount: 0,
        staffId: staff.id, staffName: `${staff.firstName} ${staff.lastName}`,
      });
      if (updated) setTillSession(updated);
    }
    if (receiptConnected) {
      await printerOpenCashDrawer().catch((err) => console.error('[POS] Cash drawer open failed:', err));
    }
  }, [tillSession, staff, receiptConnected, printerOpenCashDrawer]);

  // Long-press handlers
  const handlePointerDown = useCallback((product: Product) => {
    pressTimerRef.current = setTimeout(() => {
      setLongPressProduct(product);
    }, 600);
  }, []);

  const handlePointerUp = useCallback((product: Product) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      // Short press = add to cart (only if detail sheet isn't about to show)
      if (!longPressProduct) addToCart(product);
    }
  }, [addToCart, longPressProduct]);

  const handlePointerLeave = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  const heldCount = (() => {
    try {
      return Object.keys(localStorage).filter((k) => k.startsWith(HELD_PREFIX)).length;
    } catch { return 0; }
  })();

  if (staffLogout) {
    // Signal parent to show staff selection
    return null;
  }

  return (
    <div className="relative flex h-full flex-col bg-[#1e1e2e]">
      {/* Hidden barcode scanner input — always captures keyboard when no modal open */}
      <input
        ref={barcodeInputRef}
        className="pointer-events-none absolute opacity-0"
        style={{ left: -9999, top: -9999, width: 1, height: 1 }}
        aria-hidden="true"
        tabIndex={-1}
        onKeyDown={handleBarcodeKey}
        onChange={() => { /* controlled by keydown */ }}
        value=""
        readOnly
      />

      <AppBar
        current="pos"
        deviceLabel={deviceInfo?.label ?? deviceInfo?.deviceId?.slice(0, 8)}
        staff={staff}
        onStaffLogout={() => setStaffLogout(true)}
        onSettings={() => setShowSettings(true)}
        onNoSale={handleNoSale}
        onCloseTill={
          staff.role && ['manager', 'owner', 'Manager', 'Owner'].includes(staff.role)
            ? () => setShowCloseTill(true)
            : undefined
        }
      />

      {/* Offline / reconnected banner */}
      <OfflineBanner
        isOnline={isOnline}
        justReconnected={justReconnected}
        onDismissReconnected={() => setJustReconnected(false)}
      />

      {/* POS toolbar — Park Sale, Held Orders, Refund */}
      <div className="flex items-center gap-2 border-b border-[#2a2a3a] bg-[#16161f] px-4 py-1.5">
        <button
          onClick={handleParkSale}
          disabled={cart.length === 0}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-[#2a2a3a] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PauseCircle className="h-3.5 w-3.5" />
          Park Sale
        </button>
        <button
          onClick={() => setShowHeldOrders(true)}
          className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-[#2a2a3a] hover:text-white"
        >
          <ListOrdered className="h-3.5 w-3.5" />
          Held Orders
          {heldCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
              {heldCount}
            </span>
          )}
        </button>
        <div className="ml-auto">
          <button
            onClick={() => setShowRefund(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-orange-500 hover:bg-[#2a2a3a] hover:text-orange-400"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refund
          </button>
        </div>
      </div>

      {loadingCatalog && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-3 rounded-xl bg-[#2a2a3a] px-5 py-3 text-sm text-white shadow-xl">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            Loading catalogue…
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Product panel ── */}
        <div className="flex flex-1 flex-col border-r border-[#2a2a3a] p-3">
          {/* Search */}
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#2a2a3a] px-3 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-500" />
            <input
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
              placeholder="Filter products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5 text-gray-500 hover:text-gray-300" />
              </button>
            )}
          </div>

          {/* Categories */}
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  category === cat ? 'bg-indigo-500 text-white' : 'bg-[#2a2a3a] text-gray-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product grid — tap to add, hold to view details */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4 lg:grid-cols-5">
              {filtered.map((product) => {
                const inCart = cart.find((i) => i.id === product.id);
                return (
                  <button
                    key={product.id}
                    onPointerDown={() => handlePointerDown(product)}
                    onPointerUp={() => handlePointerUp(product)}
                    onPointerLeave={handlePointerLeave}
                    className={`relative flex flex-col items-center rounded-xl p-3 text-center transition-all select-none ${
                      inCart ? 'border border-indigo-500 bg-indigo-950' : 'bg-[#2a2a3a] hover:bg-[#333347]'
                    }`}
                  >
                    <span className="mb-1 text-3xl">{product.emoji}</span>
                    <span className="text-xs font-semibold leading-tight text-white">{product.name}</span>
                    <span className="mt-1 text-xs font-bold text-indigo-300">${product.price.toFixed(2)}</span>
                    {inCart && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
                        {inCart.qty}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Cart panel ── */}
        <div className="flex w-72 flex-col bg-[#16161f] p-3 xl:w-80">
          {/* Customer header */}
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Order</h2>
            <button
              onClick={() => setShowCustomerSearch(true)}
              className="flex items-center gap-1 rounded-lg bg-[#2a2a3a] px-2.5 py-1 text-xs text-gray-400 hover:text-white"
            >
              <User className="h-3 w-3" />
              {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : 'Add customer'}
              {selectedCustomer && (
                <X
                  className="ml-1 h-3 w-3 text-gray-600 hover:text-red-400"
                  onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); }}
                />
              )}
            </button>
          </div>

          {cart.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-600">
              <ShoppingCart className="h-10 w-10" />
              <p className="text-sm">Add items to order</p>
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto">
              {cart.map((item) => (
                <button
                  key={item.cartKey}
                  onClick={() => setEditingCartItem(item)}
                  className="flex w-full items-center justify-between rounded-xl bg-[#2a2a3a] p-2.5 text-left hover:bg-[#333347]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="truncate text-sm font-medium text-white">{item.name}</p>
                      {item.discount && (
                        <span className="flex-shrink-0 rounded-full bg-yellow-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {item.discount.type === 'pct' ? `-${item.discount.value}%` : `-$${item.discount.value}`}
                        </span>
                      )}
                    </div>
                    {item.note && (
                      <p className="truncate text-xs italic text-gray-500">📝 {item.note}</p>
                    )}
                    <p className="text-xs text-indigo-300">${itemTotal(item).toFixed(2)}</p>
                  </div>
                  <div className="ml-2 flex items-center gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromCart(item.cartKey); }}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-900 text-white hover:bg-indigo-800"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-4 text-center text-sm font-bold text-white">{item.qty}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); addToCart(item); }}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-900 text-white hover:bg-indigo-800"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Totals — GST-inclusive breakdown */}
          <div className="mt-3 border-t border-[#2a2a3a] pt-3">
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>Ex-GST</span>
              <span>${exGst.toFixed(2)}</span>
            </div>
            <div className="mb-3 flex justify-between text-xs text-gray-500">
              <span>GST (10%)</span>
              <span>${gst.toFixed(2)}</span>
            </div>
            <div className="mb-1 flex justify-between border-t border-[#2a2a3a] pt-2 text-base font-bold text-white">
              <span>Total <span className="text-[10px] font-normal text-gray-500">inc. GST</span></span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>

            {/* Float adjustment button */}
            {tillSession && (
              <button
                onClick={() => setShowAdjustFloat(true)}
                className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-[#2a2a3a] py-1.5 text-xs text-gray-500 hover:text-gray-300"
              >
                <DollarSign className="h-3 w-3" />
                Adjust Float
              </button>
            )}

            <button
              onClick={handleCharge}
              disabled={cart.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3.5 text-base font-bold text-white transition-opacity disabled:opacity-40 hover:bg-indigo-400"
            >
              <CreditCard className="h-4 w-4" />
              Charge ${cartTotal.toFixed(2)}
            </button>

            {cart.length > 0 && (
              <button
                onClick={() => { setCart([]); clearCart(); }}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs text-gray-500 hover:text-gray-300"
              >
                <Trash2 className="h-3 w-3" />
                Clear order
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {showFloatEntry && (
        <div className="absolute inset-0 z-50">
          <FloatEntryModal
            onConfirm={(amount) => {
              const session = createTillSession(
                amount, staff.id, `${staff.firstName} ${staff.lastName}`,
                deviceInfo?.locationId ?? '',
              );
              setTillSession(session);
              setShowFloatEntry(false);
            }}
          />
        </div>
      )}

      {editingCartItem && (
        <CartItemModal
          item={editingCartItem}
          onApply={(discount, note) => {
            setCart((prev) =>
              prev.map((i) =>
                i.cartKey === editingCartItem.cartKey
                  ? { ...i, discount: discount ?? undefined, note: note || undefined }
                  : i,
              ),
            );
            setEditingCartItem(null);
          }}
          onClose={() => setEditingCartItem(null)}
        />
      )}

      {longPressProduct && (
        <ProductDetailSheet
          product={longPressProduct}
          onAddToCart={() => { addToCart(longPressProduct); setLongPressProduct(null); }}
          onClose={() => setLongPressProduct(null)}
        />
      )}

      {showCustomerSearch && (
        <CustomerSearchModal
          onSelect={(customer) => { setSelectedCustomer(customer); setShowCustomerSearch(false); }}
          onClose={() => setShowCustomerSearch(false)}
        />
      )}

      {showAdjustFloat && tillSession && (
        <AdjustFloatModal
          staffId={staff.id}
          staffName={`${staff.firstName} ${staff.lastName}`}
          onConfirm={(type, amount, reason) => {
            const updated = addTillAdjustment({ type, amount, reason, staffId: staff.id, staffName: `${staff.firstName} ${staff.lastName}` });
            if (updated) setTillSession(updated);
            setShowAdjustFloat(false);
          }}
          onClose={() => setShowAdjustFloat(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onConnect={(printerType, method) => connectPrinter(printerType, method).catch((err) => console.error('[POS] Printer connect failed:', err))}
          deviceInfo={deviceInfo}
          onUnpair={() => {
            import('@/lib/device-auth').then(({ clearDeviceSession }) => {
              clearDeviceSession();
              window.location.reload();
            });
          }}
        />
      )}

      {showHeldOrders && (
        <HeldOrdersModal
          onRestore={(order) => {
            setCart(order.cart);
            setShowHeldOrders(false);
          }}
          onClose={() => setShowHeldOrders(false)}
        />
      )}

      {showRefund && (
        <RefundModal onClose={() => setShowRefund(false)} />
      )}

      {showCloseTill && tillSession && (
        <CloseTillModal
          tillSession={tillSession}
          cashSales={
            // Sum all cash deposits from adjustments (no_sale and withdrawal
            // don't count as sales; cash sales are tracked externally).
            // Best-effort: use adjustments of type 'deposit' as proxy for cash
            // added. Real cash sales would come from a completed-orders total.
            tillSession.adjustments
              .filter((a) => a.type === 'deposit')
              .reduce((s, a) => s + a.amount, 0)
          }
          onClose={() => {
            setShowCloseTill(false);
            // If the session was cleared by the modal, reflect that in state
            setTillSession(getTillSession());
          }}
        />
      )}
    </div>
  );
}

function POSTerminal({ deviceInfo, staff, onStaffLogout }: { deviceInfo: DeviceInfo | null; staff: StaffMember; onStaffLogout: () => void }) {
  return (
    <POSTerminalInnerWrapper deviceInfo={deviceInfo} staff={staff} onStaffLogout={onStaffLogout} />
  );
}

function POSTerminalInnerWrapper({ deviceInfo, staff, onStaffLogout }: { deviceInfo: DeviceInfo | null; staff: StaffMember; onStaffLogout: () => void }) {
  const [staffedOut, setStaffedOut] = useState(false);
  useEffect(() => { if (staffedOut) { setStaffedOut(false); onStaffLogout(); } }, [staffedOut, onStaffLogout]);
  // Use a key to reset when staff changes
  return <POSTerminalInner key={staff.id} deviceInfo={deviceInfo} staff={staff} />;
}

// ─── Page — pairing → staff → POS ─────────────────────────────────────────────

export default function POSPage() {
  const [mounted, setMounted] = useState(false);
  const [validating, setValidating] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [paired, setPaired] = useState(false);
  const [staff, setStaff] = useState<StaffMember | null>(null);

  useEffect(() => {
    setMounted(true);
    const token = getDeviceToken();
    if (!token) return;

    // Validate the stored token against the server (heartbeat).
    // While validating, show a blank screen to avoid a flash of the pairing UI.
    setValidating(true);
    fetchWithDeviceAuth('/api/proxy/devices/heartbeat', { method: 'POST' })
      .then((r) => {
        if (r.ok) {
          setDeviceInfo(getDeviceInfo());
          setPaired(true);
        } else {
          // Token rejected — clear it so the pairing screen shows
          import('@/lib/device-auth').then(({ clearDeviceSession }) => clearDeviceSession());
        }
      })
      .catch(() => {
        // Network error — trust the local token so offline use still works
        setDeviceInfo(getDeviceInfo());
        setPaired(true);
      })
      .finally(() => setValidating(false));
  }, []);

  if (!mounted || validating) return null;

  if (!paired) {
    return (
      <DevicePairingScreen
        role="pos"
        onPaired={(info) => { setDeviceInfo(info); setPaired(true); }}
      />
    );
  }

  if (!staff) {
    return (
      <StaffScreen
        deviceInfo={deviceInfo}
        onSelect={(s) => setStaff(s)}
      />
    );
  }

  return (
    <POSTerminal
      deviceInfo={deviceInfo}
      staff={staff}
      onStaffLogout={() => setStaff(null)}
    />
  );
}
