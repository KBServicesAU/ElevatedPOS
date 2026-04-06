'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '../../components/Sidebar';
import { ArrowLeft, MapPin, DollarSign, ShoppingCart, Calendar, Edit2, Save, Ban } from 'lucide-react';

// Mock data for a single tenant (in production this would be fetched by id)
const TENANT = {
  id: 't2',
  name: 'Harborview Bistro',
  plan: 'Pro' as const,
  status: 'active' as const,
  mrr: 999,
  totalOrders: 12480,
  locations: 7,
  createdAt: 'Jan 14, 2024',
  email: 'manager@harborview.com',
  phone: '+61 2 9221 4000',
  owner: 'David Chen',
  address: '1 Circular Quay East, Sydney NSW 2000',
  abn: '44 098 217 645',
};

const ACTIVITY = [
  { time: '2h ago', event: 'New order processed', detail: 'Order #12480 — $89.50 via dine-in' },
  { time: '1d ago', event: 'Staff member added', detail: 'Sophie Wilson joined as Cashier' },
  { time: '3d ago', event: 'Inventory reorder', detail: '8 items restocked via purchase order PO-2041' },
  { time: '5d ago', event: 'Menu item updated', detail: '"Grilled Salmon" price updated to $38' },
  { time: '1w ago', event: 'New location activated', detail: 'Darling Harbour branch is now live' },
];

const INVOICES = [
  { num: 'INV-2026-03', period: 'March 2026', amount: 999, status: 'paid', date: 'Mar 1, 2026' },
  { num: 'INV-2026-02', period: 'February 2026', amount: 999, status: 'paid', date: 'Feb 1, 2026' },
  { num: 'INV-2026-01', period: 'January 2026', amount: 999, status: 'paid', date: 'Jan 1, 2026' },
  { num: 'INV-2025-12', period: 'December 2025', amount: 999, status: 'paid', date: 'Dec 1, 2025' },
  { num: 'INV-2025-11', period: 'November 2025', amount: 499, status: 'paid', date: 'Nov 1, 2025' },
  { num: 'INV-2025-10', period: 'October 2025', amount: 499, status: 'paid', date: 'Oct 1, 2025' },
];

const PLAN_STYLES = {
  Starter: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  Growth: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  Pro: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
};

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  trial: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

type Tab = 'overview' | 'locations' | 'billing' | 'settings';

export default function TenantDetailPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [editName, setEditName] = useState(TENANT.name);
  const [editOwner, setEditOwner] = useState(TENANT.owner);
  const [editEmail, setEditEmail] = useState(TENANT.email);

  function handleSaveSettings() {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'locations', label: 'Locations' },
    { id: 'billing', label: 'Billing' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/tenants" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="text-xs text-slate-400 dark:text-slate-500">Tenants</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                {TENANT.name[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">{TENANT.name}</h1>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_STYLES[TENANT.plan]}`}>
                    {TENANT.plan}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[TENANT.status]}`}>
                    {TENANT.status}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{TENANT.email}</p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="px-8 py-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-4 gap-5">
            {[
              { label: 'MRR', value: `$${TENANT.mrr.toLocaleString()}`, icon: DollarSign, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950' },
              { label: 'Total Orders', value: TENANT.totalOrders.toLocaleString(), icon: ShoppingCart, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950' },
              { label: 'Locations', value: String(TENANT.locations), icon: MapPin, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950' },
              { label: 'Customer Since', value: TENANT.createdAt, icon: Calendar, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8">
          <nav className="flex gap-1">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-8">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-3 gap-6">
              {/* Activity Feed */}
              <div className="col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent Activity</h2>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                  {ACTIVITY.map((item, i) => (
                    <div key={i} className="px-6 py-3.5 flex items-start gap-4">
                      <div className="text-xs text-slate-400 w-12 flex-shrink-0 mt-0.5">{item.time}</div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.event}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact + Plan Details */}
              <div className="space-y-5">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Contact Info</h2>
                  </div>
                  <div className="p-5 space-y-3 text-sm">
                    {[
                      { label: 'Owner', value: TENANT.owner },
                      { label: 'Email', value: TENANT.email },
                      { label: 'Phone', value: TENANT.phone },
                      { label: 'Address', value: TENANT.address },
                      { label: 'ABN', value: TENANT.abn },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="text-slate-800 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Plan Details</h2>
                  </div>
                  <div className="p-5 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Current plan</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_STYLES[TENANT.plan]}`}>{TENANT.plan}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Monthly fee</span>
                      <span className="font-mono font-medium text-slate-800">${TENANT.mrr}/mo</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Billing date</span>
                      <span className="text-slate-700">1st of month</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Next invoice</span>
                      <span className="text-slate-700">Apr 1, 2026</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'locations' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Locations ({TENANT.locations})</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  { name: 'Circular Quay', address: '1 Circular Quay East', devices: 4, status: 'active' },
                  { name: 'Darling Harbour', address: '26 Pirrama Rd, Pyrmont', devices: 3, status: 'active' },
                  { name: 'Barangaroo', address: '10 Barangaroo Ave', devices: 5, status: 'active' },
                  { name: 'The Rocks', address: '58 Lower Fort St', devices: 2, status: 'active' },
                  { name: 'Newtown', address: '312 King St, Newtown', devices: 2, status: 'active' },
                  { name: 'Surry Hills', address: '88 Crown St, Surry Hills', devices: 3, status: 'active' },
                  { name: 'Manly', address: '1 The Corso, Manly', devices: 2, status: 'active' },
                ].map((loc) => (
                  <div key={loc.name} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{loc.name}</p>
                        <p className="text-xs text-slate-400">{loc.address}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{loc.devices} POS devices</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium capitalize">{loc.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Invoice History</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Invoice', 'Period', 'Amount', 'Status', 'Date'].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {INVOICES.map((inv) => (
                    <tr key={inv.num} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-600">{inv.num}</td>
                      <td className="px-5 py-3.5 text-slate-700">{inv.period}</td>
                      <td className="px-5 py-3.5 font-mono font-medium text-slate-900">${inv.amount}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${INVOICE_STATUS_STYLES[inv.status]}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{inv.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-lg">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tenant Settings</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Owner Name</label>
                  <input
                    value={editOwner}
                    onChange={(e) => setEditOwner(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Contact Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveSettings}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Changes
                    </button>
                    {settingsSaved && (
                      <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Saved.</span>
                    )}
                  </div>
                  <button
                    onClick={() => alert('Tenant suspension would be processed here. In production this calls the partner API.')}
                    className="flex items-center gap-2 px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 text-sm font-medium rounded-lg transition-colors"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Suspend Tenant
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
