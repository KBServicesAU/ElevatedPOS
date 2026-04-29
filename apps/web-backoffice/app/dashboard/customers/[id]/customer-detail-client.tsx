'use client';

/**
 * Customer detail page — v2.7.81.
 *
 * Shows a single customer's profile, contact details, lifetime stats,
 * and a chronological list of their orders / receipts. The list view
 * at /dashboard/customers shows just the directory; this page is
 * where merchants drill in to see "what did Sarah buy last Tuesday?"
 *
 * The transactions list re-uses the existing /api/v1/orders endpoint
 * with a customerId filter, so no new server route is required. Each
 * row links to the order's reprint / refund flow which already exists
 * at /dashboard/orders.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Mail, Phone, Calendar, ShoppingBag, DollarSign,
  TrendingUp, FileText, Edit2, Trash2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/formatting';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dob?: string | null;
  company?: string | null;
  notes?: string | null;
  totalVisits?: number;
  totalSpend?: number | string;
  loyaltyPoints?: number;
  lastVisitAt?: string | null;
  createdAt?: string;
}

interface OrderLine {
  id: string;
  name: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal?: number | string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: number | string;
  paidTotal?: number | string | null;
  paymentMethod?: string | null;
  channel?: string;
  createdAt: string;
  completedAt?: string | null;
  lines?: OrderLine[];
}

const toNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const STATUS_COLOURS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  partially_refunded: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  held: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function CustomerDetailClient({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ data: Customer } | Customer>(`customers/${customerId}`);
        const data = (res && typeof res === 'object' && 'data' in res ? res.data : res) as Customer;
        setCustomer(data ?? null);
      } catch (err) {
        toast({ title: 'Could not load customer', description: getErrorMessage(err), variant: 'destructive' });
      } finally {
        setLoadingCustomer(false);
      }
    })();
  }, [customerId, toast]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ data: Order[] } | Order[]>(
          `orders?customerId=${encodeURIComponent(customerId)}&limit=100`,
        );
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setOrders(list);
      } catch (err) {
        toast({ title: 'Could not load order history', description: getErrorMessage(err), variant: 'destructive' });
      } finally {
        setLoadingOrders(false);
      }
    })();
  }, [customerId, toast]);

  async function handleDelete() {
    if (!customer) return;
    const ok = window.confirm(`Delete ${customer.firstName} ${customer.lastName}? This cannot be undone.`);
    if (!ok) return;
    try {
      await apiFetch(`customers/${customerId}`, { method: 'DELETE' });
      toast({ title: 'Customer deleted' });
      router.push('/dashboard/customers');
    } catch (err) {
      toast({ title: 'Delete failed', description: getErrorMessage(err), variant: 'destructive' });
    }
  }

  if (loadingCustomer) {
    return (
      <div className="p-8 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />
        <p className="mt-3 text-sm text-gray-500">Loading customer…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-gray-500">Customer not found.</p>
        <Link href="/dashboard/customers" className="mt-4 inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </Link>
      </div>
    );
  }

  const fullName = `${customer.firstName} ${customer.lastName}`.trim();
  const totalSpend = toNum(customer.totalSpend);
  const totalVisits = customer.totalVisits ?? orders.length;
  const completedOrders = orders.filter((o) => o.status === 'completed' || o.status === 'paid');
  const computedSpend = completedOrders.reduce((s, o) => s + toNum(o.total), 0);
  const visibleSpend = totalSpend > 0 ? totalSpend : computedSpend;
  const aov = completedOrders.length > 0 ? visibleSpend / completedOrders.length : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href="/dashboard/customers"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{fullName}</h1>
            {customer.company && (
              <p className="mt-1 text-sm text-gray-500">{customer.company}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
              {customer.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-gray-400" /> {customer.email}
                </span>
              )}
              {customer.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-gray-400" /> {customer.phone}
                </span>
              )}
              {customer.dob && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-gray-400" /> DOB {formatDate(customer.dob)}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/dashboard/customers?edit=${customerId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Edit2 className="h-4 w-4" /> Edit
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>

        {customer.notes && (
          <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {customer.notes}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard icon={ShoppingBag} label="Orders" value={String(totalVisits)} />
        <StatCard icon={DollarSign} label="Lifetime spend" value={formatCurrency(visibleSpend)} />
        <StatCard icon={TrendingUp} label="Avg order" value={formatCurrency(aov)} />
        <StatCard icon={Calendar} label="Last visit" value={customer.lastVisitAt ? formatDate(customer.lastVisitAt) : '—'} />
      </div>

      {/* Orders list */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">Transactions & receipts</h2>
          <span className="text-xs text-gray-500">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
        </div>

        {loadingOrders ? (
          <div className="p-8 text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />
            <p className="mt-2 text-xs text-gray-500">Loading transactions…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No orders yet for this customer.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {orders.map((o) => {
              const total = toNum(o.total);
              const paid = toNum(o.paidTotal);
              const remaining = Math.max(0, total - paid);
              const colour = STATUS_COLOURS[o.status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
              return (
                <li key={o.id}>
                  <Link
                    href={`/dashboard/orders?focus=${o.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-900 dark:text-white">#{o.orderNumber}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colour}`}>
                          {o.status.replace('_', ' ')}
                        </span>
                        {o.paymentMethod && (
                          <span className="text-xs text-gray-500">· {o.paymentMethod}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {formatDate(o.completedAt ?? o.createdAt)}
                        {o.lines && o.lines.length > 0 && (
                          <span> · {o.lines.length} item{o.lines.length === 1 ? '' : 's'}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(total)}
                      </p>
                      {remaining > 0 ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {formatCurrency(remaining)} owing
                        </p>
                      ) : paid > 0 ? (
                        <p className="text-xs text-green-600 dark:text-green-400">Paid</p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1.5 text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
