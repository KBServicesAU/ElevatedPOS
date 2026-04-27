'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { getErrorMessage } from '@/lib/formatting';
import { Tag, Plus, X, Ban, AlertCircle, Ticket, Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react';

type MarkdownStatus = 'active' | 'scheduled' | 'expired';
type DiscountType = 'percentage' | 'fixed';
type ScopeType = 'all' | 'category' | 'product';
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

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
  isRecurring?: boolean;
  recurringDays?: DayOfWeek[];
  recurringStartTime?: string;
  recurringEndTime?: string;
}

const ALL_DAYS: { id: DayOfWeek; short: string }[] = [
  { id: 'monday', short: 'Mon' },
  { id: 'tuesday', short: 'Tue' },
  { id: 'wednesday', short: 'Wed' },
  { id: 'thursday', short: 'Thu' },
  { id: 'friday', short: 'Fri' },
  { id: 'saturday', short: 'Sat' },
  { id: 'sunday', short: 'Sun' },
];

function formatRecurringSchedule(md: Markdown): string {
  if (!md.isRecurring || !md.recurringDays?.length) return '';
  const dayLabels = md.recurringDays
    .map((d) => ALL_DAYS.find((x) => x.id === d)?.short ?? d)
    .join(', ');
  const fmt12 = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
  };
  const start = md.recurringStartTime ? fmt12(md.recurringStartTime) : '';
  const end = md.recurringEndTime ? fmt12(md.recurringEndTime) : '';
  return `${dayLabels}${start && end ? ` ${start}–${end}` : ''}`;
}

interface MarkdownsResponse {
  data: Markdown[];
}

const FALLBACK_CATEGORIES = ['Electronics', 'Clothing', 'Food & Beverage', 'Home & Garden', 'Sporting Goods', 'Toys'];

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

// ─── Promo Codes types ────────────────────────────────────────────────────────

type PromoStatus = 'active' | 'expired' | 'disabled';
type PromoType = 'percentage' | 'fixed' | 'free_shipping';
type PromoScope = 'order' | 'product' | 'category';

interface PromoCode {
  id: string;
  code: string;
  name: string;
  type: PromoType;
  discountValue: number;
  scope: PromoScope;
  minOrderValue?: number;
  maxUses?: number;
  usedCount: number;
  startsAt: string;
  expiresAt?: string | null;
  status: PromoStatus;
  isFirstTimeOnly?: boolean;
}

interface PromoCodesResponse {
  data: PromoCode[];
}

type PromoFilterTab = 'all' | PromoStatus;

const PROMO_STATUS_STYLES: Record<PromoStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  disabled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ─── Main component ───────────────────────────────────────────────────────────

type PageView = 'markdowns' | 'promo-codes';

export default function MarkdownsClient() {
  const { toast } = useToast();

  // top-level page view toggle
  const [pageView, setPageView] = useState<PageView>('markdowns');

  // ── Markdowns state ──
  const [items, setItems] = useState<Markdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);

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
    isRecurring: false,
    recurringDays: [] as DayOfWeek[],
    recurringStartTime: '',
    recurringEndTime: '',
  });

  // ── Promo Codes state ──
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promoFilterTab, setPromoFilterTab] = useState<PromoFilterTab>('all');
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);

  const [promoForm, setPromoForm] = useState({
    code: '',
    name: '',
    type: 'percentage' as PromoType,
    discountValue: '',
    scope: 'order' as PromoScope,
    minOrderValue: '',
    maxUses: '',
    startsAt: '',
    expiresAt: '',
    isFirstTimeOnly: false,
  });

  // ── Product search autocomplete state ──
  const [productResults, setProductResults] = useState<{ id: string; name: string; sku?: string }[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const productSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleProductSearch(query: string) {
    setForm((prev) => ({ ...prev, productSearch: query }));
    setSelectedProductId('');
    if (productSearchTimer.current) clearTimeout(productSearchTimer.current);
    if (!query.trim()) {
      setProductResults([]);
      setProductSearching(false);
      return;
    }
    setProductSearching(true);
    productSearchTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch<{ data: { id: string; name: string; sku?: string }[] } | { id: string; name: string; sku?: string }[]>(
          'catalog/products?search=' + encodeURIComponent(query) + '&limit=8'
        );
        const list = Array.isArray(res) ? res : ((res as { data: { id: string; name: string; sku?: string }[] }).data ?? []);
        setProductResults(list);
      } catch {
        setProductResults([]);
      } finally {
        setProductSearching(false);
      }
    }, 400);
  }

  // ── Load markdowns ──
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

  useEffect(() => {
    apiFetch<{ data: { id: string; name: string }[] }>('catalog/categories')
      .then((res) => {
        const names = res.data?.map((c) => c.name).filter(Boolean) ?? [];
        if (names.length > 0) setCategories(names);
      })
      .catch(() => {
        fetch('/api/proxy/categories')
          .then((r) => r.ok ? r.json() : null)
          .then((json) => {
            const list = Array.isArray(json) ? json : (json?.data ?? []);
            const names = list.map((c: { name: string }) => c.name).filter(Boolean) as string[];
            if (names.length > 0) setCategories(names);
          })
          .catch(() => {});
      });
  }, []);

  // ── Load promo codes ──
  const loadPromos = useCallback(async () => {
    setPromosLoading(true);
    try {
      const res = await apiFetch<PromoCodesResponse>('promo-codes');
      setPromos(res.data ?? []);
    } catch {
      setPromos([]);
    } finally {
      setPromosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pageView === 'promo-codes') {
      void loadPromos();
    }
  }, [pageView, loadPromos]);

  // ── Markdown helpers ──
  function resetForm() {
    setForm({ name: '', description: '', scope: 'all', category: '', productSearch: '', discountType: 'percentage', discountValue: '', startsAt: '', endsAt: '', isRecurring: false, recurringDays: [], recurringStartTime: '', recurringEndTime: '' });
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
    // Convert datetime-local values (YYYY-MM-DDTHH:mm) to full ISO 8601
    const startsAtISO = form.startsAt
      ? new Date(form.startsAt).toISOString()
      : new Date().toISOString();
    const endsAtISO = form.endsAt
      ? new Date(form.endsAt).toISOString()
      : null;
    const status = form.startsAt ? inferStatus(form.startsAt, form.endsAt) : 'active';
    const payload = {
      name: form.name,
      description: form.description,
      scope: form.scope,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      startsAt: startsAtISO,
      endsAt: endsAtISO,
      ...(form.isRecurring && {
        isRecurring: true,
        recurringDays: form.recurringDays,
        recurringStartTime: form.recurringStartTime,
        recurringEndTime: form.recurringEndTime,
      }),
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
        ...(form.isRecurring && {
          isRecurring: true,
          recurringDays: form.recurringDays,
          recurringStartTime: form.recurringStartTime,
          recurringEndTime: form.recurringEndTime,
        }),
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

  async function handleDelete(id: string) {
    const prev = items;
    setItems((arr) => arr.filter((m) => m.id !== id));
    try {
      await apiFetch(`markdowns/${id}`, { method: 'DELETE' });
      toast({ title: 'Markdown deleted', variant: 'success' });
    } catch (err) {
      setItems(prev);
      toast({ title: 'Failed to delete markdown', description: getErrorMessage(err), variant: 'destructive' });
    }
  }

  // ── Promo Codes helpers ──
  function resetPromoForm() {
    setPromoForm({ code: '', name: '', type: 'percentage', discountValue: '', scope: 'order', minOrderValue: '', maxUses: '', startsAt: '', expiresAt: '', isFirstTimeOnly: false });
    setEditingPromo(null);
  }

  function openCreatePromoModal() {
    resetPromoForm();
    setShowPromoModal(true);
  }

  function openEditPromoModal(promo: PromoCode) {
    setEditingPromo(promo);
    setPromoForm({
      code: promo.code,
      name: promo.name,
      type: promo.type,
      discountValue: promo.type !== 'free_shipping' ? String(promo.discountValue) : '',
      scope: promo.scope,
      minOrderValue: promo.minOrderValue != null ? String(promo.minOrderValue) : '',
      maxUses: promo.maxUses != null ? String(promo.maxUses) : '',
      startsAt: promo.startsAt ?? '',
      expiresAt: promo.expiresAt ?? '',
      isFirstTimeOnly: promo.isFirstTimeOnly ?? false,
    });
    setShowPromoModal(true);
  }

  async function handleSavePromo() {
    if (!promoForm.code || !promoForm.name) return;
    if (promoForm.type !== 'free_shipping' && !promoForm.discountValue) return;
    setPromoSaving(true);

    const payload = {
      code: promoForm.code.toUpperCase(),
      name: promoForm.name,
      type: promoForm.type,
      discountValue: promoForm.type !== 'free_shipping' ? Number(promoForm.discountValue) : 0,
      scope: promoForm.scope,
      minOrderValue: promoForm.minOrderValue ? Number(promoForm.minOrderValue) : undefined,
      maxUses: promoForm.maxUses ? Number(promoForm.maxUses) : undefined,
      startsAt: promoForm.startsAt || new Date().toISOString(),
      expiresAt: promoForm.expiresAt || null,
      isFirstTimeOnly: promoForm.isFirstTimeOnly,
    };

    try {
      if (editingPromo) {
        await apiFetch(`promo-codes/${editingPromo.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setPromos((prev) => prev.map((p) => p.id === editingPromo.id ? { ...p, ...payload, status: p.status } : p));
        toast({ title: 'Promo code updated', description: `"${promoForm.name}" has been updated.`, variant: 'success' });
      } else {
        await apiFetch('promo-codes', { method: 'POST', body: JSON.stringify(payload) });
        const newPromo: PromoCode = {
          id: `pc${Date.now()}`,
          ...payload,
          usedCount: 0,
          status: 'active' as PromoStatus,
        };
        setPromos((prev) => [newPromo, ...prev]);
        toast({ title: 'Promo code created', description: `"${promoForm.name}" has been created.`, variant: 'success' });
      }
      resetPromoForm();
      setShowPromoModal(false);
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: editingPromo ? 'Failed to update promo code' : 'Failed to create promo code', description: msg, variant: 'destructive' });
    } finally {
      setPromoSaving(false);
    }
  }

  async function handleTogglePromo(promo: PromoCode) {
    const newStatus: PromoStatus = promo.status === 'disabled' ? 'active' : 'disabled';
    try {
      await apiFetch(`promo-codes/${promo.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      setPromos((prev) => prev.map((p) => p.id === promo.id ? { ...p, status: newStatus } : p));
      toast({ title: newStatus === 'active' ? 'Promo code enabled' : 'Promo code disabled', variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to update promo code', description: msg, variant: 'destructive' });
    }
  }

  async function handleDeletePromo(id: string) {
    try {
      await apiFetch(`promo-codes/${id}`, { method: 'DELETE' });
      setPromos((prev) => prev.filter((p) => p.id !== id));
      toast({ title: 'Promo code deleted', variant: 'success' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ title: 'Failed to delete promo code', description: msg, variant: 'destructive' });
    }
  }

  function handleCopyCode(code: string) {
    void navigator.clipboard.writeText(code);
    toast({ title: 'Copied!', description: `"${code}" copied to clipboard.`, variant: 'success' });
  }

  function formatPromoDiscount(promo: PromoCode): string {
    if (promo.type === 'free_shipping') return 'Free Shipping';
    // v2.7.51 — discountValue may arrive as a string from the API.
    if (promo.type === 'percentage') return `${Number(promo.discountValue)}% off`;
    return `$${Number(promo.discountValue).toFixed(2)} off`;
  }

  function formatPromoScope(scope: PromoScope): string {
    if (scope === 'order') return 'Entire Order';
    if (scope === 'product') return 'Product';
    return 'Category';
  }

  // ── Markdown tab data ──
  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `All (${items.length})` },
    { id: 'active', label: `Active (${items.filter((i) => i.status === 'active').length})` },
    { id: 'scheduled', label: `Scheduled (${items.filter((i) => i.status === 'scheduled').length})` },
    { id: 'expired', label: `Expired (${items.filter((i) => i.status === 'expired').length})` },
  ];

  const filtered = activeTab === 'all' ? items : items.filter((m) => m.status === activeTab);

  // ── Promo tab data ──
  const PROMO_TABS: { id: PromoFilterTab; label: string }[] = [
    { id: 'all', label: `All (${promos.length})` },
    { id: 'active', label: `Active (${promos.filter((p) => p.status === 'active').length})` },
    { id: 'expired', label: `Expired (${promos.filter((p) => p.status === 'expired').length})` },
    { id: 'disabled', label: `Disabled (${promos.filter((p) => p.status === 'disabled').length})` },
  ];

  const filteredPromos = promoFilterTab === 'all' ? promos : promos.filter((p) => p.status === promoFilterTab);

  return (
    <div>
      {/* Page-level view toggle */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={() => setPageView('markdowns')}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              pageView === 'markdowns'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Tag className="h-4 w-4" />
            Markdowns
          </button>
          <button
            onClick={() => setPageView('promo-codes')}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              pageView === 'promo-codes'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Ticket className="h-4 w-4" />
            Promo Codes
          </button>
        </div>

        {pageView === 'markdowns' ? (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Markdown
          </button>
        ) : (
          <button
            onClick={openCreatePromoModal}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Promo Code
          </button>
        )}
      </div>

      {/* ───────────────────────────── MARKDOWNS VIEW ───────────────────────────── */}
      {pageView === 'markdowns' && (
        <>
          {/* Sub-header */}
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Markdowns</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Schedule and manage price markdowns</p>
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
                          {/* v2.7.51 — API returns discountValue as a string
                              (Postgres NUMERIC); coerce before .toFixed. */}
                          {md.discountType === 'percentage'
                            ? `${Number(md.discountValue)}%`
                            : `$${Number(md.discountValue).toFixed(2)}`}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">{md.startsAt}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">{md.endsAt ?? '—'}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[md.status]}`}>
                              {md.status}
                            </span>
                            {md.status === 'active' && (
                              <span className="rounded-full bg-emerald-500 text-white px-2 py-0.5 text-xs font-bold tracking-wide">
                                LIVE
                              </span>
                            )}
                            {md.isRecurring && (
                              <span className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 px-2 py-0.5 text-xs font-medium">
                                ⏰ Recurring
                              </span>
                            )}
                            {countdown && (
                              <span className="text-xs text-amber-600 dark:text-amber-400">{countdown}</span>
                            )}
                          </div>
                          {md.isRecurring && formatRecurringSchedule(md) && (
                            <p className="mt-0.5 text-xs text-gray-400">{formatRecurringSchedule(md)}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1">
                            {md.status !== 'expired' && (
                              <button
                                onClick={() => { void handleDeactivate(md.id); }}
                                title="Deactivate"
                                className="rounded p-1 text-amber-500 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-900/30 transition-colors"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => { void handleDelete(md.id); }}
                              title="Delete"
                              className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ───────────────────────────── PROMO CODES VIEW ───────────────────────────── */}
      {pageView === 'promo-codes' && (
        <>
          {/* Sub-header */}
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Promo Codes</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Create and manage customer-facing discount codes</p>
          </div>

          {/* Filter tabs */}
          <div className="mb-5 flex gap-1 border-b border-gray-200 dark:border-gray-800">
            {PROMO_TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPromoFilterTab(id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  promoFilterTab === id
                    ? 'border-elevatedpos-500 text-elevatedpos-600 dark:text-elevatedpos-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Loading */}
          {promosLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          )}

          {/* Empty */}
          {!promosLoading && filteredPromos.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 dark:border-gray-700 dark:bg-gray-800/40">
              <Ticket className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No {promoFilterTab !== 'all' ? promoFilterTab : ''} promo codes yet.</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Create your first promo code to give customers a discount.</p>
            </div>
          )}

          {/* Table */}
          {!promosLoading && filteredPromos.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Code</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Discount</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Scope</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Min Order</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Uses</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Expires</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredPromos.map((promo) => (
                    <tr key={promo.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      {/* Code */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                            {promo.code}
                          </span>
                          <button
                            onClick={() => handleCopyCode(promo.code)}
                            title="Copy code"
                            className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        {promo.isFirstTimeOnly && (
                          <span className="mt-0.5 inline-block text-xs text-purple-600 dark:text-purple-400">First-time only</span>
                        )}
                      </td>
                      {/* Name */}
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900 dark:text-white">{promo.name}</p>
                      </td>
                      {/* Discount */}
                      <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white">
                        {formatPromoDiscount(promo)}
                      </td>
                      {/* Scope */}
                      <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                        {formatPromoScope(promo.scope)}
                      </td>
                      {/* Min Order */}
                      <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                        {/* v2.7.51 — coerce numeric strings from the API. */}
                        {promo.minOrderValue != null ? `$${Number(promo.minOrderValue).toFixed(2)}` : '—'}
                      </td>
                      {/* Uses */}
                      <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                        {promo.usedCount}{promo.maxUses ? ` / ${promo.maxUses}` : ''}
                      </td>
                      {/* Expires */}
                      <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                        {promo.expiresAt
                          ? new Date(promo.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${PROMO_STATUS_STYLES[promo.status]}`}>
                          {promo.status}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          {/* Edit */}
                          <button
                            onClick={() => openEditPromoModal(promo)}
                            title="Edit"
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {/* Enable/Disable toggle */}
                          {promo.status !== 'expired' && (
                            <button
                              onClick={() => { void handleTogglePromo(promo); }}
                              title={promo.status === 'disabled' ? 'Enable' : 'Disable'}
                              className={`rounded p-1 transition-colors ${
                                promo.status === 'disabled'
                                  ? 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30'
                                  : 'text-amber-500 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-900/30'
                              }`}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Delete */}
                          <button
                            onClick={() => { void handleDeletePromo(promo.id); }}
                            title="Delete"
                            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ───────────────────────────── CREATE MARKDOWN MODAL ───────────────────────────── */}
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
                  onChange={(e) => { setForm({ ...form, scope: e.target.value as ScopeType, category: '', productSearch: '' }); setSelectedProductId(''); setProductResults([]); }}
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
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.scope === 'product' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Product</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search for a product..."
                      value={form.productSearch}
                      onChange={(e) => handleProductSearch(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                    />
                    {productSearching && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        <svg className="h-4 w-4 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                      </span>
                    )}
                    {productResults.length > 0 && (
                      <ul className="absolute top-full z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900 max-h-48 overflow-y-auto">
                        {productResults.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setForm((prev) => ({ ...prev, productSearch: p.name }));
                                setSelectedProductId(p.id);
                                setProductResults([]);
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
                            >
                              <span className="font-medium">{p.name}</span>
                              {p.sku && <span className="ml-2 text-xs text-gray-400">{p.sku}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!productSearching && productResults.length === 0 && form.productSearch.length > 2 && !selectedProductId && (
                      <p className="mt-1 text-xs text-gray-400">No products found</p>
                    )}
                  </div>
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

              {/* Recurring Schedule Toggle */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Recurring Schedule</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">e.g. Every Tuesday 4pm–7pm = Happy Hour</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isRecurring: !form.isRecurring })}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${form.isRecurring ? 'bg-elevatedpos-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.isRecurring ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </label>

                {form.isRecurring && (
                  <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                    {/* Days of week */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Days of Week</label>
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_DAYS.map(({ id, short }) => {
                          const active = form.recurringDays.includes(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                const days = active
                                  ? form.recurringDays.filter((d) => d !== id)
                                  : [...form.recurringDays, id];
                                setForm({ ...form, recurringDays: days });
                              }}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                active
                                  ? 'bg-elevatedpos-600 text-white'
                                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              {short}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {/* Time range */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Start Time</label>
                        <input
                          type="time"
                          value={form.recurringStartTime}
                          onChange={(e) => setForm({ ...form, recurringStartTime: e.target.value })}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">End Time</label>
                        <input
                          type="time"
                          value={form.recurringEndTime}
                          onChange={(e) => setForm({ ...form, recurringEndTime: e.target.value })}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Schedule — only shown when not recurring */}
              {!form.isRecurring && (
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
              )}

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

      {/* ───────────────────────────── CREATE / EDIT PROMO CODE MODAL ───────────────────────────── */}
      {showPromoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {editingPromo ? 'Edit Promo Code' : 'Create Promo Code'}
              </h2>
              <button onClick={() => { resetPromoForm(); setShowPromoModal(false); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4">
              {/* Code */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Code <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. SUMMER20"
                    value={promoForm.code}
                    onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => setPromoForm({ ...promoForm, code: generateCode() })}
                    title="Generate random code"
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Generate
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Name / Description <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Summer Sale 20% Off"
                  value={promoForm.name}
                  onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>

              {/* Discount Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Discount Type</label>
                <div className="flex gap-2">
                  {([
                    { value: 'percentage', label: '% Off' },
                    { value: 'fixed', label: '$ Fixed' },
                    { value: 'free_shipping', label: 'Free Shipping' },
                  ] as { value: PromoType; label: string }[]).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPromoForm({ ...promoForm, type: value, discountValue: value === 'free_shipping' ? '' : promoForm.discountValue })}
                      className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                        promoForm.type === value
                          ? 'border-elevatedpos-500 bg-elevatedpos-50 text-elevatedpos-700 dark:bg-elevatedpos-900/30 dark:text-elevatedpos-300'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Discount Value — hidden for free shipping */}
              {promoForm.type !== 'free_shipping' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Discount Value <span className="text-red-500">*</span> {promoForm.type === 'percentage' ? '(%)' : '($)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={promoForm.type === 'percentage' ? '1' : '0.01'}
                    max={promoForm.type === 'percentage' ? '100' : undefined}
                    placeholder={promoForm.type === 'percentage' ? '20' : '10.00'}
                    value={promoForm.discountValue}
                    onChange={(e) => setPromoForm({ ...promoForm, discountValue: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
              )}

              {/* Scope */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Scope</label>
                <select
                  value={promoForm.scope}
                  onChange={(e) => setPromoForm({ ...promoForm, scope: e.target.value as PromoScope })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 bg-white"
                >
                  <option value="order">Entire Order</option>
                  <option value="product">Specific Product</option>
                  <option value="category">Specific Category</option>
                </select>
              </div>

              {/* Min Order Value + Max Uses */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Min Order Value <span className="text-gray-400">(optional, $)</span></label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={promoForm.minOrderValue}
                    onChange={(e) => setPromoForm({ ...promoForm, minOrderValue: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Max Uses <span className="text-gray-400">(0 = unlimited)</span></label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={promoForm.maxUses}
                    onChange={(e) => setPromoForm({ ...promoForm, maxUses: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
              </div>

              {/* Start + Expiry dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Start Date</label>
                  <input
                    type="datetime-local"
                    value={promoForm.startsAt}
                    onChange={(e) => setPromoForm({ ...promoForm, startsAt: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Expiry Date <span className="text-gray-400">(optional)</span></label>
                  <input
                    type="datetime-local"
                    value={promoForm.expiresAt}
                    onChange={(e) => setPromoForm({ ...promoForm, expiresAt: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-elevatedpos-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
              </div>

              {/* First-time customers only toggle */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">First-time customers only</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Restrict this code to new customers</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPromoForm({ ...promoForm, isFirstTimeOnly: !promoForm.isFirstTimeOnly })}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${promoForm.isFirstTimeOnly ? 'bg-elevatedpos-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${promoForm.isFirstTimeOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </label>
              </div>

              {/* Preview */}
              {promoForm.code && promoForm.name && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Preview: <span className="font-mono font-semibold text-gray-900 dark:text-white">{promoForm.code}</span>
                    {' — '}{promoForm.name}
                    {promoForm.type === 'free_shipping'
                      ? ' (Free Shipping)'
                      : promoForm.discountValue
                      ? ` (${promoForm.type === 'percentage' ? `${promoForm.discountValue}% off` : `$${Number(promoForm.discountValue).toFixed(2)} off`})`
                      : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => { resetPromoForm(); setShowPromoModal(false); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleSavePromo(); }}
                disabled={
                  !promoForm.code ||
                  !promoForm.name ||
                  (promoForm.type !== 'free_shipping' && !promoForm.discountValue) ||
                  promoSaving
                }
                className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-500 disabled:opacity-50 transition-colors"
              >
                {promoSaving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Ticket className="h-4 w-4" />
                )}
                {editingPromo ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
