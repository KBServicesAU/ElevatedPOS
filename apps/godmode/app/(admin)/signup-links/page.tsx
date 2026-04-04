'use client';

import { useEffect, useState, useCallback } from 'react';
import { platformFetch } from '@/lib/api';
import { Plus, X, Copy, Check, Link as LinkIcon } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  slug: string;
  monthlyPrice: number;
}

interface SignupLink {
  id: string;
  code: string;
  planId: string | null;
  plan?: { name: string } | null;
  orgNameHint: string | null;
  customMonthlyPrice: number | null;
  customAnnualPrice: number | null;
  customTrialDays: number | null;
  note: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  createdById: string | null;
  createdBy?: { email: string } | null;
  createdAt: string;
}

interface LinksResponse {
  data: SignupLink[];
}

interface PlansResponse {
  data: Plan[];
}

interface CreateForm {
  planId: string;
  orgNameHint: string;
  customMonthlyPrice: string;
  customAnnualPrice: string;
  customTrialDays: string;
  note: string;
  expiresAt: string;
}

const EMPTY_FORM: CreateForm = {
  planId: '',
  orgNameHint: '',
  customMonthlyPrice: '',
  customAnnualPrice: '',
  customTrialDays: '',
  note: '',
  expiresAt: '',
};

type StatusFilter = 'all' | 'active' | 'expired' | 'used';

function getLinkStatus(link: SignupLink): 'used' | 'expired' | 'active' {
  if (link.usedAt) return 'used';
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return 'expired';
  return 'active';
}

const STATUS_COLORS = {
  active: 'bg-green-500/20 text-green-400',
  expired: 'bg-yellow-500/20 text-yellow-400',
  used: 'bg-gray-500/20 text-gray-500',
};

const BASE_SIGNUP_URL = 'https://app.elevatedpos.com.au/signup?ref=';

export default function SignupLinksPage() {
  const [links, setLinks] = useState<SignupLink[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [createError, setCreateError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<SignupLink | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksData, plansData] = await Promise.all([
        platformFetch('platform/signup-links') as Promise<LinksResponse>,
        platformFetch('platform/plans') as Promise<PlansResponse>,
      ]);
      setLinks(linksData.data ?? []);
      setPlans(plansData.data ?? []);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    setCreateSubmitting(true);
    setCreateError('');
    try {
      const payload: Record<string, unknown> = {};
      if (form.planId) payload.planId = form.planId;
      if (form.orgNameHint) payload.orgNameHint = form.orgNameHint;
      if (form.customMonthlyPrice) payload.customMonthlyPrice = parseFloat(form.customMonthlyPrice);
      if (form.customAnnualPrice) payload.customAnnualPrice = parseFloat(form.customAnnualPrice);
      if (form.customTrialDays) payload.customTrialDays = parseInt(form.customTrialDays);
      if (form.note) payload.note = form.note;
      if (form.expiresAt) payload.expiresAt = new Date(form.expiresAt).toISOString();

      const data = (await platformFetch('platform/signup-links', {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as { data: SignupLink };

      setCreatedLink(data.data);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create signup link');
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm('Deactivate this signup link?')) return;
    try {
      await platformFetch(`platform/signup-links/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ expiresAt: new Date().toISOString() }),
      });
      await load();
    } catch {
      alert('Failed to deactivate link.');
    }
  }

  function copyLink(code: string, id: string) {
    void navigator.clipboard.writeText(`${BASE_SIGNUP_URL}${code}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filtered = links.filter((l) => {
    if (statusFilter === 'all') return true;
    return getLinkStatus(l) === statusFilter;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Signup Links</h1>
          <p className="text-gray-500 text-sm mt-1">Custom referral links with optional pricing overrides</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setCreateError(''); setCreatedLink(null); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Link
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(['all', 'active', 'expired', 'used'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 text-xs rounded capitalize transition-colors ${
              statusFilter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-[#111118] border border-[#1e1e2e] text-gray-400 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Plan</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Org Hint</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Price Override</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Trial Days</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Created By</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Expires</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-600">Loading...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-600">No signup links found</td>
              </tr>
            ) : (
              filtered.map((link) => {
                const status = getLinkStatus(link);
                return (
                  <tr key={link.id} className="border-b border-[#1e1e2e] hover:bg-[#1e1e2e]/30">
                    <td className="px-4 py-3">
                      <span className="font-mono text-indigo-300 text-xs">{link.code}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {link.plan?.name ?? (link.planId ? link.planId.slice(0, 8) : '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{link.orgNameHint ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {link.customMonthlyPrice != null ? `$${link.customMonthlyPrice}/mo` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {link.customTrialDays != null ? `${link.customTrialDays}d` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {link.createdBy?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${STATUS_COLORS[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyLink(link.code, link.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 rounded text-xs hover:bg-indigo-600/30 transition-colors"
                        >
                          {copiedId === link.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedId === link.id ? 'Copied' : 'Copy'}
                        </button>
                        {status === 'active' && (
                          <button
                            onClick={() => handleDeactivate(link.id)}
                            className="px-2.5 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-xs hover:bg-red-600/30 transition-colors"
                          >
                            Expire
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Create Signup Link</h3>
              <button onClick={() => { setShowCreateModal(false); setCreatedLink(null); }} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdLink ? (
              <div className="space-y-4">
                <p className="text-green-400 text-sm font-medium">Link created successfully!</p>
                <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3">
                  <p className="text-gray-500 text-xs mb-1">Signup URL</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-indigo-300 text-xs font-mono break-all">
                      {BASE_SIGNUP_URL}{createdLink.code}
                    </code>
                    <button
                      onClick={() => copyLink(createdLink.code, 'created')}
                      className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 rounded text-xs hover:bg-indigo-600/30 transition-colors shrink-0"
                    >
                      {copiedId === 'created' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedId === 'created' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded p-3">
                  <p className="text-gray-500 text-xs mb-1">Code</p>
                  <code className="text-white text-sm font-mono">{createdLink.code}</code>
                </div>
                <button
                  onClick={() => { setShowCreateModal(false); setCreatedLink(null); }}
                  className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Plan</label>
                  <select
                    value={form.planId}
                    onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select a plan...</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} (${p.monthlyPrice}/mo)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Org Name Hint (optional)</label>
                  <input
                    type="text"
                    value={form.orgNameHint}
                    onChange={(e) => setForm((f) => ({ ...f, orgNameHint: e.target.value }))}
                    placeholder="Pre-fill org name during signup"
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Custom Monthly ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.customMonthlyPrice}
                      onChange={(e) => setForm((f) => ({ ...f, customMonthlyPrice: e.target.value }))}
                      placeholder="Override"
                      className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Custom Annual ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.customAnnualPrice}
                      onChange={(e) => setForm((f) => ({ ...f, customAnnualPrice: e.target.value }))}
                      placeholder="Override"
                      className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Trial Days</label>
                    <input
                      type="number"
                      min="0"
                      value={form.customTrialDays}
                      onChange={(e) => setForm((f) => ({ ...f, customTrialDays: e.target.value }))}
                      placeholder="Override"
                      className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Expiry Date (optional)</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Note (optional)</label>
                  <textarea
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    rows={2}
                    placeholder="Internal note about this link..."
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                {createError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 text-sm">
                    {createError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2.5 border border-[#1e1e2e] text-gray-400 text-sm rounded hover:bg-[#1e1e2e] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={createSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                  >
                    <LinkIcon className="w-4 h-4" />
                    {createSubmitting ? 'Creating...' : 'Create Link'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
