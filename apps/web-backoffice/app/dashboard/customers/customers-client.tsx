'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Search, Star, TrendingUp, Users, Gift, X, ShoppingBag, Zap, FileText, Send, Upload, Download, AlertCircle, Layers, Trash2, Filter } from 'lucide-react';
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

  const { toast: panelToast } = useToast();

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
        const data = await res.json() as { data: Note };
        setNotes((prev) => [data.data, ...prev]);
        setNoteText('');
      } else {
        let msg = `HTTP ${res.status}`;
        try { const b = await res.json() as { message?: string; error?: string }; msg = b.message ?? b.error ?? msg; } catch { /* ignore */ }
        panelToast({ title: 'Failed to add note', description: msg, variant: 'destructive' });
      }
    } catch (err) {
      panelToast({ title: 'Failed to add note', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSubmittingNote(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      const res = await fetch(`/api/proxy/crm/customers/${customer.id}/notes/${noteId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      } else {
        panelToast({ title: 'Failed to delete note', description: `HTTP ${res.status}`, variant: 'destructive' });
      }
    } catch (err) {
      panelToast({ title: 'Failed to delete note', description: getErrorMessage(err), variant: 'destructive' });
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

        {/* DOB / Anniversary */}
        {(customer.dateOfBirth || customer.anniversaryDate) && (
          <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-2.5 dark:border-gray-800">
            {customer.dateOfBirth && (
              <div>
                <p className="text-xs text-gray-400">Date of Birth</p>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {new Date(customer.dateOfBirth).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )}
            {customer.anniversaryDate && (
              <div>
                <p className="text-xs text-gray-400">Anniversary</p>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {new Date(customer.anniversaryDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )}
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
                    onClick={() => { void handleAddNote(); }}
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
                      onClick={() => { void handleDeleteNote(note.id); }}
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
  dateOfBirth: string;
  anniversaryDate: string;
}

const EMPTY_CUSTOMER_FORM: AddCustomerForm = { firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', anniversaryDate: '' };

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
        dateOfBirth: form.dateOfBirth || undefined,
        anniversaryDate: form.anniversaryDate || undefined,
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Anniversary <span className="text-gray-400 text-xs">(optional)</span></label>
              <input
                type="date"
                value={form.anniversaryDate}
                onChange={(e) => set('anniversaryDate', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
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

// ─── CSV Import Modal ──────────────────────────────────────────────────────────

interface CsvRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const SAMPLE_CSV = `firstName,lastName,email,phone\nJane,Smith,jane@example.com,0412345678`;

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idxOf = (name: string) => headers.indexOf(name);
  const fi = idxOf('firstname');
  const li = idxOf('lastname');
  const ei = idxOf('email');
  const pi = idxOf('phone');

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    return {
      firstName: fi >= 0 ? (cols[fi] ?? '') : '',
      lastName: li >= 0 ? (cols[li] ?? '') : '',
      email: ei >= 0 ? (cols[ei] ?? '') : '',
      phone: pi >= 0 ? (cols[pi] ?? '') : '',
    };
  }).filter((r) => r.firstName || r.lastName || r.email);
}

function ImportCsvModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvRow[]>([]);
  const [allRows, setAllRows] = useState<CsvRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setParseError('');
    setPreview([]);
    setAllRows([]);
    if (!f) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const rows = parseCsv(text);
        if (rows.length === 0) {
          setParseError('No valid rows found. Make sure the CSV has the required columns.');
          return;
        }
        setAllRows(rows);
        setPreview(rows.slice(0, 5));
      } catch {
        setParseError('Failed to parse CSV. Please check the file format.');
      }
    };
    reader.readAsText(f);
  }

  function handleDownloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-customers.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (allRows.length === 0) return;
    setImporting(true);
    setProgress({ current: 0, total: allRows.length });

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      setProgress({ current: i + 1, total: allRows.length });
      try {
        await apiFetch('customers', {
          method: 'POST',
          body: JSON.stringify({
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email || undefined,
            phone: row.phone || undefined,
          }),
        });
        succeeded++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    setProgress(null);

    const description =
      failed === 0
        ? `Successfully imported ${succeeded} customer${succeeded !== 1 ? 's' : ''}.`
        : `Imported ${succeeded} customer${succeeded !== 1 ? 's' : ''} (${failed} failed).`;

    toast({
      title: 'Import complete',
      description,
      variant: failed === 0 ? 'success' : 'default',
    });

    onImported();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={importing ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Import Customers</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Upload a CSV file to import customers in bulk</p>
          </div>
          {!importing && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Format help */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-900/20">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Required CSV format</p>
            <p className="font-mono text-xs text-blue-600 dark:text-blue-300">firstName, lastName, email, phone</p>
            <button
              onClick={handleDownloadSample}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              <Download className="h-3 w-3" />
              Download sample CSV
            </button>
          </div>

          {/* File picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
              disabled={importing}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-5 w-5" />
              {file ? (
                <span>
                  <span className="font-medium text-gray-900 dark:text-white">{file.name}</span>
                  <span className="ml-2 text-gray-400">({allRows.length} row{allRows.length !== 1 ? 's' : ''})</span>
                </span>
              ) : (
                'Click to select a CSV file'
              )}
            </button>
          </div>

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {parseError}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                Preview (first {preview.length} of {allRows.length} rows)
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                    <tr>
                      {['First Name', 'Last Name', 'Email', 'Phone'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {preview.map((row, i) => (
                      <tr key={i} className="bg-white dark:bg-gray-900">
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.firstName || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.lastName || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{row.email || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{row.phone || <span className="text-gray-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import progress */}
          {importing && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>Importing {progress.current} of {progress.total}…</span>
                <span className="font-medium">{Math.round((progress.current / progress.total) * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-2 rounded-full bg-indigo-600 transition-all duration-200"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            disabled={importing}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={() => { void handleImport(); }}
            disabled={allRows.length === 0 || importing}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {importing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {importing ? 'Importing…' : `Import ${allRows.length > 0 ? `${allRows.length} ` : ''}Customers`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Segments ─────────────────────────────────────────────────────────────────

type ConditionField = 'spent_total' | 'visit_count' | 'last_visit' | 'tag' | 'city';
type ConditionOperator = 'greater_than' | 'less_than' | 'equals' | 'contains';

interface SegmentCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

interface Segment {
  id: string;
  name: string;
  description?: string;
  customerCount: number;
  conditions: SegmentCondition[];
}

const FIELD_LABELS: Record<ConditionField, string> = {
  spent_total: 'Total Spent',
  visit_count: 'Visit Count',
  last_visit: 'Last Visit (days ago)',
  tag: 'Tag',
  city: 'City',
};

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  greater_than: 'greater than',
  less_than: 'less than',
  equals: 'equals',
  contains: 'contains',
};

const FIELD_OPTIONS: ConditionField[] = ['spent_total', 'visit_count', 'last_visit', 'tag', 'city'];
const OPERATOR_OPTIONS: ConditionOperator[] = ['greater_than', 'less_than', 'equals', 'contains'];

function ConditionChip({ condition }: { condition: SegmentCondition }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
      <Filter className="h-3 w-3" />
      {FIELD_LABELS[condition.field]} {OPERATOR_LABELS[condition.operator]} <strong>{condition.value}</strong>
    </span>
  );
}

function CreateSegmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [conditions, setConditions] = useState<SegmentCondition[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addCondition = () => {
    setConditions((prev) => [...prev, { field: 'spent_total', operator: 'greater_than', value: '' }]);
  };

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, patch: Partial<SegmentCondition>) => {
    setConditions((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  };

  const fetchPreview = useCallback(async (conds: SegmentCondition[]) => {
    if (conds.length === 0) { setPreviewCount(null); return; }
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/proxy/customers/segments/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions: conds }),
      });
      if (res.ok) {
        const data = await res.json() as { count: number };
        setPreviewCount(data.count);
      } else {
        setPreviewCount(null);
      }
    } catch {
      setPreviewCount(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (conditions.length === 0) { setPreviewCount(null); return; }
    const timer = setTimeout(() => { void fetchPreview(conditions); }, 600);
    return () => clearTimeout(timer);
  }, [conditions, fetchPreview]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Segment name is required'); return; }
    setSaving(true);
    try {
      await apiFetch('customers/segments', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, conditions }),
      });
      toast({ title: 'Segment created', description: `"${name}" has been saved.`, variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create segment');
      setError(msg);
      toast({ title: 'Failed to create segment', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Segment</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Segment Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. High Value Customers"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Conditions</label>
              <button
                type="button"
                onClick={addCondition}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
              >
                <Plus className="h-3.5 w-3.5" /> Add Condition
              </button>
            </div>

            {conditions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-sm text-gray-400 dark:border-gray-700">
                No conditions — segment will match all customers.
              </p>
            ) : (
              <div className="space-y-2">
                {conditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
                    <select
                      value={cond.field}
                      onChange={(e) => updateCondition(i, { field: e.target.value as ConditionField })}
                      className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                      {FIELD_OPTIONS.map((f) => (
                        <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                      ))}
                    </select>
                    <select
                      value={cond.operator}
                      onChange={(e) => updateCondition(i, { operator: e.target.value as ConditionOperator })}
                      className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                      {OPERATOR_OPTIONS.map((op) => (
                        <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={cond.value}
                      onChange={(e) => updateCondition(i, { value: e.target.value })}
                      placeholder="value"
                      className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeCondition(i)}
                      className="rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-red-500 dark:hover:bg-gray-700"
                      title="Remove condition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {conditions.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2.5 text-sm dark:bg-indigo-900/20">
              <Users className="h-4 w-4 text-indigo-500" />
              {previewLoading ? (
                <span className="text-indigo-600 dark:text-indigo-400">Calculating…</span>
              ) : previewCount !== null ? (
                <span className="text-indigo-700 dark:text-indigo-300">
                  ~<strong>{previewCount.toLocaleString()}</strong> customers match
                </span>
              ) : (
                <span className="text-gray-500">Fill in conditions to see a preview</span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Segment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SegmentCard({ segment, onDeleted }: { segment: Segment; onDeleted: () => void }) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/proxy/customers/segments/${segment.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: 'Segment deleted', description: `"${segment.name}" has been removed.`, variant: 'success' });
      onDeleted();
    } catch (err) {
      toast({ title: 'Failed to delete segment', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 flex-shrink-0 text-indigo-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{segment.name}</h3>
          </div>
          {segment.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{segment.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            <Users className="h-3 w-3" />
            {segment.customerCount.toLocaleString()}
          </span>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { void handleDelete(); }}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? '…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
              title="Delete segment"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {segment.conditions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {segment.conditions.map((cond, i) => (
            <ConditionChip key={i} condition={cond} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400">No conditions — matches all customers</p>
      )}
    </div>
  );
}

function SegmentsTab() {
  const { toast } = useToast();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadSegments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/customers/segments');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { data: Segment[] };
      setSegments(data.data ?? []);
    } catch (err) {
      toast({ title: 'Failed to load segments', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadSegments(); }, [loadSegments]);

  return (
    <>
      {showCreate && (
        <CreateSegmentModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { void loadSegments(); }}
        />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading…' : `${segments.length} segment${segments.length !== 1 ? 's' : ''}`}
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Segment
          </button>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
            ))}
          </div>
        ) : segments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center dark:border-gray-700">
            <Layers className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="font-medium text-gray-700 dark:text-gray-300">No segments yet</p>
            <p className="mt-1 text-sm text-gray-500">Create segments to group customers by behaviour or attributes.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> New Segment
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {segments.map((seg) => (
              <SegmentCard
                key={seg.id}
                segment={seg}
                onDeleted={() => { void loadSegments(); }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function CustomersClient() {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'customers' | 'segments'>('customers');
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

  function handleRefresh() {
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
  }

  return (
    <>
      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onSaved={handleRefresh}
        />
      )}

      {showImportCsv && (
        <ImportCsvModal
          onClose={() => setShowImportCsv(false)}
          onImported={handleRefresh}
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
            {activeMainTab === 'customers' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportCsv(true)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                <Upload className="h-4 w-4" /> Import CSV
              </button>
              <button
                onClick={() => setShowAddCustomer(true)}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Customer
              </button>
            </div>
          )}
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

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-900/50 w-fit">
          {(['customers', 'segments'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveMainTab(tab)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeMainTab === tab
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab === 'customers' ? 'All Customers' : 'Segments'}
            </button>
          ))}
        </div>

        {/* Segments tab */}
        {activeMainTab === 'segments' && <SegmentsTab />}

        {/* Search */}
        {activeMainTab === 'customers' && <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>}

        {/* Customer table */}
        {activeMainTab === 'customers' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {isError ? (
            <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">
              Failed to load customers.
            </div>
          ) : (
            <table className="w-full min-w-[640px]">
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
        )}
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
