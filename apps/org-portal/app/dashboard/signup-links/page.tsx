'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Link2,
  Copy,
  Check,
  Plus,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignupLink {
  id: string;
  code: string;
  plan?: string;
  orgNameHint?: string;
  note?: string;
  status?: string;
  expiresAt?: string;
  createdAt?: string;
  createdByName?: string;
  createdById?: string;
}

interface ApiSignupLinkResponse {
  links?: SignupLink[];
  data?: SignupLink[];
  signupLinks?: SignupLink[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SIGNUP_BASE = 'https://app.elevatedpos.com.au/signup';

async function apiFetch(path: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(`/api/proxy/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const msg =
      (data as { message?: string; error?: string })?.message ??
      (data as { message?: string; error?: string })?.error ??
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function statusClass(status?: string): string {
  const s = (status ?? 'active').toLowerCase();
  if (s === 'active') return 'bg-green-100 text-green-800';
  if (s === 'expired') return 'bg-red-100 text-red-700';
  if (s === 'used') return 'bg-gray-100 text-gray-600';
  return 'bg-yellow-100 text-yellow-800';
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy link"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
        copied
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
      }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const PLAN_OPTIONS = ['starter', 'growth', 'pro', 'enterprise'];

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [plan, setPlan] = useState('');
  const [orgNameHint, setOrgNameHint] = useState('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('platform/signup-links', {
        method: 'POST',
        body: JSON.stringify({
          plan: plan || undefined,
          orgNameHint: orgNameHint || undefined,
          note: note || undefined,
          expiresAt: expiresAt || undefined,
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Create Signup Link</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Plan */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Plan <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
            >
              <option value="">No specific plan</option>
              {PLAN_OPTIONS.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Org name hint */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Org Name Hint <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={orgNameHint}
              onChange={(e) => setOrgNameHint(e.target.value)}
              placeholder="e.g. Acme Cafe"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note about this link…"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Expiry Date <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle size={14} />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Create Link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SignupLinksPage() {
  const [links, setLinks] = useState<SignupLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const data = await apiFetch('platform/signup-links');
      if (Array.isArray(data)) {
        setLinks(data as SignupLink[]);
      } else if (data && typeof data === 'object') {
        const d = data as ApiSignupLinkResponse;
        if (Array.isArray(d.links)) setLinks(d.links);
        else if (Array.isArray(d.signupLinks)) setLinks(d.signupLinks);
        else if (Array.isArray(d.data)) setLinks(d.data);
        else setLinks([]);
      } else {
        setLinks([]);
      }
    } catch (err) {
      setFetchError((err as Error).message);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Link2 size={24} className="text-blue-700" />
            Signup Links
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage referral and signup links for new merchants
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchLinks()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Create Link
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            Loading signup links…
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-red-500">
            <AlertCircle size={20} />
            <span>{fetchError}</span>
            <button
              onClick={() => void fetchLinks()}
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <Link2 size={36} className="opacity-30" />
            <p className="text-sm">No signup links found.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors"
            >
              <Plus size={14} />
              Create your first link
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
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
                    Note
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono font-medium text-gray-900">
                      {link.code}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {link.plan ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                          {link.plan}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{link.orgNameHint ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {link.note ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusClass(
                          link.status
                        )}`}
                      >
                        {link.status ?? 'active'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {link.createdByName ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {link.createdAt ? new Date(link.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <CopyButton text={`${SIGNUP_BASE}?ref=${link.code}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={() => void fetchLinks()} />
      )}
    </div>
  );
}
