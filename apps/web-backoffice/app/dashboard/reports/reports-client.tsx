'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Download, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, BarChart2,
  Calendar, Printer, X, Check, Clock, Mail, ChevronDown, Columns2,
  FileText, AlertCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderLine {
  id: string;
  name: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: string | number;
  channel: string;
  customerId?: string;
  createdAt: string;
  lines?: OrderLine[];
  paymentMethod?: string;
}

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

interface ScheduledReport {
  id: string;
  type: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  email: string;
  dayOfWeek?: string;
  startDate: string;
  createdAt: string;
}

interface ZReportData {
  date?: string;
  totalSales?: number;
  totalRefunds?: number;
  netSales?: number;
  cashCollected?: number;
  cardCollected?: number;
  totalTransactions?: number;
  gstCollected?: number;
  openingFloat?: number;
  closingFloat?: number;
}

interface BASReportData {
  gstCollected?: number;
  gstPaid?: number;
  netGst?: number;
}

// ─── Menu Engineering Types ───────────────────────────────────────────────────

interface MenuEngineeringProduct {
  productId: string;
  name: string;
  category: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  margin: number;       // decimal e.g. 0.45
  contribution: number; // margin * revenue
}

type MenuQuadrant = 'stars' | 'plowhorses' | 'puzzles' | 'dogs';

interface MenuProduct extends MenuEngineeringProduct {
  quadrant: MenuQuadrant;
  marginPct: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateBounds(range: DateRange, customFrom?: string, customTo?: string): { from: string; to: string; label: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (range === 'today') {
    const start = startOfDay(now);
    return { from: start.toISOString(), to: now.toISOString(), label: now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
  }
  if (range === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const start = startOfDay(yest);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString(), label: yest.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
  }
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: startOfDay(start).toISOString(), to: now.toISOString(), label: 'Last 7 Days' };
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.toISOString(), to: now.toISOString(), label: 'This Month' };
  }
  if (range === 'quarter') {
    const month = now.getMonth();
    const quarterStart = Math.floor(month / 3) * 3;
    const start = new Date(now.getFullYear(), quarterStart, 1);
    return { from: start.toISOString(), to: now.toISOString(), label: 'This Quarter' };
  }
  if (range === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: start.toISOString(), to: now.toISOString(), label: 'This Year' };
  }
  if (customFrom && customTo) {
    const from = new Date(customFrom);
    const to = new Date(customTo);
    to.setHours(23, 59, 59, 999);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      label: `${from.toLocaleDateString('en-AU')} – ${new Date(customTo).toLocaleDateString('en-AU')}`,
    };
  }
  return { from: startOfDay(now).toISOString(), to: now.toISOString(), label: 'Today' };
}

function fmt(amount: number | string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
    typeof amount === 'string' ? parseFloat(amount) : amount,
  );
}

function getHour(iso: string): number {
  return new Date(iso).getHours();
}

function orderTotal(o: Order): number {
  return typeof o.total === 'string' ? parseFloat(o.total) : o.total;
}

// ─── Derived data builders ────────────────────────────────────────────────────

function buildKpis(orders: Order[], prevOrders: Order[]) {
  const completed = orders.filter((o) => o.status === 'completed');
  const prevCompleted = prevOrders.filter((o) => o.status === 'completed');

  const grossRevenue = completed.reduce((s, o) => s + orderTotal(o), 0);
  const prevGross = prevCompleted.reduce((s, o) => s + orderTotal(o), 0);

  const pct = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? '+100%' : '0%';
    const change = ((curr - prev) / prev) * 100;
    return (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
  };

  const txCount = completed.length;
  const prevTxCount = prevCompleted.length;
  const avgOrderValue = txCount > 0 ? grossRevenue / txCount : 0;
  const prevAvgOrderValue = prevTxCount > 0 ? prevGross / prevTxCount : 0;

  const uniqueCustomers = new Set(completed.map((o) => o.customerId).filter(Boolean)).size;
  const prevUniqueCustomers = new Set(prevCompleted.map((o) => o.customerId).filter(Boolean)).size;

  return [
    { label: 'Gross Revenue', value: fmt(grossRevenue), rawValue: grossRevenue, prevValue: prevGross, change: pct(grossRevenue, prevGross), up: grossRevenue >= prevGross, icon: DollarSign },
    { label: 'Transactions', value: txCount.toLocaleString(), rawValue: txCount, prevValue: prevTxCount, change: pct(txCount, prevTxCount), up: txCount >= prevTxCount, icon: ShoppingCart },
    { label: 'Avg Order Value', value: fmt(avgOrderValue), rawValue: avgOrderValue, prevValue: prevAvgOrderValue, change: pct(avgOrderValue, prevAvgOrderValue), up: avgOrderValue >= prevAvgOrderValue, icon: BarChart2 },
    { label: 'Unique Customers', value: uniqueCustomers.toLocaleString(), rawValue: uniqueCustomers, prevValue: prevUniqueCustomers, change: pct(uniqueCustomers, prevUniqueCustomers), up: uniqueCustomers >= prevUniqueCustomers, icon: Users },
  ];
}

function buildHourlyRevenue(orders: Order[], range: DateRange) {
  const completed = orders.filter((o) => o.status === 'completed');

  if (range === 'today' || range === 'yesterday') {
    const hours: Record<number, number> = {};
    for (let h = 6; h <= 21; h++) hours[h] = 0;
    for (const o of completed) {
      const h = getHour(o.createdAt);
      if (h >= 6 && h <= 21) hours[h] += orderTotal(o);
    }
    return Object.entries(hours).map(([h, revenue]) => ({
      hour: Number(h) < 12 ? `${h}am` : Number(h) === 12 ? '12pm' : `${Number(h) - 12}pm`,
      revenue,
    }));
  }

  const days: Record<string, number> = {};
  for (const o of completed) {
    const day = o.createdAt.split('T')[0];
    days[day] = (days[day] ?? 0) + orderTotal(o);
  }
  return Object.entries(days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, revenue]) => ({
      hour: new Date(day).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      revenue,
    }));
}

function buildTopProducts(orders: Order[]) {
  const completed = orders.filter((o) => o.status === 'completed' && o.lines);
  const productMap: Record<string, { name: string; units: number; revenue: number }> = {};

  for (const o of completed) {
    for (const line of o.lines ?? []) {
      if (!productMap[line.name]) {
        productMap[line.name] = { name: line.name, units: 0, revenue: 0 };
      }
      productMap[line.name].units += parseInt(line.quantity, 10);
      productMap[line.name].revenue += parseFloat(line.lineTotal);
    }
  }

  const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const maxRevenue = products[0]?.revenue ?? 1;

  return products.map((p) => ({
    name: p.name,
    units: p.units,
    revenue: fmt(p.revenue),
    share: Math.round((p.revenue / maxRevenue) * 100),
  }));
}

function buildChannelBreakdown(orders: Order[]) {
  const completed = orders.filter((o) => o.status === 'completed');
  const channelMap: Record<string, number> = {};

  for (const o of completed) {
    const ch = o.channel ?? 'other';
    channelMap[ch] = (channelMap[ch] ?? 0) + orderTotal(o);
  }

  const total = Object.values(channelMap).reduce((s, v) => s + v, 0) || 1;
  const labels: Record<string, string> = {
    pos: 'In-Store POS', online: 'Online', kiosk: 'Kiosk', qr: 'QR Order',
    marketplace: 'Marketplace', delivery: 'Delivery', phone: 'Phone',
  };

  return Object.entries(channelMap)
    .sort(([, a], [, b]) => b - a)
    .map(([ch, amount]) => ({
      method: labels[ch] ?? ch,
      amount: fmt(amount),
      pct: Math.round((amount / total) * 100),
    }));
}

function buildPaymentMethods(orders: Order[]) {
  const completed = orders.filter((o) => o.status === 'completed');
  const pmMap: Record<string, number> = {};

  for (const o of completed) {
    const pm = o.paymentMethod ?? 'other';
    pmMap[pm] = (pmMap[pm] ?? 0) + orderTotal(o);
  }

  const total = Object.values(pmMap).reduce((s, v) => s + v, 0) || 1;
  const labels: Record<string, string> = {
    card: 'Card', cash: 'Cash', store_credit: 'Store Credit',
    gift_card: 'Gift Card', bnpl: 'BNPL', split: 'Split', voucher: 'Voucher',
  };

  return Object.entries(pmMap)
    .sort(([, a], [, b]) => b - a)
    .map(([pm, amount]) => ({
      method: labels[pm] ?? pm,
      amount: fmt(amount),
      pct: Math.round((amount / total) * 100),
    }));
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportOrdersCSV(orders: Order[], label: string) {
  const headers = ['Order Number', 'Status', 'Channel', 'Payment Method', 'Total (AUD)', 'Customer ID', 'Created At'];
  const rows = orders.map((o) => [
    o.orderNumber, o.status, o.channel, o.paymentMethod ?? '',
    orderTotal(o).toFixed(2), o.customerId ?? '', o.createdAt,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `elevatedpos-orders-${label.replace(/[^a-zA-Z0-9]/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function classifyMenuProducts(products: MenuEngineeringProduct[]): MenuProduct[] {
  if (products.length === 0) return [];

  const sorted = [...products].sort((a, b) => a.unitsSold - b.unitsSold);
  const mid = Math.floor(sorted.length / 2);
  const medianUnits =
    sorted.length % 2 === 1
      ? sorted[mid].unitsSold
      : (sorted[mid - 1].unitsSold + sorted[mid].unitsSold) / 2;

  return products.map((p) => {
    const marginPct = p.margin * 100;
    const highPopularity = p.unitsSold >= medianUnits;
    const highMargin = marginPct >= 30;
    let quadrant: MenuQuadrant;
    if (highPopularity && highMargin) quadrant = 'stars';
    else if (highPopularity && !highMargin) quadrant = 'plowhorses';
    else if (!highPopularity && highMargin) quadrant = 'puzzles';
    else quadrant = 'dogs';
    return { ...p, quadrant, marginPct };
  });
}

function exportMenuEngineeringCSV(products: MenuProduct[], label: string) {
  const headers = ['Name', 'Category', 'Quadrant', 'Units Sold', 'Revenue', 'Cost', 'Margin %', 'Contribution'];
  const rows = products.map((p) => [
    p.name,
    p.category,
    p.quadrant.charAt(0).toUpperCase() + p.quadrant.slice(1),
    p.unitsSold,
    p.revenue.toFixed(2),
    p.cost.toFixed(2),
    p.marginPct.toFixed(1) + '%',
    p.contribution.toFixed(2),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `menu-engineering-${label.replace(/[^a-zA-Z0-9]/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Printable Report ────────────────────────────────────────────────────────

function PrintableReport({
  label,
  kpis,
  hourlyRevenue,
  topProducts,
  maxRevenue,
}: {
  label: string;
  kpis: ReturnType<typeof buildKpis>;
  hourlyRevenue: { hour: string; revenue: number }[];
  topProducts: ReturnType<typeof buildTopProducts>;
  maxRevenue: number;
}) {
  return (
    <div className="print-report hidden print:block bg-white p-8 font-sans text-gray-900">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b-2 border-gray-900 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ElevatedPOS</h1>
          <p className="text-sm text-gray-600">Sales Report · {label}</p>
        </div>
        <div className="text-right text-sm text-gray-500" suppressHydrationWarning>
          <p suppressHydrationWarning>Generated: {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p suppressHydrationWarning>{new Date().toLocaleTimeString('en-AU')}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase">{kpi.label}</p>
            <p className="mt-1 text-xl font-bold">{kpi.value}</p>
            <p className={`text-sm ${kpi.up ? 'text-green-600' : 'text-red-600'}`}>{kpi.change} vs prior period</p>
          </div>
        ))}
      </div>

      {/* Revenue chart (bar) */}
      <div className="mb-6">
        <h2 className="mb-3 font-semibold">Revenue Timeline</h2>
        <div className="flex h-24 items-end gap-0.5">
          {hourlyRevenue.map((h) => (
            <div key={h.hour} className="flex flex-1 flex-col items-center gap-0.5">
              <div
                className="w-full bg-gray-800"
                style={{ height: `${(h.revenue / maxRevenue) * 80}%`, minHeight: h.revenue > 0 ? '2px' : '0' }}
              />
              <span className="text-[7px] text-gray-500">{h.hour}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold">Top Products</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-1.5 text-left font-medium text-gray-500">Product</th>
                <th className="py-1.5 text-left font-medium text-gray-500">Units</th>
                <th className="py-1.5 text-left font-medium text-gray-500">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p) => (
                <tr key={p.name} className="border-b border-gray-100">
                  <td className="py-1.5">{p.name}</td>
                  <td className="py-1.5">{p.units}</td>
                  <td className="py-1.5 font-medium">{p.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 border-t border-gray-200 pt-3 text-center text-xs text-gray-400">
        Confidential · Generated by ElevatedPOS · elevatedpos.com.au
      </p>
    </div>
  );
}

// ─── Schedule Report Modal ────────────────────────────────────────────────────

function ScheduleReportModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    type: 'Sales Summary',
    frequency: 'weekly' as 'daily' | 'weekly' | 'monthly',
    email: '',
    dayOfWeek: 'Monday',
    startDate: new Date().toISOString().split('T')[0],
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await apiFetch('reports/schedules', { method: 'POST', body: JSON.stringify(form) });
      setSaved(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      toast({ title: 'Failed to schedule report', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-elevatedpos-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Schedule Report</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Report Type</label>
            <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option>Sales Summary</option>
              <option>Inventory Movement</option>
              <option>Customer Activity</option>
              <option>Staff Performance</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Frequency</label>
            <select className={inputCls} value={form.frequency} onChange={(e) => set('frequency', e.target.value as 'daily' | 'weekly' | 'monthly')}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {form.frequency === 'weekly' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Day of Week</label>
              <select className={inputCls} value={form.dayOfWeek} onChange={(e) => set('dayOfWeek', e.target.value)}>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              <Mail className="inline h-4 w-4 mr-1 text-gray-400" />
              Delivery Email
            </label>
            <input className={inputCls} type="email" placeholder="reports@yourbusiness.com" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
            <input className={inputCls} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400">
            Cancel
          </button>
          <button
            onClick={() => { void handleSubmit(); }}
            disabled={!form.email.trim() || saving}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-700 disabled:opacity-50"
          >
            {saved ? <><Check className="h-4 w-4" /> Saved!</> : saving ? <><Clock className="h-4 w-4 animate-spin" /> Saving…</> : <><Calendar className="h-4 w-4" /> Schedule</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Z-Report Modal ───────────────────────────────────────────────────────────

function ZReportModal({ data, onClose, onCloseDay, closingDay = false }: { data: ZReportData; onClose: () => void; onCloseDay: () => void; closingDay?: boolean }) {
  const fmtAud = (v?: number) =>
    v !== undefined ? `$${v.toFixed(2)}` : '—';
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="z-report-modal w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-elevatedpos-600" />
            <h2 className="font-semibold text-gray-900 dark:text-white">End of Day Z-Report</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-0.5 px-5 py-4">
          <p className="mb-4 text-sm text-gray-500">{data.date ?? today}</p>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {[
              { label: 'Total Sales (Gross)', value: fmtAud(data.totalSales), bold: true },
              { label: 'Total Refunds', value: fmtAud(data.totalRefunds) },
              { label: 'Net Sales', value: fmtAud(data.netSales), bold: true },
              { label: 'Cash Collected', value: fmtAud(data.cashCollected) },
              { label: 'Card Collected', value: fmtAud(data.cardCollected) },
              { label: 'Total Transactions', value: data.totalTransactions !== undefined ? String(data.totalTransactions) : '—' },
              { label: 'GST Collected', value: fmtAud(data.gstCollected) },
              ...(data.openingFloat !== undefined ? [{ label: 'Opening Float', value: fmtAud(data.openingFloat) }] : []),
              ...(data.closingFloat !== undefined ? [{ label: 'Closing Float', value: fmtAud(data.closingFloat) }] : []),
            ].map(({ label, value, bold }) => (
              <div key={label} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
                <span className={`text-sm ${bold ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Printer className="h-4 w-4" /> Print Z-Report
          </button>
          <button
            onClick={onCloseDay}
            disabled={closingDay}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-700 disabled:opacity-60"
          >
            <Check className="h-4 w-4" /> {closingDay ? 'Saving…' : 'Save & Close Day'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsClient() {
  const { toast } = useToast();
  const [range, setRange] = useState<DateRange>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [comparisonView, setComparisonView] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Z-Report state
  const [showZReport, setShowZReport] = useState(false);
  const [zReportData, setZReportData] = useState<ZReportData>({});
  const [zReportLoading, setZReportLoading] = useState(false);
  const [closingDay, setClosingDay] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // BAS/Tax report state
  const [reportType, setReportType] = useState<'standard' | 'tax' | 'menu'>('standard');
  const [basData, setBASData] = useState<BASReportData | null>(null);
  const [basLoading, setBASLoading] = useState(false);

  // Menu Engineering state
  const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);

  // bounds declared early so callbacks below can reference it
  const bounds = useMemo(() => getDateBounds(range, customFrom, customTo), [range, customFrom, customTo]);

  // Load user role for role-gated features
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.role) setUserRole(json.role as string);
      })
      .catch((err: unknown) => {
        toast({ title: 'Failed to load user role', description: getErrorMessage(err), variant: 'destructive' });
      });
  }, [toast]);

  const handleRunZReport = async () => {
    setZReportLoading(true);
    try {
      const res = await fetch('/api/proxy/reports/eod');
      const json = res.ok ? (await res.json() as ZReportData) : {};
      setZReportData(json);
      setShowZReport(true);
    } catch {
      setZReportData({});
      setShowZReport(true);
    } finally {
      setZReportLoading(false);
    }
  };

  const handleCloseDay = async () => {
    setClosingDay(true);
    try {
      await fetch('/api/proxy/reports/eod/close', { method: 'POST' });
      setShowZReport(false);
    } catch (err: unknown) {
      toast({ title: 'Failed to close day', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setClosingDay(false);
    }
  };

  const handleLoadBAS = async () => {
    setBASLoading(true);
    try {
      const res = await fetch(
        `/api/proxy/reports/export?format=json&type=gst&from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}`
      );
      const json = res.ok ? (await res.json() as BASReportData) : null;
      setBASData(json);
    } catch (err: unknown) {
      setBASData(null);
      toast({ title: 'Failed to load tax report', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setBASLoading(false);
    }
  };

  const handleLoadMenu = useCallback(async () => {
    setMenuLoading(true);
    try {
      const res = await fetch(
        `/api/proxy/reports/menu-engineering?from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}`
      );
      const json = res.ok ? (await res.json() as { data: MenuEngineeringProduct[] }) : { data: [] };
      setMenuProducts(classifyMenuProducts(json.data ?? []));
    } catch (err: unknown) {
      setMenuProducts([]);
      toast({ title: 'Failed to load menu engineering data', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setMenuLoading(false);
    }
  }, [bounds.from, bounds.to, toast]);

  // Load scheduled reports from API (fall back to localStorage for migration)
  useEffect(() => {
    fetch('/api/proxy/reports/schedules')
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        const list: ScheduledReport[] = Array.isArray(json) ? json : (json?.data ?? []);
        if (list.length > 0) {
          setScheduledReports(list);
          // Migrate to API — clear legacy localStorage data
          try { localStorage.removeItem('elevatedpos-scheduled-reports'); } catch (err: unknown) {
            toast({ title: 'Failed to clear legacy scheduled reports', description: getErrorMessage(err), variant: 'destructive' });
          }
        } else {
          // Fallback: load from localStorage during migration period
          try {
            const legacy = JSON.parse(localStorage.getItem('elevatedpos-scheduled-reports') ?? '[]') as ScheduledReport[];
            setScheduledReports(legacy);
          } catch (err: unknown) {
            toast({ title: 'Failed to load scheduled reports from storage', description: getErrorMessage(err), variant: 'destructive' });
          }
        }
      })
      .catch((err: unknown) => {
        try {
          setScheduledReports(JSON.parse(localStorage.getItem('elevatedpos-scheduled-reports') ?? '[]'));
        } catch (storageErr: unknown) {
          toast({ title: 'Failed to load scheduled reports', description: getErrorMessage(storageErr), variant: 'destructive' });
        }
        void err;
      });
  }, [showScheduleModal, toast]);

  const prevBounds = useMemo(() => {
    const from = new Date(bounds.from);
    const to = new Date(bounds.to);
    const duration = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - duration);
    const prevTo = new Date(from.getTime() - 1);
    return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
  }, [bounds]);

  const { data: ordersResp, isLoading } = useQuery({
    queryKey: ['orders', 'reports', range, bounds.from, bounds.to],
    queryFn: () =>
      apiFetch<{ data: Order[] }>(
        `orders?from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}&limit=1000`,
      ),
    staleTime: 60_000,
    enabled: range !== 'custom' || (!!customFrom && !!customTo),
  });

  const { data: prevOrdersResp } = useQuery({
    queryKey: ['orders', 'reports', 'prev', prevBounds.from, prevBounds.to],
    queryFn: () =>
      apiFetch<{ data: Order[] }>(
        `orders?from=${encodeURIComponent(prevBounds.from)}&to=${encodeURIComponent(prevBounds.to)}&limit=1000`,
      ),
    staleTime: 60_000,
    enabled: range !== 'custom' || (!!customFrom && !!customTo),
  });

  const orders = ordersResp?.data ?? [];
  const prevOrders = prevOrdersResp?.data ?? [];

  const kpis = useMemo(() => buildKpis(orders, prevOrders), [orders, prevOrders]);
  const prevKpis = useMemo(() => buildKpis(prevOrders, []), [prevOrders]);
  const hourlyRevenue = useMemo(() => buildHourlyRevenue(orders, range), [orders, range]);
  const topProducts = useMemo(() => buildTopProducts(orders), [orders]);
  const channelBreakdown = useMemo(() => buildChannelBreakdown(orders), [orders]);
  const paymentMethods = useMemo(() => buildPaymentMethods(orders), [orders]);
  const maxRevenue = Math.max(...hourlyRevenue.map((h) => h.revenue), 1);

  const handleExportCSV = useCallback(() => {
    exportOrdersCSV(orders, bounds.label);
  }, [orders, bounds.label]);

  const handlePrintPDF = useCallback(() => {
    window.print();
  }, []);

  const removeScheduled = async (id: string) => {
    const updated = scheduledReports.filter((r) => r.id !== id);
    setScheduledReports(updated);
    // Delete from API; also clean legacy localStorage
    try {
      await fetch(`/api/proxy/reports/schedules/${id}`, { method: 'DELETE' });
      localStorage.removeItem('elevatedpos-scheduled-reports');
    } catch (err: unknown) {
      toast({ title: 'Failed to delete scheduled report', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const isHourly = range === 'today' || range === 'yesterday';

  const canAccessEOD = userRole === 'owner' || userRole === 'manager';
  const fmtAud = (v?: number) => v !== undefined ? `$${v.toFixed(2)}` : '—';

  return (
    <>
      {/* Hidden printable report */}
      <div ref={printRef}>
        <PrintableReport label={bounds.label} kpis={kpis} hourlyRevenue={hourlyRevenue} topProducts={topProducts} maxRevenue={maxRevenue} />
      </div>

      {showScheduleModal && <ScheduleReportModal onClose={() => setShowScheduleModal(false)} />}

      {showZReport && (
        <ZReportModal
          data={zReportData}
          onClose={() => setShowZReport(false)}
          onCloseDay={() => { void handleCloseDay(); }}
          closingDay={closingDay}
        />
      )}

      <div className="space-y-6 print:hidden">
        {/* End of Day Z-Report — owners & managers only */}
        {canAccessEOD && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div className="rounded-lg bg-elevatedpos-50 p-2 dark:bg-elevatedpos-900/30">
                <FileText className="h-5 w-5 text-elevatedpos-600 dark:text-elevatedpos-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">End of Day</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Generate a Z-Report and reconcile the trading day</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <button
                onClick={() => { void handleRunZReport(); }}
                disabled={zReportLoading}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-700 disabled:opacity-60"
              >
                <FileText className="h-4 w-4" />
                {zReportLoading ? 'Loading…' : 'Run Z-Report'}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Produces a summary of all transactions for today. Running this report does not close the day.
              </p>
            </div>
          </div>
        )}

        {/* Header + controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{bounds.label} · All Locations</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Report type selector */}
            <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden dark:border-gray-700 dark:bg-gray-800">
              <button
                onClick={() => setReportType('standard')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${reportType === 'standard' ? 'bg-elevatedpos-600 text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Standard
              </button>
              <button
                onClick={() => { setReportType('tax'); void handleLoadBAS(); }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${reportType === 'tax' ? 'bg-elevatedpos-600 text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Tax / BAS
              </button>
              <button
                onClick={() => { setReportType('menu'); void handleLoadMenu(); }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${reportType === 'menu' ? 'bg-elevatedpos-600 text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Menu Engineering
              </button>
            </div>

            <select
              value={range}
              onChange={(e) => setRange(e.target.value as DateRange)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>

            {range === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} min={customFrom} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </>
            )}

            {/* Comparison toggle */}
            <button
              onClick={() => setComparisonView((v) => !v)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${comparisonView ? 'border-elevatedpos-500 bg-elevatedpos-50 text-elevatedpos-700 dark:border-elevatedpos-600 dark:bg-elevatedpos-900/30 dark:text-elevatedpos-300' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
            >
              <Columns2 className="h-4 w-4" /> Comparison
            </button>

            <button
              onClick={() => setShowScheduleModal(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Calendar className="h-4 w-4" /> Schedule
            </button>

            <button
              onClick={handleExportCSV}
              disabled={orders.length === 0}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Download className="h-4 w-4" /> CSV
            </button>

            <button
              onClick={handlePrintPDF}
              disabled={orders.length === 0}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Printer className="h-4 w-4" /> PDF
            </button>
          </div>
        </div>

        {/* Comparison View */}
        {comparisonView && (
          <div className="rounded-xl border border-elevatedpos-200 bg-elevatedpos-50/30 p-4 dark:border-elevatedpos-800 dark:bg-elevatedpos-900/10">
            <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Period Comparison</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.map((kpi, i) => (
                <div key={kpi.label} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-xs text-gray-400">Current</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{kpi.value}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Prior period</p>
                      <p className="text-lg font-bold text-gray-500">{prevKpis[i]?.value ?? '—'}</p>
                    </div>
                  </div>
                  <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${kpi.up ? 'text-green-600' : 'text-red-600'}`}>
                    {kpi.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {kpi.change}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BAS / Tax Report */}
        {reportType === 'tax' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div className="rounded-lg bg-elevatedpos-50 p-2 dark:bg-elevatedpos-900/30">
                <BarChart2 className="h-5 w-5 text-elevatedpos-600 dark:text-elevatedpos-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">Tax Report — BAS Summary</h3>
                <p className="text-sm text-gray-500">{bounds.label}</p>
              </div>
              <a
                href={`/api/proxy/reports/export?format=csv&type=gst&from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <Download className="h-4 w-4" /> Export for BAS
              </a>
            </div>
            <div className="p-5">
              {basLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                  ))}
                </div>
              ) : !basData ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  No tax data available for this period. Ensure GST is configured in Settings → Tax.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {[
                    { label: 'GST Collected (from sales)', value: fmtAud(basData.gstCollected), desc: '1A — GST on sales' },
                    { label: 'GST Paid (purchase orders / input costs)', value: fmtAud(basData.gstPaid), desc: '1B — GST on purchases' },
                    { label: 'Net GST Position (owed to ATO)', value: fmtAud(basData.netGst), desc: 'G20 — Net amount', bold: true },
                  ].map(({ label, value, desc, bold }) => (
                    <div key={label} className="flex items-center justify-between py-3">
                      <div>
                        <p className={`text-sm ${bold ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{label}</p>
                        <p className="text-xs text-gray-500">{desc}</p>
                      </div>
                      <span className={`text-sm ${bold ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Menu Engineering */}
        {reportType === 'menu' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-elevatedpos-50 p-2 dark:bg-elevatedpos-900/30">
                  <BarChart2 className="h-5 w-5 text-elevatedpos-600 dark:text-elevatedpos-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Menu Engineering</h3>
                  <p className="text-sm text-gray-500">{bounds.label} · Stars, Plowhorses, Puzzles, Dogs</p>
                </div>
              </div>
              <button
                onClick={() => exportMenuEngineeringCSV(menuProducts, bounds.label)}
                disabled={menuProducts.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <Download className="h-4 w-4" /> Export Menu Analysis
              </button>
            </div>
            <div className="p-5">
              {menuLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
                  ))}
                </div>
              ) : menuProducts.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  No menu engineering data available for this period.
                </div>
              ) : (
                <>
                  {/* Legend */}
                  <div className="mb-4 flex flex-wrap gap-3 text-xs">
                    {([
                      { q: 'stars', label: 'Stars', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', desc: 'High popularity · High margin' },
                      { q: 'plowhorses', label: 'Plowhorses', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', desc: 'High popularity · Low margin' },
                      { q: 'puzzles', label: 'Puzzles', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400', desc: 'Low popularity · High margin' },
                      { q: 'dogs', label: 'Dogs', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', desc: 'Low popularity · Low margin' },
                    ] as const).map(({ q, label, color, desc }) => (
                      <span key={q} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${color}`}>
                        {label} <span className="font-normal opacity-70">— {desc}</span>
                      </span>
                    ))}
                  </div>

                  {/* 2×2 Grid */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      {
                        q: 'stars' as MenuQuadrant,
                        label: 'Stars',
                        border: 'border-emerald-200 dark:border-emerald-800',
                        header: 'bg-emerald-50 dark:bg-emerald-900/20',
                        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
                        dot: 'bg-emerald-500',
                        tip: 'Keep featured — these are your winners',
                      },
                      {
                        q: 'plowhorses' as MenuQuadrant,
                        label: 'Plowhorses',
                        border: 'border-amber-200 dark:border-amber-800',
                        header: 'bg-amber-50 dark:bg-amber-900/20',
                        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
                        dot: 'bg-amber-500',
                        tip: 'Raise price or reduce portion size',
                      },
                      {
                        q: 'puzzles' as MenuQuadrant,
                        label: 'Puzzles',
                        border: 'border-blue-200 dark:border-blue-800',
                        header: 'bg-blue-50 dark:bg-blue-900/20',
                        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
                        dot: 'bg-blue-500',
                        tip: 'Promote more — they\'re hidden gems',
                      },
                      {
                        q: 'dogs' as MenuQuadrant,
                        label: 'Dogs',
                        border: 'border-red-200 dark:border-red-800',
                        header: 'bg-red-50 dark:bg-red-900/20',
                        badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
                        dot: 'bg-red-500',
                        tip: 'Consider removing or repositioning',
                      },
                    ]).map(({ q, label, border, header, badge, dot, tip }) => {
                      const items = menuProducts.filter((p) => p.quadrant === q);
                      return (
                        <div key={q} className={`overflow-hidden rounded-xl border ${border}`}>
                          <div className={`flex items-center justify-between px-4 py-3 ${header}`}>
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>{label}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">({items.length})</span>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 italic">{tip}</span>
                          </div>
                          {items.length === 0 ? (
                            <p className="px-4 py-4 text-sm text-gray-400">No products in this quadrant</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-100 dark:border-gray-700/50">
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Product</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400">Units</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400">Margin</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                {items.map((p) => (
                                  <tr key={p.productId} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white truncate max-w-[160px]">{p.name}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">{p.unitsSold.toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-right font-medium text-gray-900 dark:text-white">{p.marginPct.toFixed(1)}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-2 h-8 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-3 h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              ))
            : kpis.map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center gap-2">
                    <kpi.icon className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{kpi.label}</p>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
                  <div className="mt-2 flex items-center gap-1">
                    {kpi.up ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                    <span className={`text-sm font-medium ${kpi.up ? 'text-green-600' : 'text-red-600'}`}>{kpi.change}</span>
                    <span className="text-sm text-gray-400">vs prior period</span>
                  </div>
                </div>
              ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Revenue chart */}
          <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
              {isHourly ? 'Revenue by Hour' : 'Revenue by Day'}
            </h3>
            {isLoading ? (
              <div className="animate-pulse h-40 rounded bg-gray-100 dark:bg-gray-700" />
            ) : hourlyRevenue.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-400">No completed orders in this period</div>
            ) : (
              <div className="flex h-40 items-end gap-1 overflow-x-auto">
                {hourlyRevenue.map((h) => (
                  <div key={h.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full min-w-[8px] rounded-t-sm bg-elevatedpos-500 transition-all hover:bg-elevatedpos-600 dark:bg-elevatedpos-600"
                      style={{ height: `${(h.revenue / maxRevenue) * 100}%`, minHeight: h.revenue > 0 ? '4px' : '0' }}
                      title={fmt(h.revenue)}
                    />
                    <span className="truncate text-xs text-gray-400">{h.hour}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Channel breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Sales by Channel</h3>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse space-y-1">
                    <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700" />
                  </div>
                ))}
              </div>
            ) : channelBreakdown.length === 0 ? (
              <p className="text-sm text-gray-400">No sales data</p>
            ) : (
              <div className="space-y-3">
                {channelBreakdown.map((ch) => (
                  <div key={ch.method}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">{ch.method}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{ch.amount}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div className="h-full rounded-full bg-elevatedpos-500" style={{ width: `${ch.pct}%` }} />
                    </div>
                    <p className="mt-0.5 text-right text-xs text-gray-400">{ch.pct}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top products */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Top Products</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Product</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Units</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Revenue</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-32">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td className="px-5 py-3.5" colSpan={4}><div className="animate-pulse h-4 w-full rounded bg-gray-100 dark:bg-gray-700" /></td></tr>
                    ))
                  : topProducts.length === 0
                  ? <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">No product sales data for this period</td></tr>
                  : topProducts.map((p) => (
                      <tr key={p.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{p.name}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{p.units}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{p.revenue}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                              <div className="h-full rounded-full bg-elevatedpos-500" style={{ width: `${p.share}%` }} />
                            </div>
                            <span className="w-8 text-right text-xs text-gray-500">{p.share}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Payment methods */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Payment Methods</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Method</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Revenue</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-32">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}><td className="px-5 py-3.5" colSpan={3}><div className="animate-pulse h-4 w-full rounded bg-gray-100 dark:bg-gray-700" /></td></tr>
                    ))
                  : paymentMethods.length === 0
                  ? <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-gray-400">No payment data for this period</td></tr>
                  : paymentMethods.map((pm) => (
                      <tr key={pm.method} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{pm.method}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{pm.amount}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                              <div className="h-full rounded-full bg-elevatedpos-500" style={{ width: `${pm.pct}%` }} />
                            </div>
                            <span className="w-8 text-right text-xs text-gray-500">{pm.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scheduled Reports */}
        {scheduledReports.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Scheduled Reports</h3>
              </div>
              <span className="rounded-full bg-elevatedpos-100 px-2 py-0.5 text-xs font-medium text-elevatedpos-700 dark:bg-elevatedpos-900/30 dark:text-elevatedpos-400">
                {scheduledReports.length} active
              </span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {scheduledReports.map((sr) => (
                <div key={sr.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{sr.type}</p>
                    <p className="text-xs text-gray-500 capitalize">
                      {sr.frequency}{sr.frequency === 'weekly' && sr.dayOfWeek ? ` · ${sr.dayOfWeek}s` : ''} · {sr.email}
                    </p>
                  </div>
                  <button
                    onClick={() => removeScheduled(sr.id)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-report, .print-report * { visibility: visible !important; display: block !important; }
          .print-report { position: fixed; top: 0; left: 0; width: 100%; }
          .z-report-modal, .z-report-modal * { visibility: visible !important; }
          .z-report-modal { position: fixed; top: 0; left: 0; width: 100%; box-shadow: none !important; }
        }
      `}</style>
    </>
  );
}
