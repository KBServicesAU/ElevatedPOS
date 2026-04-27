'use client';

/**
 * Web Store dashboard (v2.7.51-F2)
 *
 * Industry-aware merchant settings for the customer-facing site at
 * site.elevatedpos.com.au/<slug>. The same backend `webStore` JSONB blob
 * drives every industry — the dashboard hides irrelevant sections based on
 * `organisations.industry`. Saving issues a single PATCH and the storefront
 * re-fetches on next request (5-minute revalidate window).
 */

import { useEffect, useState } from 'react';

type Theme = 'minimal' | 'modern' | 'warm' | 'classic';

interface BookingService {
  name: string;
  durationMinutes: number;
  priceCents: number;
}

interface WebStoreSettings {
  enabled: boolean;
  theme: Theme;
  description: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
  onlineOrderingEnabled: boolean;
  reservationsEnabled: boolean;
  bookingsEnabled: boolean;
  bookingServices: BookingService[];
  inventorySync: boolean;
  shippingFlatRateCents: number | null;
}

interface WebStoreResponse extends WebStoreSettings {
  slug: string;
  businessName: string;
  industry: string | null;
  previewUrl: string;
}

const THEME_PRESETS: { id: Theme; name: string; description: string; preview: string }[] = [
  { id: 'minimal', name: 'Minimal', description: 'Clean white, sharp edges.', preview: '#0a0a0a' },
  { id: 'modern', name: 'Modern', description: 'Bold colour, generous space.', preview: '#1d4ed8' },
  { id: 'warm', name: 'Warm', description: 'Earthy tones for cafés & venues.', preview: '#b45309' },
  { id: 'classic', name: 'Classic', description: 'Serif type, traditional feel.', preview: '#0f766e' },
];

function isHospitality(industry: string | null): boolean {
  if (!industry) return false;
  return ['cafe', 'restaurant', 'bar', 'quick_service', 'hospitality'].includes(industry);
}

function isServices(industry: string | null): boolean {
  if (!industry) return false;
  return ['salon', 'gym', 'services', 'barber'].includes(industry);
}

function isRetail(industry: string | null): boolean {
  if (!industry) return true;
  return ['retail', 'fashion', 'grocery', 'pharmacy', 'other'].includes(industry);
}

export default function WebStoreDashboardPage() {
  const [data, setData] = useState<WebStoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/proxy/organisations/me/web-store');
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = (await res.json()) as WebStoreResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof WebStoreSettings>(key: K, value: WebStoreSettings[K]): void {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        enabled: data.enabled,
        theme: data.theme,
        description: data.description,
        primaryColor: data.primaryColor,
        logoUrl: data.logoUrl,
        onlineOrderingEnabled: data.onlineOrderingEnabled,
        reservationsEnabled: data.reservationsEnabled,
        bookingsEnabled: data.bookingsEnabled,
        bookingServices: data.bookingServices,
        inventorySync: data.inventorySync,
        shippingFlatRateCents: data.shippingFlatRateCents,
      };
      const res = await fetch('/api/proxy/organisations/me/web-store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Save failed (${res.status}): ${txt}`);
      }
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function copyUrl() {
    if (!data) return;
    void navigator.clipboard.writeText(data.previewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <div className="p-8 text-gray-500">Loading web store settings…</div>;
  }
  if (!data) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-2">Web Store</h1>
        <p className="text-red-600">{error ?? 'Could not load web store settings.'}</p>
      </div>
    );
  }

  const showHospitality = isHospitality(data.industry);
  const showServices = isServices(data.industry);
  const showRetail = isRetail(data.industry);

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Web Store</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Your customer-facing site at site.elevatedpos.com.au/{data.slug}.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Saving…' : savedAt ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Enable toggle */}
      <Section title="Enable web store">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">
              {data.enabled ? 'Your web store is live.' : 'Your web store is disabled.'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              When disabled, the public URL shows a "coming soon" message.
            </p>
          </div>
          <Toggle on={data.enabled} onChange={(v) => update('enabled', v)} />
        </div>
      </Section>

      {/* URL & slug */}
      <Section title="Public URL">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
            {data.previewUrl}
          </div>
          <button
            onClick={copyUrl}
            className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 min-w-[80px]"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a
            href={data.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-3 bg-gray-900 dark:bg-gray-700 text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            Visit
          </a>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Slug <code className="font-mono">{data.slug}</code> is locked to your business name. Contact support to change it.
        </p>
      </Section>

      {/* Theme */}
      <Section title="Theme">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {THEME_PRESETS.map((t) => {
            const selected = data.theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => update('theme', t.id)}
                className={`text-left p-4 rounded-xl border-2 transition-colors ${
                  selected
                    ? 'border-gray-900 dark:border-white'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-lg mb-2"
                  style={{ backgroundColor: t.preview }}
                />
                <p className="font-medium text-gray-900 dark:text-white text-sm">{t.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.description}</p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Brand */}
      <Section title="Brand">
        <Field label="Description (shown on homepage)">
          <textarea
            value={data.description ?? ''}
            onChange={(e) => update('description', e.target.value || null)}
            rows={3}
            placeholder="Welcome to Joe's Pizza — wood-fired since 1987."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Primary colour">
            <div className="flex gap-2">
              <input
                type="color"
                value={data.primaryColor ?? '#0a0a0a'}
                onChange={(e) => update('primaryColor', e.target.value)}
                className="w-12 h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
              />
              <input
                type="text"
                value={data.primaryColor ?? ''}
                onChange={(e) => update('primaryColor', e.target.value || null)}
                placeholder="#0a0a0a"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono"
              />
            </div>
          </Field>
          <Field label="Logo URL">
            <input
              type="url"
              value={data.logoUrl ?? ''}
              onChange={(e) => update('logoUrl', e.target.value || null)}
              placeholder="https://cdn.example.com/logo.png"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </Field>
        </div>
      </Section>

      {/* Hospitality sections */}
      {showHospitality && (
        <Section title="Hospitality features">
          <ToggleRow
            label="Online ordering"
            description="Customers can browse the menu and order for pickup or delivery."
            value={data.onlineOrderingEnabled}
            onChange={(v) => update('onlineOrderingEnabled', v)}
          />
          <ToggleRow
            label="Reservations"
            description="Show a table-booking calendar on the homepage."
            value={data.reservationsEnabled}
            onChange={(v) => update('reservationsEnabled', v)}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Menu items are pulled automatically from <a href="/dashboard/catalog" className="underline">Catalog</a> — products with the "Web Store" channel enabled appear on your site.
          </p>
        </Section>
      )}

      {/* Services sections */}
      {showServices && (
        <Section title="Bookings">
          <ToggleRow
            label="Enable bookings"
            description="Customers can pick a service, see your calendar, and pay a deposit."
            value={data.bookingsEnabled}
            onChange={(v) => update('bookingsEnabled', v)}
          />
          {data.bookingsEnabled && (
            <div className="mt-4">
              <p className="font-medium text-gray-900 dark:text-white mb-2 text-sm">Services offered</p>
              <BookingServiceList
                services={data.bookingServices}
                onChange={(s) => update('bookingServices', s)}
              />
            </div>
          )}
        </Section>
      )}

      {/* Retail sections */}
      {showRetail && (
        <Section title="Retail features">
          <ToggleRow
            label="Inventory sync"
            description="Web sales reduce POS stock automatically."
            value={data.inventorySync}
            onChange={(v) => update('inventorySync', v)}
          />
          <Field label="Flat-rate shipping (AUD)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={data.shippingFlatRateCents !== null ? (data.shippingFlatRateCents / 100).toFixed(2) : ''}
              onChange={(e) => {
                const v = e.target.value;
                update('shippingFlatRateCents', v === '' ? null : Math.round(Number(v) * 100));
              }}
              placeholder="9.95"
              className="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty for free shipping.</p>
          </Field>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Products are pulled automatically from <a href="/dashboard/catalog" className="underline">Catalog</a> — set the channel to "Web Store" or "Both" to make a product appear on your site.
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-4">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        on ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 first:pt-0">
      <div className="flex-1 mr-4">
        <p className="font-medium text-gray-900 dark:text-white text-sm">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
      <Toggle on={value} onChange={onChange} />
    </div>
  );
}

function BookingServiceList({
  services,
  onChange,
}: {
  services: BookingService[];
  onChange: (s: BookingService[]) => void;
}) {
  function addService() {
    onChange([...services, { name: '', durationMinutes: 30, priceCents: 0 }]);
  }
  function updateService(i: number, patch: Partial<BookingService>) {
    onChange(services.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeService(i: number) {
    onChange(services.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-2">
      {services.map((s, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={s.name}
            onChange={(e) => updateService(i, { name: e.target.value })}
            placeholder="Haircut"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
          />
          <input
            type="number"
            value={s.durationMinutes}
            onChange={(e) => updateService(i, { durationMinutes: Number(e.target.value) || 30 })}
            min="5"
            step="5"
            className="w-20 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
            aria-label="Duration in minutes"
          />
          <span className="text-xs text-gray-500">min</span>
          <input
            type="number"
            value={(s.priceCents / 100).toFixed(2)}
            onChange={(e) => updateService(i, { priceCents: Math.round(Number(e.target.value) * 100) || 0 })}
            min="0"
            step="0.01"
            className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
            aria-label="Price"
          />
          <span className="text-xs text-gray-500">AUD</span>
          <button
            type="button"
            onClick={() => removeService(i)}
            className="text-gray-400 hover:text-red-500 px-2"
            aria-label="Remove service"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addService}
        className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        + Add service
      </button>
    </div>
  );
}
