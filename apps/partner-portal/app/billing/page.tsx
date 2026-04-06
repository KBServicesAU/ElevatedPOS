'use client';

import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Download, CheckCircle } from 'lucide-react';

interface BillingRow {
  id: string;
  name: string;
  plan: 'Starter' | 'Growth' | 'Pro';
  monthlyFee: number;
  status: 'paid' | 'pending' | 'overdue';
  invoiceDate: string;
}

const BILLING_ROWS: BillingRow[] = [
  { id: 'b1', name: 'Brew & Bean Coffee Co', plan: 'Growth', monthlyFee: 499, status: 'paid', invoiceDate: 'Mar 1, 2026' },
  { id: 'b2', name: 'Harborview Bistro', plan: 'Pro', monthlyFee: 999, status: 'paid', invoiceDate: 'Mar 1, 2026' },
  { id: 'b3', name: 'Sunrise Bakery', plan: 'Growth', monthlyFee: 499, status: 'paid', invoiceDate: 'Mar 1, 2026' },
  { id: 'b4', name: 'Metro Grill', plan: 'Pro', monthlyFee: 999, status: 'paid', invoiceDate: 'Mar 1, 2026' },
  { id: 'b5', name: 'Old Riverside Bar', plan: 'Starter', monthlyFee: 299, status: 'overdue', invoiceDate: 'Feb 1, 2026' },
  { id: 'b6', name: 'Coastal Eats', plan: 'Growth', monthlyFee: 499, status: 'paid', invoiceDate: 'Mar 1, 2026' },
  { id: 'b7', name: 'The Corner Store', plan: 'Starter', monthlyFee: 299, status: 'pending', invoiceDate: 'Mar 1, 2026' },
  { id: 'b8', name: 'Fusion Kitchen', plan: 'Pro', monthlyFee: 999, status: 'paid', invoiceDate: 'Mar 1, 2026' },
  { id: 'b9', name: 'The Bun Factory', plan: 'Growth', monthlyFee: 499, status: 'pending', invoiceDate: 'Mar 1, 2026' },
  { id: 'b10', name: 'Queenstown Diner', plan: 'Starter', monthlyFee: 299, status: 'paid', invoiceDate: 'Mar 1, 2026' },
];

const STATUS_STYLES: Record<BillingRow['status'], string> = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const PLAN_STYLES: Record<BillingRow['plan'], string> = {
  Starter: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  Growth: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  Pro: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
};

const stats = [
  { label: 'Total MRR', value: '$18,400', sub: 'Current billing period' },
  { label: 'Outstanding', value: '$2,100', sub: '3 invoices unpaid' },
  { label: 'Next Invoice', value: 'April 1', sub: 'Scheduled generation' },
  { label: 'Avg per Tenant', value: '$767', sub: 'Across 24 tenants' },
];

export default function BillingPage() {
  const total = BILLING_ROWS.reduce((sum, r) => sum + r.monthlyFee, 0);
  const [downloaded, setDownloaded] = useState(false);

  function handleDownload() {
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Billing</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">March 2026 billing period</p>
          </div>
          <button
            onClick={handleDownload}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              downloaded
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {downloaded ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Downloaded
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download Invoice
              </>
            )}
          </button>
        </header>

        <div className="p-8 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-5">
            {stats.map(({ label, value, sub }) => (
              <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{label}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{value}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>
              </div>
            ))}
          </div>

          {/* Current billing period */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Current Billing Period — March 2026</h2>
              <span className="text-xs text-slate-400">{BILLING_ROWS.length} tenants</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {['Tenant', 'Plan', 'Monthly Fee', 'Status', 'Invoice Date'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {BILLING_ROWS.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{row.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_STYLES[row.plan]}`}>
                        {row.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-800 dark:text-slate-200">${row.monthlyFee.toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{row.invoiceDate}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
                <tr>
                  <td className="px-5 py-3.5 font-semibold text-slate-700 dark:text-slate-200" colSpan={2}>Total</td>
                  <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white font-mono">${total.toLocaleString()}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
