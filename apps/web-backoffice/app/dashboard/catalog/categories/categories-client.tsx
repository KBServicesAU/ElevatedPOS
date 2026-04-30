'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  color?: string;
  sortOrder: number;
  printerDestination?: string;
  kdsDestination?: string;
  customPrinterName?: string;
  customKdsName?: string;
  isActive: boolean;
}

interface CategoryForm {
  name: string;
  description: string;
  parentId: string;
  color: string;
  customColor: string;
  sortOrder: string;
  printerDestination: string;
  customPrinterName: string;
  kdsDestination: string;
  customKdsName: string;
  isActive: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { hex: '#ef4444', label: 'Red' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#8b5cf6', label: 'Purple' },
];

// v2.7.96 — kept these labels in sync with the POS side. The mobile
// app's `printOrderTickets` (apps/mobile/lib/printer.ts) groups order
// lines by their `category.printerDestination` and routes each group
// to the matching printer in `more.tsx` → Order Printer cards. The
// destination *value* on a line must literally equal the destination
// on a printer card. The dashboard form persists the lowercase value
// (Title Case label is just for display) so a category set to "Kitchen"
// in this dropdown matches a printer tagged "kitchen" in the POS.
//
// `None` → no kitchen ticket printed for this category at all (the POS
// drops these lines before grouping). Custom lets advanced users tag
// a free-form destination matching a custom printer name.
const ROUTING_OPTIONS: { value: string; label: string }[] = [
  { value: 'none',          label: 'None (no print)' },
  { value: 'kitchen',       label: 'Kitchen' },
  { value: 'bar',           label: 'Bar' },
  { value: 'cold_kitchen',  label: 'Cold Kitchen' },
  { value: 'ready_station', label: 'Ready Station' },
  { value: 'Custom',        label: 'Custom (specify name)' },
];

// v2.7.96 — back-compat: pre-v2.7.96 categories were saved with Title
// Case values like "Front" or "Back" that never actually matched any
// POS printer, so kitchen tickets silently stopped printing for those
// categories. Map the legacy values into the new lowercase ones so the
// dropdown shows a sensible default and the next save persists the
// correct value.
function normaliseLegacyDestination(v: string | null | undefined): string {
  if (!v) return 'none';
  const lower = v.toLowerCase().trim();
  if (lower === 'none' || lower === '') return 'none';
  if (lower === 'front' || lower === 'kitchen') return 'kitchen';
  if (lower === 'back')  return 'cold_kitchen';
  if (lower === 'bar')   return 'bar';
  if (lower === 'cold_kitchen' || lower === 'cold kitchen') return 'cold_kitchen';
  if (lower === 'ready_station' || lower === 'ready station' || lower === 'ready') return 'ready_station';
  // v === 'Custom' or anything else → keep verbatim so the merchant's
  // custom name lookups work.
  return v === 'Custom' ? 'Custom' : v;
}

const ROUTING_BADGE_COLORS: Record<string, string> = {
  none:          'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  kitchen:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  bar:           'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  cold_kitchen:  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  ready_station: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Custom:        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  // v2.7.96 — keep the legacy badges so existing rows that still hold
  // a Title-Case value render with sensible colours until the merchant
  // re-saves the category through the modal (which writes the
  // normalised lowercase value).
  None:  'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  Front: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Back:  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  Bar:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const ROUTING_BADGE_LABELS: Record<string, string> = {
  none: 'None', kitchen: 'Kitchen', bar: 'Bar',
  cold_kitchen: 'Cold Kitchen', ready_station: 'Ready Station',
  Custom: 'Custom',
};

const EMPTY_FORM: CategoryForm = {
  name: '',
  description: '',
  parentId: '',
  color: '#3b82f6',
  customColor: '',
  sortOrder: '0',
  printerDestination: 'none',
  customPrinterName: '',
  kdsDestination: 'none',
  customKdsName: '',
  isActive: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolvedColor(form: CategoryForm): string {
  if (form.color === '__custom__') {
    return form.customColor.startsWith('#') ? form.customColor : `#${form.customColor}`;
  }
  return form.color;
}

function categoryToForm(cat: Category): CategoryForm {
  const isPreset = PRESET_COLORS.some((p) => p.hex === cat.color);
  return {
    name: cat.name,
    description: cat.description ?? '',
    parentId: cat.parentId ?? '',
    color: isPreset ? (cat.color ?? '#3b82f6') : (cat.color ? '__custom__' : '#3b82f6'),
    customColor: isPreset || !cat.color ? '' : cat.color.replace('#', ''),
    sortOrder: String(cat.sortOrder ?? 0),
    printerDestination: normaliseLegacyDestination(cat.printerDestination),
    customPrinterName: cat.customPrinterName ?? '',
    kdsDestination: normaliseLegacyDestination(cat.kdsDestination),
    customKdsName: cat.customKdsName ?? '',
    isActive: cat.isActive ?? true,
  };
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  categories: Category[];
  editing: Category | null;
  onClose: () => void;
  onSaved: () => void;
}

function CategoryModal({ categories, editing, onClose, onSaved }: ModalProps) {
  const [form, setForm] = useState<CategoryForm>(
    editing ? categoryToForm(editing) : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const color = resolvedColor(form);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      parentId: form.parentId || undefined,
      color,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
      printerDestination: form.printerDestination,
      kdsDestination: form.kdsDestination,
      customPrinterName:
        form.printerDestination === 'Custom' ? form.customPrinterName.trim() || undefined : undefined,
      customKdsName:
        form.kdsDestination === 'Custom' ? form.customKdsName.trim() || undefined : undefined,
      isActive: form.isActive,
    };

    try {
      const url = editing
        ? `/api/proxy/categories/${editing.id}`
        : '/api/proxy/categories';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          msg = body.message ?? body.error ?? msg;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  }

  // Exclude self and descendants from parent options when editing
  const parentOptions = categories.filter((c) => c.id !== editing?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editing ? 'Edit Category' : 'Add Category'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            {/* X icon */}
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-5 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Drinks"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Optional description…"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white resize-none"
            />
          </div>

          {/* Parent category */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Parent Category
            </label>
            <select
              value={form.parentId}
              onChange={(e) => set('parentId', e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">None</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Color
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  title={p.label}
                  onClick={() => set('color', p.hex)}
                  className={`h-8 w-8 rounded-full transition-transform ${
                    form.color === p.hex ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: p.hex }}
                />
              ))}
              {/* Custom swatch */}
              <button
                type="button"
                onClick={() => set('color', '__custom__')}
                className={`h-8 w-8 rounded-full border-2 border-dashed transition-transform ${
                  form.color === '__custom__'
                    ? 'ring-2 ring-offset-2 ring-gray-400 scale-110 border-gray-400'
                    : 'border-gray-300 hover:scale-105 hover:border-gray-400'
                } flex items-center justify-center`}
                style={
                  form.color === '__custom__' && form.customColor
                    ? {
                        backgroundColor: form.customColor.startsWith('#')
                          ? form.customColor
                          : `#${form.customColor}`,
                      }
                    : {}
                }
                title="Custom color"
              >
                {form.color !== '__custom__' && (
                  <span className="text-[10px] text-gray-400 font-bold leading-none">#</span>
                )}
              </button>
              {form.color === '__custom__' && (
                <input
                  type="text"
                  value={form.customColor}
                  onChange={(e) => set('customColor', e.target.value)}
                  placeholder="e.g. ff6600"
                  maxLength={7}
                  className="w-28 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              )}
            </div>
          </div>

          {/* Sort Order */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Sort Order
            </label>
            <input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => set('sortOrder', e.target.value)}
              className="w-32 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Printer Destination */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Printer Destination
            </label>
            <select
              value={form.printerDestination}
              onChange={(e) => set('printerDestination', e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {ROUTING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              When an order contains a product in this category, the POS
              prints a ticket to the printer tagged with this destination
              (configured in the POS app under <strong>More → Order Printers</strong>).
              Pick <strong>None</strong> if this category should never print
              a kitchen / bar ticket.
            </p>
            {form.printerDestination === 'Custom' && (
              <input
                type="text"
                value={form.customPrinterName}
                onChange={(e) => set('customPrinterName', e.target.value)}
                placeholder="Custom printer name (must match the destination set on the POS printer)"
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            )}
          </div>

          {/* KDS Destination */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              KDS Destination
            </label>
            <select
              value={form.kdsDestination}
              onChange={(e) => set('kdsDestination', e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {ROUTING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {form.kdsDestination === 'Custom' && (
              <input
                type="text"
                value={form.customKdsName}
                onChange={(e) => set('customKdsName', e.target.value)}
                placeholder="Custom KDS name"
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            )}
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Active</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Inactive categories are hidden from the POS
              </p>
            </div>
            <button
              type="button"
              onClick={() => set('isActive', !form.isActive)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                form.isActive ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  form.isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-100 px-5 py-3.5 dark:border-gray-800">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
            <div className="h-6 w-6 flex-shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-36 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-24 rounded bg-gray-100 dark:bg-gray-800 ml-2" />
            <div className="ml-auto flex items-center gap-3">
              <div className="h-5 w-20 rounded-full bg-gray-100 dark:bg-gray-800" />
              <div className="h-5 w-20 rounded-full bg-gray-100 dark:bg-gray-800" />
              <div className="h-5 w-10 rounded-full bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Routing badge ────────────────────────────────────────────────────────────

function RoutingBadge({ label, value }: { label: string; value: string }) {
  if (!value || value === 'None' || value === 'none') return null;
  const cls = ROUTING_BADGE_COLORS[value] ?? ROUTING_BADGE_COLORS['Custom'];
  // v2.7.96 — show the friendly Title Case label even when the stored
  // value is the lowercase / underscored form ('cold_kitchen' → 'Cold Kitchen').
  const display = ROUTING_BADGE_LABELS[value] ?? value;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}: {display}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CategoriesClient() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/categories');
      if (!res.ok) return;
      const json = await res.json() as { data?: Category[] } | Category[];
      const data: Category[] = Array.isArray(json) ? json : (json.data ?? []);
      setCategories(data);
    } catch {
      // silently keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  function openAdd() {
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
  }

  async function handleToggleActive(cat: Category) {
    setTogglingIds((prev) => new Set(prev).add(cat.id));
    // Optimistic
    setCategories((prev) =>
      prev.map((c) => (c.id === cat.id ? { ...c, isActive: !c.isActive } : c)),
    );
    try {
      const res = await fetch(`/api/proxy/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      // Roll back
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, isActive: cat.isActive } : c)),
      );
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(cat.id);
        return next;
      });
    }
  }

  async function handleDelete(cat: Category) {
    // Guard: check if this category has sub-categories
    const hasChildren = categories.some((c) => c.parentId === cat.id);
    if (hasChildren) {
      toast({
        title: 'Cannot delete category',
        description: 'This category has sub-categories. Delete them first.',
        variant: 'destructive',
      });
      setConfirmDeleteId(null);
      return;
    }

    setDeletingIds((prev) => new Set(prev).add(cat.id));
    setConfirmDeleteId(null);
    try {
      await apiFetch(`categories/${cat.id}`, { method: 'DELETE' });
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      toast({ title: 'Category deleted', variant: 'default' });
    } catch (err) {
      toast({
        title: 'Failed to delete category',
        description: getErrorMessage(err, 'Could not delete category.'),
        variant: 'destructive',
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(cat.id);
        return next;
      });
    }
  }

  function parentName(parentId: string | null | undefined): string {
    if (!parentId) return '—';
    return categories.find((c) => c.id === parentId)?.name ?? '—';
  }

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      {showModal && (
        <CategoryModal
          categories={categories}
          editing={editing}
          onClose={closeModal}
          onSaved={loadCategories}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Categories</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading…' : `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          {/* Plus icon */}
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Add Category
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <TableSkeleton />
      ) : categories.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-20 dark:border-gray-700 dark:bg-gray-900">
          {/* Tag icon illustration */}
          <svg
            className="mb-4 h-14 w-14 text-gray-300 dark:text-gray-700"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
          </svg>
          <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">No categories yet</h3>
          <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
            Create categories to organise your products and configure printer and KDS routing.
          </p>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add your first category
          </button>
        </div>
      ) : (
        /* Table */
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Parent
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Printer Routing
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  KDS Routing
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Sort
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Active
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sorted.map((cat) => {
                const isToggling = togglingIds.has(cat.id);
                return (
                  <tr key={cat.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${!cat.isActive ? 'opacity-60' : ''}`}>
                    {/* Color + Name */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-block h-3.5 w-3.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color ?? '#d1d5db' }}
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {cat.name}
                        </span>
                        {cat.description && (
                          <span className="hidden text-xs text-gray-400 sm:inline truncate max-w-[12rem]">
                            {cat.description}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Parent */}
                    <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                      {parentName(cat.parentId)}
                    </td>
                    {/* Printer */}
                    <td className="px-5 py-3.5">
                      <RoutingBadge
                        label="Printer"
                        value={
                          cat.printerDestination === 'Custom' && cat.customPrinterName
                            ? cat.customPrinterName
                            : (cat.printerDestination ?? 'none')
                        }
                      />
                      {(!cat.printerDestination
                        || cat.printerDestination === 'none'
                        || cat.printerDestination === 'None') && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    {/* KDS */}
                    <td className="px-5 py-3.5">
                      <RoutingBadge
                        label="KDS"
                        value={
                          cat.kdsDestination === 'Custom' && cat.customKdsName
                            ? cat.customKdsName
                            : (cat.kdsDestination ?? 'none')
                        }
                      />
                      {(!cat.kdsDestination
                        || cat.kdsDestination === 'none'
                        || cat.kdsDestination === 'None') && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    {/* Sort */}
                    <td className="px-5 py-3.5 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                      {cat.sortOrder}
                    </td>
                    {/* Active toggle */}
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => void handleToggleActive(cat)}
                        disabled={isToggling}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                          cat.isActive ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            cat.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(cat)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-colors"
                        >
                          Edit
                        </button>
                        {confirmDeleteId === cat.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Delete?</span>
                            <button
                              onClick={() => { void handleDelete(cat); }}
                              disabled={deletingIds.has(cat.id)}
                              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                            >
                              {deletingIds.has(cat.id) ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(cat.id)}
                            disabled={deletingIds.has(cat.id)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
