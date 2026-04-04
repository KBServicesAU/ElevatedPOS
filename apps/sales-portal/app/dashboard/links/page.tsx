'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Copy, Check, X, ExternalLink } from 'lucide-react';

interface SignupLink {
  id: string;
  code: string;
  planId?: string;
  orgName?: string;
  note?: string;
  expiresAt?: string;
  usedAt?: string;
  usedByOrgId?: string;
  isActive: boolean;
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  monthlyPrice: number;
}

interface LinksApiResponse {
  links?: SignupLink[];
  data?: SignupLink[];
}

interface PlansApiResponse {
  plans?: Plan[];
  data?: Plan[];
}

const BASE_SIGNUP_URL = 'https://app.elevatedpos.com.au/signup';

export default function LinksPage() {
  const [links, setLinks] = useState<SignupLink[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Form state
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const fetchLinks = useCallback(() => {
    setLoading(true);
    fetch('/api/proxy/signup-links')
      .then((r) => r.json())
      .then((data: LinksApiResponse | SignupLink[]) => {
        if (Array.isArray(data)) {
          setLinks(data);
        } else if (data && 'links' in data && Array.isArray(data.links)) {
          setLinks(data.links);
        } else if (data && 'data' in data && Array.isArray(data.data)) {
          setLinks(data.data);
        }
      })
      .catch(() => setLinks([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLinks();

    fetch('/api/proxy/plans/public')
      .then((r) => r.json())
      .then((data: PlansApiResponse | Plan[]) => {
        if (Array.isArray(data)) {
          setPlans(data);
        } else if (data && 'plans' in data && Array.isArray(data.plans)) {
          setPlans(data.plans);
        } else if (data && 'data' in data && Array.isArray(data.data)) {
          setPlans(data.data);
        }
      })
      .catch(() => setPlans([]));
  }, [fetchLinks]);

  function resetForm() {
    setSelectedPlanId('');
    setOrgName('');
    setNote('');
    setExpiresAt('');
    setFormError('');
  }

  function openModal() {
    resetForm();
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    resetForm();
  }

  async function handleCreateLink(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {};
      if (selectedPlanId) body['planId'] = selectedPlanId;
      if (orgName.trim()) body['orgName'] = orgName.trim();
      if (note.trim()) body['note'] = note.trim();
      if (expiresAt) body['expiresAt'] = new Date(expiresAt).toISOString();

      const res = await fetch('/api/proxy/signup-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setFormError(data.error ?? `Error ${res.status}`);
        return;
      }

      closeModal();
      fetchLinks();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink(code: string, id: string) {
    const url = `${BASE_SIGNUP_URL}?ref=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback for older browsers
    }
  }

  const sortedLinks = links
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">My Signup Links</h1>
          <p className="text-sm text-gray-400 mt-1">Manage and share your referral signup links</p>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Create Link
        </button>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">Loading…</div>
        ) : sortedLinks.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-500 mb-3">No signup links yet</p>
            <button
              onClick={openModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Create your first link
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800">
              <thead className="bg-gray-900/60">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Org Hint
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Used By
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-mono text-sm text-emerald-400">{link.code}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-300">
                      {plans.find((p) => p.id === link.planId)?.name ?? (link.planId ? link.planId.slice(0, 8) + '…' : '—')}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-300">{link.orgName ?? '—'}</td>
                    <td className="px-5 py-3">
                      {link.usedByOrgId ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/40 text-blue-300 border border-blue-800">
                          Used
                        </span>
                      ) : link.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {link.usedByOrgId ? (
                        <span className="font-mono text-xs text-gray-400">{link.usedByOrgId.slice(0, 8)}…</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {new Date(link.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyLink(link.code, link.id)}
                          title="Copy signup link"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-700"
                        >
                          {copiedId === link.id ? (
                            <>
                              <Check size={12} className="text-emerald-400" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              Copy
                            </>
                          )}
                        </button>
                        <a
                          href={`${BASE_SIGNUP_URL}?ref=${link.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open signup link"
                          className="inline-flex items-center p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Link Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={closeModal}
          />
          <div className="relative bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md p-6">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Create Signup Link</h2>
              <button
                onClick={closeModal}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateLink} className="space-y-4">
              {/* Plan select */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Plan <span className="text-gray-500">(optional)</span>
                </label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">No specific plan</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — ${plan.monthlyPrice}/mo
                    </option>
                  ))}
                </select>
              </div>

              {/* Org name hint */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Org Name Hint <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Acme Cafe"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-800 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Note <span className="text-gray-500">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Internal notes about this link…"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-800 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Expiry date */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Expiry Date <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {formError && (
                <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm border border-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {submitting ? 'Creating…' : 'Create Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
