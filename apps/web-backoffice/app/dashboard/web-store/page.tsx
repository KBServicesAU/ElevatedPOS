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

// v2.7.86 — extended customisation: hero, about, contact, hours, socials.
type DayHours = { open: string; close: string } | null;
type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type Hours = Record<DayKey, DayHours>;
interface ContactInfo {
  phone: string | null;
  email: string | null;
  address: string | null;
}
interface SocialLinks {
  instagram: string | null;
  facebook: string | null;
  twitter: string | null;
  tiktok: string | null;
  website: string | null;
}

interface WebStoreSettings {
  enabled: boolean;
  theme: Theme;
  description: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  heroCtaText: string | null;
  aboutText: string | null;
  contact: ContactInfo;
  hours: Hours;
  socials: SocialLinks;
  onlineOrderingEnabled: boolean;
  reservationsEnabled: boolean;
  bookingsEnabled: boolean;
  bookingServices: BookingService[];
  inventorySync: boolean;
  shippingFlatRateCents: number | null;
}

const EMPTY_HOURS: Hours = {
  mon: null, tue: null, wed: null, thu: null,
  fri: null, sat: null, sun: null,
};
const EMPTY_CONTACT: ContactInfo = { phone: null, email: null, address: null };
const EMPTY_SOCIALS: SocialLinks = {
  instagram: null, facebook: null, twitter: null, tiktok: null, website: null,
};

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
        const json = (await res.json()) as Partial<WebStoreResponse>;
        if (cancelled) return;
        // v2.7.86 — back-fill new fields when an older row is loaded so the
        // controls are always defined and React isn't given undefined values.
        const normalised: WebStoreResponse = {
          slug: json.slug ?? '',
          businessName: json.businessName ?? '',
          industry: json.industry ?? null,
          previewUrl: json.previewUrl ?? '',
          enabled: json.enabled ?? false,
          theme: (json.theme as Theme) ?? 'minimal',
          description: json.description ?? null,
          primaryColor: json.primaryColor ?? null,
          logoUrl: json.logoUrl ?? null,
          heroImageUrl: json.heroImageUrl ?? null,
          heroCtaText: json.heroCtaText ?? null,
          aboutText: json.aboutText ?? null,
          contact: { ...EMPTY_CONTACT, ...(json.contact ?? {}) },
          hours: { ...EMPTY_HOURS, ...(json.hours ?? {}) },
          socials: { ...EMPTY_SOCIALS, ...(json.socials ?? {}) },
          onlineOrderingEnabled: json.onlineOrderingEnabled ?? false,
          reservationsEnabled: json.reservationsEnabled ?? false,
          bookingsEnabled: json.bookingsEnabled ?? false,
          bookingServices: Array.isArray(json.bookingServices) ? json.bookingServices : [],
          inventorySync: json.inventorySync ?? true,
          shippingFlatRateCents: json.shippingFlatRateCents ?? null,
        };
        setData(normalised);
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
        heroImageUrl: data.heroImageUrl,
        heroCtaText: data.heroCtaText,
        aboutText: data.aboutText,
        contact: data.contact,
        hours: data.hours,
        socials: data.socials,
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
              When disabled, the public URL shows a &ldquo;coming soon&rdquo; message.
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

      {/* Hero */}
      <Section title="Hero section">
        <Field label="Hero background image URL (optional)">
          <input
            type="url"
            value={data.heroImageUrl ?? ''}
            onChange={(e) => update('heroImageUrl', e.target.value || null)}
            placeholder="https://cdn.example.com/hero.jpg"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Wide landscape image works best. Leave empty for a clean gradient.
          </p>
        </Field>
        <Field label="Call-to-action button text (optional)">
          <input
            type="text"
            maxLength={60}
            value={data.heroCtaText ?? ''}
            onChange={(e) => update('heroCtaText', e.target.value || null)}
            placeholder={
              showHospitality ? 'Order Online' : showServices ? 'Book now' : 'Shop now'
            }
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Default is industry-aware. Override here to match your brand.
          </p>
        </Field>
      </Section>

      {/* v2.7.93 — bulk catalog visibility. Without this section, the
          merchant has to flip an isSoldOnline toggle on every individual
          product before it shows on the storefront. The buttons here hit
          the catalog service's bulk-channels endpoint and update every
          active product in one shot. Hidden for services-only orgs since
          they typically don't sell catalog products via the storefront. */}
      {(showHospitality || showRetail) && (
        <CatalogVisibilitySection />
      )}

      {/* About */}
      <Section title="About">
        <Field label="Tell customers your story (optional)">
          <textarea
            value={data.aboutText ?? ''}
            onChange={(e) => update('aboutText', e.target.value || null)}
            rows={5}
            placeholder="A short paragraph about your business — when you started, what makes you different, why customers love you."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Up to 5000 characters. Line breaks are preserved.
          </p>
        </Field>
      </Section>

      {/* Hospitality sections */}
      {/* v2.7.96 — modular feature toggles. Industry seeds the defaults
          on signup but every merchant can mix freely from this single
          panel. Toggling any of these flags also flips the matching
          featureFlag on the org row server-side, which in turn shows
          or hides the corresponding sidebar items in the dashboard +
          POS app. The contextual hints under each toggle reflect what
          we recommend per industry. */}
      <Section title="Modules">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Turn modules on or off. Each one shows up automatically in the
          POS sidebar and on the storefront when enabled.
        </p>
        <ToggleRow
          label="Online ordering / Click & Collect"
          description={
            showHospitality
              ? 'Menu + online checkout. Orders flow into the POS Online Orders tab.'
              : showRetail
                ? 'Customers buy products on the website and collect in store.'
                : 'Take pickup orders online. Items show up on the POS Online Orders tab.'
          }
          value={data.onlineOrderingEnabled}
          onChange={(v) => update('onlineOrderingEnabled', v)}
        />
        <ToggleRow
          label="Ecommerce (web store with shipping / pickup)"
          description="Customers browse the catalog and pay online. Stock decrements automatically."
          value={data.inventorySync}
          onChange={(v) => update('inventorySync', v)}
        />
        <ToggleRow
          label="Reservations"
          description="Table-booking calendar on the homepage. Best for hospitality."
          value={data.reservationsEnabled}
          onChange={(v) => update('reservationsEnabled', v)}
        />
        <ToggleRow
          label="Bookings (services / appointments)"
          description="Customers pick a service, see your calendar, and pay a deposit."
          value={data.bookingsEnabled}
          onChange={(v) => update('bookingsEnabled', v)}
        />

        {data.bookingsEnabled && (
          <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-800">
            <p className="font-medium text-gray-900 dark:text-white mb-2 text-sm">Services offered</p>
            <BookingServiceList
              services={data.bookingServices}
              onChange={(s) => update('bookingServices', s)}
            />
          </div>
        )}

        {data.inventorySync && (
          <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-800">
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty for free pickup-only shipping.</p>
            </Field>
          </div>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-5">
          Catalog items appear on the website when you set their channel
          to &ldquo;Web Store&rdquo; or &ldquo;Both&rdquo; — see{' '}
          <a href="/dashboard/catalog" className="underline">Catalog</a> or
          use the bulk button above.
        </p>
      </Section>

      {/* Contact */}
      <Section title="Contact information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Phone">
            <input
              type="tel"
              value={data.contact.phone ?? ''}
              onChange={(e) =>
                update('contact', { ...data.contact, phone: e.target.value || null })
              }
              placeholder="+61 3 9000 0000"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={data.contact.email ?? ''}
              onChange={(e) =>
                update('contact', { ...data.contact, email: e.target.value || null })
              }
              placeholder="hello@yourbusiness.com.au"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </Field>
        </div>
        <Field label="Street address">
          <textarea
            value={data.contact.address ?? ''}
            onChange={(e) =>
              update('contact', { ...data.contact, address: e.target.value || null })
            }
            rows={2}
            placeholder="42 Main Street, Melbourne VIC 3000"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
        </Field>
      </Section>

      {/* Hours */}
      <Section title="Opening hours">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Set the times you&apos;re open each day. Leave a day off to mark it closed.
        </p>
        <BusinessHoursEditor
          hours={data.hours}
          onChange={(h) => update('hours', h)}
        />
      </Section>

      {/* Socials */}
      <Section title="Social media & website">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Instagram URL">
            <input
              type="url"
              value={data.socials.instagram ?? ''}
              onChange={(e) =>
                update('socials', { ...data.socials, instagram: e.target.value || null })
              }
              placeholder="https://instagram.com/yourhandle"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </Field>
          <Field label="Facebook URL">
            <input
              type="url"
              value={data.socials.facebook ?? ''}
              onChange={(e) =>
                update('socials', { ...data.socials, facebook: e.target.value || null })
              }
              placeholder="https://facebook.com/yourpage"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </Field>
          <Field label="X (Twitter) URL">
            <input
              type="url"
              value={data.socials.twitter ?? ''}
              onChange={(e) =>
                update('socials', { ...data.socials, twitter: e.target.value || null })
              }
              placeholder="https://x.com/yourhandle"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </Field>
          <Field label="TikTok URL">
            <input
              type="url"
              value={data.socials.tiktok ?? ''}
              onChange={(e) =>
                update('socials', { ...data.socials, tiktok: e.target.value || null })
              }
              placeholder="https://tiktok.com/@yourhandle"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </Field>
        </div>
        <Field label="Other website (optional)">
          <input
            type="url"
            value={data.socials.website ?? ''}
            onChange={(e) =>
              update('socials', { ...data.socials, website: e.target.value || null })
            }
            placeholder="https://yourbusiness.com.au"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
        </Field>
      </Section>
    </div>
  );
}

// v2.7.93 — one-click catalog → web store sync. Calls the catalog
// service's bulk-channels endpoint with one of four actions:
//   • add_web    — every product can be sold on POS *and* web (recommended)
//   • web_only   — every product is web-only (rare; only if the merchant
//                  runs a pure online store with no in-person till)
//   • pos_only   — every product is POS-only (resets after a mistake)
//   • remove_web — strip the web flag from every product (without
//                  flipping POS-only — useful when the merchant is
//                  pausing online sales)
function CatalogVisibilitySection() {
  const [busy, setBusy] = useState<null | 'add_web' | 'web_only' | 'pos_only' | 'remove_web'>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(action: 'add_web' | 'web_only' | 'pos_only' | 'remove_web', confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(action);
    setErr(null);
    setLastResult(null);
    try {
      const res = await fetch('/api/proxy/products/bulk-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const json = (await res.json()) as { data?: { totalProducts: number; updated: number } };
      const total = json.data?.totalProducts ?? 0;
      const updated = json.data?.updated ?? 0;
      setLastResult(
        `${updated} of ${total} active products updated. The storefront refreshes within 5 minutes.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bulk update failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Catalog visibility">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Decide which of your products show on the public storefront. These
        buttons update every <strong>active</strong> product in one shot —
        no need to edit each one individually.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run(
              'add_web',
              'Make every active product available on the storefront AND keep them on the POS?',
            )
          }
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium"
        >
          {busy === 'add_web' ? 'Updating…' : 'Show all on website'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run(
              'remove_web',
              'Hide every product from the storefront? They\'ll stay available on the POS.',
            )
          }
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 text-sm font-medium"
        >
          {busy === 'remove_web' ? 'Updating…' : 'Hide all from website'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run(
              'web_only',
              'Make every product web-only (remove from POS)? This is unusual — confirm only if you\'re running an online-only store.',
            )
          }
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 text-sm font-medium"
        >
          {busy === 'web_only' ? 'Updating…' : 'Web-only'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run(
              'pos_only',
              'Reset every product to POS-only? Customers won\'t see them on the storefront.',
            )
          }
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 text-sm font-medium"
        >
          {busy === 'pos_only' ? 'Updating…' : 'POS-only'}
        </button>
      </div>
      {lastResult && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-3">{lastResult}</p>
      )}
      {err && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-3">{err}</p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
        For per-product control, edit a product in <strong>Catalog</strong>
        {' '}and toggle <strong>Sold online</strong> on the Channels &amp;
        Visibility tab.
      </p>
    </Section>
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

function BusinessHoursEditor({
  hours,
  onChange,
}: {
  hours: Hours;
  onChange: (h: Hours) => void;
}) {
  const days: { key: DayKey; label: string }[] = [
    { key: 'mon', label: 'Monday' },
    { key: 'tue', label: 'Tuesday' },
    { key: 'wed', label: 'Wednesday' },
    { key: 'thu', label: 'Thursday' },
    { key: 'fri', label: 'Friday' },
    { key: 'sat', label: 'Saturday' },
    { key: 'sun', label: 'Sunday' },
  ];

  function toggleClosed(key: DayKey, closed: boolean) {
    if (closed) {
      onChange({ ...hours, [key]: null });
    } else {
      // Default to 9–5 when re-opening a day so the picker isn't blank.
      onChange({ ...hours, [key]: { open: '09:00', close: '17:00' } });
    }
  }

  function setTime(key: DayKey, field: 'open' | 'close', value: string) {
    const cur = hours[key] ?? { open: '09:00', close: '17:00' };
    onChange({ ...hours, [key]: { ...cur, [field]: value } });
  }

  return (
    <div className="space-y-2">
      {days.map((d) => {
        const isClosed = hours[d.key] === null;
        return (
          <div
            key={d.key}
            className="flex items-center gap-3 py-1.5"
          >
            <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300">
              {d.label}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={isClosed}
                onChange={(e) => toggleClosed(d.key, e.target.checked)}
                className="rounded border-gray-300"
              />
              Closed
            </label>
            {!isClosed && (
              <>
                <input
                  type="time"
                  value={hours[d.key]?.open ?? '09:00'}
                  onChange={(e) => setTime(d.key, 'open', e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="time"
                  value={hours[d.key]?.close ?? '17:00'}
                  onChange={(e) => setTime(d.key, 'close', e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                />
              </>
            )}
          </div>
        );
      })}
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
