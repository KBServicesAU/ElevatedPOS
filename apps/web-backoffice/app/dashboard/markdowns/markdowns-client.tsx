'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { Tag, Plus, X, Ban, AlertCircle } from 'lucide-react';

type MarkdownStatus = 'active' | 'scheduled' | 'expired';
type DiscountType = 'percentage' | 'fixed';
type ScopeType = 'all' | 'category' | 'product';

interface Markdown {
  id: string;
  name: string;
  description: string;
  scope: ScopeType;
  scopeLabel: string;
  discountType: DiscountType;
  discountValue: number;
  startsAt: string;
  endsAt: string | null;
  status: MarkdownStatus;
}

interface MarkdownsResponse {
  data: Markdown[];
}

const MOCK_DATA: Markdown[] = [
  {
    id: 'md1',
    name: 'Spring Sale — All Products',
    description: '10% off everything storewide for spring.',
    scope: 'all',
    scopeLabel: 'All Products',
    discountType: 'percentage',
    discountValue: 10,
    startsAt: 'Mar 20, 2026 09:00',
    endsAt: 'Mar 31, 2026 23:59',
    status: 'active',
  },
  {
    id: 'md2',
    name: 'Electronics — Category Promo',
    description: 'Mid-season discount on all electronics.',
    scope: 'category',
    scopeLabel: 'Electronics',
    discountType: 'percentage',
    discountValue: 15,
    startsAt: 'Apr 1, 2026 00:00',
    endsAt: 'Apr 14, 2026 23:59',
    status: 'scheduled',
  },
  {
    id: 'md3',
    name: 'Clearance — MacBook Pro 14"',
    description: 'Fixed $200 off to clear old stock.',
    scope: 'product',
    scopeLabel: 'MacBook Pro 14"',
    discountType: 'fixed',
    discountValue: 200,
    startsAt: 'Jan 1, 2026 00:00',
    endsAt: 'Feb 28, 2026 23:59',
    status: 'expired',
  },
];

const MOCK_CATEGORIES = ['Electronics', 'Clothing', 'Food & Beverage', 'Home & Garden', 'Sporting Goods', 'Toys'];

type FilterTab = 'all' | MarkdownStatus;

const STATUS_STYLES: Record<MarkdownStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

function timeUntil(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const end = new Date(dateStr.replace(',', ''));
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

export default function MarkdownsClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<Markdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    scope: 'all' as ScopeType,
    category: '',
    productSearch: '',
    discountType: 'percentage' as DiscountType,
    discountValue: '',
    startsAt: '',
    endsAt: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<MarkdownsResponse>('markdowns');
      setItems(res.data ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setForm({ name: '', description: '', scope: 'all', category: '', productSearch: '', discountType: 'percentage', discountValue: '', startsAt: '', endsAt: '' });
  }

  function getScopeLabel(): string {
    if (form.scope === 'all') return 'All Products';
    if (form.scope === 'category') return form.category || 'Category';
    return form.productSearch || 'Product';
  }

  function inferStatus(startsAt: string, endsAt: string): MarkdownStatus {
    const now = new Date();
    const start = new Date(startsAt);
    if (start > now) return 'scheduled';
    if (endsAt) {
      const end = new Date(endsAt);
      if (end < now) return 'expired';
    }
    return 'active';
  }

  async function handleCreate() {
    if (!form.name || !form.discountValue) return;
    setSaving(true);
    const status = form.startsAt ? inferStatus(form.startsAt, form.endsAt) : 'active';
    const payload = {
      name: form.name,
      description: form.description,
      scope: form.scope,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      startsAt: form.startsAt,
      endsAt: form.endsAt || null,
    };
    try {
      await apiFetch('markdowns', { method: 'POST', body: JSON.stringify(payload) });
      const newMarkdown: Markdown = {
        id: `md${Date.now()}`,
        name: form.name,
        description: form.description,
        scope: form.scope,
        scopeLabel: getScopeLabel(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        startsAt: form.startsAt || new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
        endsAt: form.endsAt || null,
        status,
      };
      setItems((prev) => [newMarkdown, ...prev]);
      resetForm();
      setShowModal(false);
      toast({ title: 'Markdown created', description: `"${form.name}" has been created.`, variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to create markdown', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await apiFetch(`markdowns/${id}/deactivate`, { method: 'POST' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to deactivate markdown', description: msg, variant: 'destructive' });
      return;
    }
    setItems((prev) => prev.map((m) => m.id === id ? { ...m, status: 'expired' as MarkdownStatus } : m));
    toast({ title: 'Markdown deactivated', variant: 'success' });
  }

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `All (${items.length})` },
    { id: 'active', label: `Active (${items.filter((i) => i.status === 'active').length})` },
    { id: 'scheduled', label: `Scheduled (${items.filter((i) => i.status === 'scheduled').length})` },
    { id: 'expired', label: `Expired (${items.filter((i) => i.status === 'expired').length})` },
  ];

  const filtered = activeTab === 'all' ? items : items.filter((m) => m.status === activeTab);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Markdowns</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Schedule and manage price markdowns</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Markdown
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-elevatedpos-500 text-elevatedpos-600 dark:text-elevatedpos-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 dark:border-gray-700 dark:bg-gray-800/40">
          <Tag className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No {activeTab !== 'all' ? activeTab : ''} markdowns found.</p>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Scope</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Discount</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Starts</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Ends</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((md) => {
                const countdown = md.status === 'active' ? timeUntil(md.endsAt) : null;
                return (
                  <tr key={md.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900 dark:text-white">{md.name}</p>
                      {md.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{md.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 capitalize">
                      <span className="text-xs">{md.scopeLabel}</span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white">
                      {md.discountType === 'percentage' ? `${md.discountValue}%` : `$${md.discountValue.toFixed(2)}`}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">{md.startsAt}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">{md.endsAt ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[md.status]}`}>
                          {md.status}
                        </span>
                        {md.status === 'active' && (
                          <span className="rounded-full bg-emerald-500 text-white px-2 py-0.5 text-xs font-bold tracking-wide">
                            LIVE
                          </span>
                        )}
                        {countdown && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">{countdown}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {md.status !== 'expired' && (
                        <button
                          onClick={() => { void handleDeactivate(md.id); }}
                          title="Deactivate"
                          className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Markdown Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Create Markdown</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. End of Season Sale"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Description</label>
                <input
                  type="text"
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>

              {/* Scope */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Scope</label>
                <select
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value as ScopeType, category: '', productSearch: '' })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 bg-white"
                >
                  <option value="all">All Products</option>
                  <option value="category">By Category</option>
                  <option value="product">Specific Product</option>
                </select>
              </div>

              {form.scope === 'category' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 bg-white"
                  >
                    <option value="">Select a category</option>
                    {MOCK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.scope === 'product' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Product</label>
                  <input
                    type="text"
                    placeholder="Search for a product..."
                    value={form.productSearch}
                    onChange={(e) => setForm({ ...form, productSearch: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                </div>
              )}

              {/* Discount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Discount Type</label>
                  <div className="flex gap-2">
                    {(['percentage', 'fixed'] as DiscountType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm({ ...form, discountType: type })}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          form.discountType === type
                            ? 'border-elevatedpos-500 bg-elevatedpos-50 text-elevatedpos-700 dark:bg-elevatedpos-900/30 dark:text-elevatedpos-300'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                        }`}
                      >
                        {type === 'percentage' ? '% Off' : '$ Fixed'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Value <span className="text-red-500">*</span> {form.discountType === 'percentage' ? '(%)' : '($)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={form.discountType === 'percentage' ? '1' : '0.01'}
                    max={form.discountType === 'percentage' ? '100' : undefined}
                    placeholder={form.discountType === 'percentage' ? '10' : '50.00'}
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Start Date/Time</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">End Date/Time <span className="text-gray-400">(optional)</span></label>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
              </div>

              {/* Preview */}
              {form.discountValue && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Preview: <span className="font-medium text-gray-900 dark:text-white">{form.name || 'Untitled'}</span>
                    {' — '}{form.discountType === 'percentage' ? `${form.discountValue}% off` : `$${Number(form.discountValue).toFixed(2)} off`}
                    {' on '}<span className="font-medium text-gray-900 dark:text-white">{getScopeLabel()}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.name || !form.discountValue || saving}
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Tag className="h-4 w-4" />
                )}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
