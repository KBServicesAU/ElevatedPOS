'use client';

import { useEffect, useState, use } from 'react';
import { platformFetch } from '@/lib/api';
import { ArrowLeft, Edit2, X, LogIn, CreditCard, ExternalLink, Copy, Check } from 'lucide-react';
import Link from 'next/link';

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planStatus: string;
  maxLocations: number;
  maxDevices: number;
  onboardingStep: string;
  country: string;
  currency: string;
  timezone: string;
  abn: string | null;
  billingEmail: string | null;
  createdAt: string;
  updatedAt: string;
  _counts: {
    activeEmployees: number;
    activeDevices: number;
  };
}

interface Device {
  id: string;
  role: string;
  label: string | null;
  platform: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  status: string;
  createdAt: string;
}

function planBadgeColor(plan: string): string {
  if (plan === 'enterprise') return 'bg-yellow-500/20 text-yellow-400';
  if (plan === 'growth') return 'bg-indigo-500/20 text-indigo-400';
  return 'bg-gray-500/20 text-gray-400';
}

export default function MerchantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'staff' | 'billing' | 'notes'>('overview');
  const [devices, setDevices] = useState<Device[]>([]);
  const [notes, setNotes] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ plan: '', maxLocations: 1, maxDevices: 2 });
  const [saving, setSaving] = useState(false);

  // Impersonation state
  const [impersonating, setImpersonating] = useState(false);
  const [impersonationToken, setImpersonationToken] = useState<string | null>(null);
  const [impersonationLoginUrl, setImpersonationLoginUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadOrg() {
      try {
        const data = (await platformFetch(`platform/organisations/${id}`)) as { data: OrgDetail };
        setOrg(data.data);
        setEditForm({
          plan: data.data.plan,
          maxLocations: data.data.maxLocations,
          maxDevices: data.data.maxDevices,
        });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void loadOrg();
  }, [id]);

  useEffect(() => {
    const stored = localStorage.getItem(`godmode_notes_${id}`) ?? '';
    setNotes(stored);
  }, [id]);

  useEffect(() => {
    if (activeTab === 'devices') {
      void (async () => {
        try {
          const data = (await platformFetch(`platform/organisations/${id}/devices`)) as { data: Device[] };
          setDevices(data.data);
        } catch {
          setDevices([]);
        }
      })();
    }
  }, [activeTab, id]);

  function saveNotes(value: string) {
    setNotes(value);
    localStorage.setItem(`godmode_notes_${id}`, value);
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      const data = (await platformFetch(`platform/organisations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      })) as { data: OrgDetail };
      setOrg(data.data);
      setShowEditModal(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-gray-500">Loading...</div>
    );
  }

  if (!org) {
    return (
      <div className="p-8">
        <p className="text-red-400">Merchant not found.</p>
        <Link href="/merchants" className="text-indigo-400 hover:underline text-sm mt-2 inline-block">
          Back to Merchants
        </Link>
      </div>
    );
  }

  async function handleImpersonate() {
    setImpersonating(true);
    try {
      const data = (await platformFetch(`platform/organisations/${id}/impersonate`, {
        method: 'POST',
      })) as { accessToken: string; loginUrl: string };
      setImpersonationToken(data.accessToken);
      // Build direct login URL with token embedded in hash so it's not logged server-side
      const loginUrl = `https://app.elevatedpos.com.au/login?impersonate=${encodeURIComponent(data.accessToken)}`;
      setImpersonationLoginUrl(loginUrl);
    } catch {
      alert('Failed to generate impersonation token. Check auth service logs.');
    } finally {
      setImpersonating(false);
    }
  }

  function copyToken() {
    if (!impersonationToken) return;
    navigator.clipboard.writeText(impersonationToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const tabs = ['overview', 'devices', 'staff', 'billing', 'notes'] as const;

  return (
    <div className="p-8">
      {/* Back */}
      <Link href="/merchants" className="flex items-center gap-2 text-gray-500 hover:text-white text-sm mb-6 transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" />
        Back to Merchants
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{org.name}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${planBadgeColor(org.plan)}`}>
              {org.plan}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${org.planStatus === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {org.planStatus}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">/{org.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImpersonate}
            disabled={impersonating}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            <LogIn className="w-4 h-4" />
            {impersonating ? 'Generating…' : 'Login As'}
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit Plan
          </button>
        </div>
      </div>

      {/* Impersonation result banner */}
      {impersonationToken && (
        <div className="mb-6 bg-emerald-900/30 border border-emerald-700 rounded-lg p-4">
          <p className="text-emerald-400 text-sm font-semibold mb-2">✓ Impersonation token generated — expires in 30 minutes</p>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 bg-[#0a0a0f] text-emerald-300 text-xs px-3 py-2 rounded font-mono truncate">
              {impersonationToken}
            </code>
            <button
              onClick={copyToken}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-200 text-xs rounded transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Token'}
            </button>
          </div>
          {impersonationLoginUrl && (
            <a
              href={impersonationLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Merchant Dashboard
            </a>
          )}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-5">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Plan & Limits</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Plan</span>
              <span className="text-white capitalize">{org.plan}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Locations</span>
              <span className="text-white">{org.maxLocations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Devices</span>
              <span className="text-white">{org.maxDevices}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Active Devices</span>
              <span className="text-white">{org._counts.activeDevices}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-5">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Account Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Country</span>
              <span className="text-white">{org.country}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Currency</span>
              <span className="text-white">{org.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">ABN</span>
              <span className="text-white">{org.abn ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Billing Email</span>
              <span className="text-white truncate max-w-[120px]">{org.billingEmail ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-5">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Onboarding Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Step</span>
              <span className="text-white">{org.onboardingStep}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Staff</span>
              <span className="text-white">{org._counts.activeEmployees}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Created</span>
              <span className="text-white">{new Date(org.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Updated</span>
              <span className="text-white">{new Date(org.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#1e1e2e] mb-6">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-white border-indigo-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6">
          <p className="text-gray-500 text-sm">Detailed metrics coming soon.</p>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Organisation ID</p>
              <p className="text-white font-mono text-xs mt-1">{org.id}</p>
            </div>
            <div>
              <p className="text-gray-500">Timezone</p>
              <p className="text-white mt-1">{org.timezone}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Label</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Platform</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Last Seen</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-600">No devices</td>
                </tr>
              ) : (
                devices.map((d) => (
                  <tr key={d.id} className="border-b border-[#1e1e2e]">
                    <td className="px-6 py-3 text-white">{d.label ?? d.id.slice(0, 8)}</td>
                    <td className="px-6 py-3 text-gray-400 uppercase text-xs">{d.role}</td>
                    <td className="px-6 py-3 text-gray-400">{d.platform ?? '—'}</td>
                    <td className="px-6 py-3 text-gray-400">
                      {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${d.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6">
          <p className="text-gray-500 text-sm">
            {org._counts.activeEmployees} active staff members. Full staff list requires direct DB query.
          </p>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="space-y-4">
          {/* Current Plan */}
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-5">
            <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Current Plan
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500 text-xs">Plan</p>
                <p className="text-white capitalize font-semibold mt-1">{org.plan}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Status</p>
                <p className={`font-semibold mt-1 ${org.planStatus === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                  {org.planStatus}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Billing Email</p>
                <p className="text-white mt-1">{org.billingEmail ?? '—'}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[#1e1e2e]">
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Change Plan / Limits
              </button>
            </div>
          </div>

          {/* Stripe Actions */}
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-5">
            <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-4">Stripe Billing</h3>
            <div className="space-y-3 text-sm">
              <a
                href={`https://dashboard.stripe.com/connect/accounts`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-[#0a0a0f] border border-[#1e1e2e] hover:border-indigo-500 text-gray-300 hover:text-white rounded transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View in Stripe Connect Dashboard
              </a>
              <a
                href={`https://dashboard.stripe.com/customers`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-[#0a0a0f] border border-[#1e1e2e] hover:border-indigo-500 text-gray-300 hover:text-white rounded transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Stripe Customers
              </a>
            </div>
            <p className="text-gray-600 text-xs mt-4">
              Search by billing email: <span className="text-gray-400 font-mono">{org.billingEmail ?? '—'}</span>
            </p>
          </div>

          {/* Suspend / Reactivate */}
          <div className="bg-[#111118] border border-red-900/40 rounded-lg p-5">
            <h3 className="text-red-400 text-xs uppercase tracking-wider mb-3">Danger Zone</h3>
            <p className="text-gray-500 text-sm mb-4">
              Suspending an org blocks all logins for that merchant immediately.
              Setting planStatus to <code className="text-red-400">suspended</code> triggers the auth service to reject tokens.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!confirm(`Suspend ${org.name}? All logins will be blocked immediately.`)) return;
                  await platformFetch(`platform/organisations/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ planStatus: 'suspended' }),
                  }).catch(() => null);
                  window.location.reload();
                }}
                disabled={org.planStatus === 'suspended'}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
              >
                Suspend Account
              </button>
              <button
                onClick={async () => {
                  await platformFetch(`platform/organisations/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ planStatus: 'active' }),
                  }).catch(() => null);
                  window.location.reload();
                }}
                disabled={org.planStatus === 'active'}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
              >
                Reactivate Account
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6">
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
            Internal Notes (stored locally)
          </label>
          <textarea
            value={notes}
            onChange={(e) => saveNotes(e.target.value)}
            rows={8}
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Add internal notes about this merchant..."
          />
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Edit Plan</h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Plan</label>
                <select
                  value={editForm.plan}
                  onChange={(e) => setEditForm((f) => ({ ...f, plan: e.target.value }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Max Locations
                </label>
                <input
                  type="number"
                  min={1}
                  value={editForm.maxLocations}
                  onChange={(e) => setEditForm((f) => ({ ...f, maxLocations: Number(e.target.value) }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Max Devices
                </label>
                <input
                  type="number"
                  min={1}
                  value={editForm.maxDevices}
                  onChange={(e) => setEditForm((f) => ({ ...f, maxDevices: Number(e.target.value) }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
