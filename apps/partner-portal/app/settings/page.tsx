'use client';

import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Eye, EyeOff, RefreshCw, Save } from 'lucide-react';

const COMMISSION_RATES = [
  { plan: 'Starter', price: '$299/mo', rate: '20%', amount: '$59.80/mo per tenant' },
  { plan: 'Growth', price: '$499/mo', rate: '22%', amount: '$109.78/mo per tenant' },
  { plan: 'Pro', price: '$999/mo', rate: '25%', amount: '$249.75/mo per tenant' },
];

export default function SettingsPage() {
  const [profile, setProfile] = useState({
    companyName: 'Acme Resellers Pty Ltd',
    abn: '51 824 753 556',
    contactEmail: 'billing@acmeresellers.com.au',
    phone: '+61 2 9000 1234',
    address: 'Level 12, 100 Market Street, Sydney NSW 2000',
  });

  const [notifications, setNotifications] = useState({
    newTenant: true,
    paymentFailure: true,
    churnRisk: false,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleRegenerate() {
    setRegenerating(true);
    setTimeout(() => setRegenerating(false), 1500);
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage your partner account preferences</p>
        </header>

        <div className="p-8 space-y-6 max-w-3xl">
          {/* Partner Profile */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Partner Profile</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Your business details shown on invoices</p>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={profile.companyName}
                  onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">ABN</label>
                <input
                  type="text"
                  value={profile.abn}
                  onChange={(e) => setProfile({ ...profile, abn: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Phone</label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Contact Email</label>
                <input
                  type="email"
                  value={profile.contactEmail}
                  onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Address</label>
                <input
                  type="text"
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Revenue Share */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Revenue Share</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Commission rates are set by your partnership agreement</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {COMMISSION_RATES.map((r) => (
                <div key={r.plan} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{r.plan} plan</span>
                    <span className="ml-2 text-xs text-slate-400">{r.price}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{r.rate}</span>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{r.amount}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Notification Preferences</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Choose which events trigger email notifications</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {[
                { key: 'newTenant' as const, label: 'New tenant provisioned', desc: 'Notified when a new tenant is successfully set up' },
                { key: 'paymentFailure' as const, label: 'Payment failure', desc: 'Notified when a tenant invoice fails to process' },
                { key: 'churnRisk' as const, label: 'Churn risk alert', desc: 'Notified when a tenant shows signs of cancelling' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{desc}</p>
                  </div>
                  <button
                    onClick={() => setNotifications({ ...notifications, [key]: !notifications[key] })}
                    className={`relative rounded-full transition-colors ${notifications[key] ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    style={{ height: '22px', width: '40px', flexShrink: 0 }}
                    aria-pressed={notifications[key]}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform"
                      style={{
                        width: '18px',
                        height: '18px',
                        transform: notifications[key] ? 'translateX(18px)' : 'translateX(0)',
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* API Credentials */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">API Credentials</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Use this key to authenticate partner API requests</p>
            </div>
            <div className="p-6">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Partner API Key</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm text-slate-700 dark:text-slate-300">
                  <span className="flex-1 truncate">
                    {showApiKey ? 'pk_live_acme_a8f3c2b1d4e5f9g0h7i2j6k1l3m8n5o4' : '••••••••••••••••••••••••••••••••••••'}
                  </span>
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                  {regenerating ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Last used 2 days ago. Keep this key secure — do not share it publicly.</p>
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="text-sm text-emerald-600 font-medium">Changes saved.</span>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
