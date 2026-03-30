'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Star, TrendingUp, Users, Gift, X, ShoppingBag, Zap, FileText, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCustomers } from '@/lib/hooks';
import { apiFetch } from '@/lib/api';
import type { Customer } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { formatCurrency, getErrorMessage } from '@/lib/formatting';

const tierColors: Record<string, string> = {
  platinum: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  gold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  silver: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  bronze: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const eventTypeIcon: Record<string, React.ReactNode> = {
  order: <ShoppingBag className="h-3.5 w-3.5 text-indigo-500" />,
  loyalty: <Zap className="h-3.5 w-3.5 text-yellow-500" />,
  note: <FileText className="h-3.5 w-3.5 text-gray-400" />,
};

function timeAgo(iso?: string) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Customer Detail Panel ─────────────────────────────────────────────────────

type TimelineEvent = {
  type: string;
  date: string;
  description: string;
  metadata: Record<string, unknown>;
};

type Note = {
  id: string;
  content: string;
  isInternal: boolean;
  authorId?: string;
  createdAt: string;
};

function CustomerDetailPanel({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes'>('timeline');
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [submittingNote, setSubmittingNote] = useState(false);

  const initials = `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase();

  useEffect(() => {
    if (activeTab === 'timeline') {
      setLoadingTimeline(true);
      fetch(`/api/proxy/crm/customers/${customer.id}/timeline`)
        .then((r) => r.json())
        .then((d) => setTimeline(d.events ?? []))
        .catch(() => setTimeline([]))
        .finally(() => setLoadingTimeline(false));
    } else {
      setLoadingNotes(true);
      fetch(`/api/proxy/crm/customers/${customer.id}/notes`)
        .then((r) => r.json())
        .then((d) => setNotes(d.data ?? []))
        .catch(() => setNotes([]))
        .finally(() => setLoadingNotes(false));
    }
  }, [activeTab, customer.id]);

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/proxy/crm/customers/${customer.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteText.trim(), isInternal }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes((prev) => [data.data, ...prev]);
        setNoteText('');
      }
    } finally {
      setSubmittingNote(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    const res = await fetch(`/api/proxy/crm/customers/${customer.id}/notes/${noteId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/20 dark:bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
              {initials}
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {customer.firstName} {customer.lastName}
              </p>
              <p className="text-xs text-gray-400">{customer.email ?? customer.phone ?? '—'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Customer stats */}
        <div className="grid grid-cols-3 gap-px border-b border-gray-100 bg-gray-100 dark:border-gray-800 dark:bg-gray-800">
          {[
            { label: 'LTV', value: formatCurrency(customer.totalSpend ?? 0) },
            { label: 'Visits', value: (customer.totalVisits ?? 0).toString() },
            { label: 'Last Visit', value: timeAgo(customer.lastVisitAt) },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-3 dark:bg-gray-900">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tier badge */}
        {customer.loyaltyTier && (
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-2.5 dark:border-gray-800">
            <Star className="h-3.5 w-3.5 text-yellow-500" />
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${tierColors[customer.loyaltyTier.toLowerCase()] ?? 'bg-gray-100 text-gray-600'}`}>
              {customer.loyaltyTier}
            </span>
            <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
              <Gift className="h-3.5 w-3.5 text-indigo-400" />
              {(customer.loyaltyPoints ?? 0).toLocaleString()} pts
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {(['timeline', 'notes'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div className="px-6 py-4">
              {loadingTimeline ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex animate-pulse gap-3">
                      <div className="mt-1 h-6 w-6 rounded-full bg-gray-100 dark:bg-gray-800" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-gray-800" />
                        <div className="h-2.5 w-1/2 rounded bg-gray-100 dark:bg-gray-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : timeline.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No activity yet.</p>
              ) : (
                <ol className="relative border-l border-gray-200 dark:border-gray-700">
                  {timeline.map((evt, i) => (
                    <li key={i} className="mb-5 ml-4">
                      <div className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-gray-200 dark:border-gray-900 dark:bg-gray-700" />
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5">{eventTypeIcon[evt.type] ?? <FileText className="h-3.5 w-3.5 text-gray-300" />}</span>
                        <div>
                          <p className="text-sm text-gray-800 dark:text-gray-200">{evt.description}</p>
                          <time className="text-xs text-gray-400">{formatDate(evt.date)}</time>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div className="flex flex-col gap-4 px-6 py-4">
              {/* Add note form */}
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note about this customer…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded"
                    />
                    Internal (managers only)
                  </label>
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || submittingNote}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                    {submittingNote ? 'Adding…' : 'Add Note'}
                  </button>
                </div>
              </div>

              {/* Notes list */}
              {loadingNotes ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                      <div className="mb-2 h-3 w-full rounded bg-gray-100 dark:bg-gray-800" />
                      <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
                    </div>
                  ))}
                </div>
              ) : notes.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">No notes yet.</p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className={`group relative rounded-xl border p-4 ${
                      note.isInternal
                        ? 'border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10'
                        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                    }`}
                  >
                    {note.isInternal && (
                      <span className="mb-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Internal
                      </span>
                    )}
                    <p className="text-sm text-gray-800 dark:text-gray-200">{note.content}</p>
                    <p className="mt-1.5 text-xs text-gray-400">{formatDate(note.createdAt)}</p>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="absolute right-3 top-3 hidden rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 group-hover:block dark:hover:bg-gray-700"
                      title="Delete note"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Add Customer Modal ────────────────────────────────────────────────────────

interface AddCustomerForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const EMPTY_CUSTOMER_FORM: AddCustomerForm = { firstName: '', lastName: '', email: '', phone: '' };

function AddCustomerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AddCustomerForm>(EMPTY_CUSTOMER_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  function set<K extends keyof AddCustomerForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
      };
      await apiFetch('customers', { method: 'POST', body: JSON.stringify(payload) });
      toast({
        title: 'Customer added',
        description: `${form.firstName} ${form.lastName} has been added.`,
        variant: 'success',
      });
      onSaved();
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create customer');
      setError(msg);
      toast({ title: 'Failed to add customer', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Customer</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                placeholder="Jane"
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                placeholder="Smith"
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="jane@example.com"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+61 400 000 000"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.firstName || !form.lastName}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding…' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function CustomersClient() {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useCustomers({
    search: search || undefined,
    limit: 50,
  });

  const customers = data?.data ?? [];
  const total = data?.pagination?.total ?? customers.length;

  // Compute summary stats from returned data (real stats would come from a dedicated endpoint)
  const loyaltyMembers = customers.filter((c) => c.loyaltyTier).length;
  const avgSpend =
    customers.length > 0
      ? customers.reduce((sum, c) => sum + (c.totalSpend ?? 0), 0) / customers.length
      : 0;

  return (
    <>
      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['customers'] })}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Customers</h2>
            <p className="text-sm text-gray-500">
              {isLoading ? 'Loading…' : `${total} registered customers`}
            </p>
          </div>
          <button
            onClick={() => setShowAddCustomer(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Customer
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Customers', value: isLoading ? '—' : total.toLocaleString(), icon: Users, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
            { label: 'Avg Lifetime Value', value: isLoading ? '—' : formatCurrency(avgSpend), icon: TrendingUp, color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
            { label: 'Loyalty Members', value: isLoading ? '—' : loyaltyMembers.toLocaleString(), icon: Star, color: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                <div className={`rounded-xl p-2 ${stat.color}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* Customer table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {isError ? (
            <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">
              Failed to load customers.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Customer</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tier</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Visits</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Total Spend</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Points</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Last Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5">
                            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800" style={{ width: '80%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : customers.map((c: Customer) => {
                      const initials = `${c.firstName[0]}${c.lastName[0]}`.toUpperCase();
                      const tier = c.loyaltyTier?.toLowerCase() ?? '';
                      return (
                        <tr
                          key={c.id}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          onClick={() => setSelectedCustomer(c)}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                                {initials}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {c.firstName} {c.lastName}
                                </p>
                                <p className="text-xs text-gray-400">{c.email ?? c.phone ?? '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {tier ? (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tierColors[tier] ?? 'bg-gray-100 text-gray-600'}`}>
                                <Star className="h-3 w-3" /> {c.loyaltyTier}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{c.totalVisits}</td>
                          <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">
                            {formatCurrency(c.totalSpend)}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                              <Gift className="h-3.5 w-3.5 text-indigo-500" />
                              {(c.loyaltyPoints ?? 0).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                            {timeAgo(c.lastVisitAt)}
                          </td>
                        </tr>
                      );
                    })}
                {!isLoading && customers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Customer detail side panel */}
      {selectedCustomer && (
        <CustomerDetailPanel
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </>
  );
}
