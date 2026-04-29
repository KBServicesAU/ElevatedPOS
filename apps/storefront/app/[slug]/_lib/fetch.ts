/**
 * Shared server-side fetch helpers for the public storefront.
 *
 * Hits the auth service for org+web-store config and the catalog service for
 * products. Both are cached by Next at the route level (revalidate=300 in
 * page.tsx) so we don't hammer the API on every request.
 */

// v2.7.86 — Shopify/Squarespace-lite extensions: hero, about, contact,
// hours, social links. All optional / nullable so old configs keep working.
export type DayHours = { open: string; close: string } | null;
export interface BusinessHours {
  mon: DayHours; tue: DayHours; wed: DayHours; thu: DayHours;
  fri: DayHours; sat: DayHours; sun: DayHours;
}
export interface ContactInfo {
  phone: string | null;
  email: string | null;
  address: string | null;
}
export interface SocialLinks {
  instagram: string | null;
  facebook: string | null;
  twitter: string | null;
  tiktok: string | null;
  website: string | null;
}

export interface WebStoreSettings {
  enabled: boolean;
  theme: 'minimal' | 'modern' | 'warm' | 'classic';
  description: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  heroCtaText: string | null;
  aboutText: string | null;
  contact: ContactInfo;
  hours: BusinessHours;
  socials: SocialLinks;
  onlineOrderingEnabled: boolean;
  reservationsEnabled: boolean;
  bookingsEnabled: boolean;
  bookingServices: { name: string; durationMinutes: number; priceCents: number }[];
  inventorySync: boolean;
  shippingFlatRateCents: number | null;
}

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  currency: string;
  webStore: WebStoreSettings;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  basePrice: number;
  webDescription?: string;
  webSlug?: string;
  webImages?: { url: string; alt: string }[];
  webFeatured?: boolean;
  category?: { id: string; name: string };
  tags?: string[];
}

const EMPTY_HOURS: BusinessHours = {
  mon: null, tue: null, wed: null, thu: null,
  fri: null, sat: null, sun: null,
};
const EMPTY_CONTACT: ContactInfo = { phone: null, email: null, address: null };
const EMPTY_SOCIALS: SocialLinks = {
  instagram: null, facebook: null, twitter: null, tiktok: null, website: null,
};

const DEFAULT_WEB_STORE: WebStoreSettings = {
  enabled: false,
  theme: 'minimal',
  description: null,
  primaryColor: null,
  logoUrl: null,
  heroImageUrl: null,
  heroCtaText: null,
  aboutText: null,
  contact: { ...EMPTY_CONTACT },
  hours: { ...EMPTY_HOURS },
  socials: { ...EMPTY_SOCIALS },
  onlineOrderingEnabled: false,
  reservationsEnabled: false,
  bookingsEnabled: false,
  bookingServices: [],
  inventorySync: true,
  shippingFlatRateCents: null,
};

function authBase(): string {
  return process.env['AUTH_SERVICE_URL'] ?? process.env['AUTH_API_URL'] ?? 'http://localhost:4001';
}

function catalogBase(): string {
  return process.env['CATALOG_SERVICE_URL'] ?? 'http://localhost:4002';
}

// v2.7.87 — the hardcoded demoOrg() / demoProducts() shortcuts were
// removed. The 'demo' slug is now backed by a real organisations row
// seeded at auth-service startup (services/auth/src/seed.ts) and a
// real catalog at catalog-service startup (services/catalog/src/seed.ts).
// This means the platform owner can sign in as demo@elevatedpos.com.au
// and edit the demo store via /dashboard/web-store like a normal merchant.

export async function fetchOrgBySlug(slug: string): Promise<OrgInfo | null> {
  try {
    const res = await fetch(`${authBase()}/api/v1/organisations/by-slug/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<OrgInfo> & { webStore?: Partial<WebStoreSettings> };
    if (!data.id || !data.name || !data.slug) return null;
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      industry: data.industry ?? null,
      currency: data.currency ?? 'AUD',
      webStore: { ...DEFAULT_WEB_STORE, ...(data.webStore ?? {}) },
    };
  } catch {
    return null;
  }
}

export async function fetchProducts(orgId: string): Promise<CatalogProduct[]> {
  try {
    const res = await fetch(
      `${catalogBase()}/api/v1/products/storefront?orgId=${encodeURIComponent(orgId)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      products?: (Omit<CatalogProduct, 'basePrice'> & { basePrice: number | string })[];
    };
    // v2.7.87 — the catalog stores basePrice as a Postgres decimal (read
    // back as a stringified dollars value, e.g. "5.5000") while every
    // template uses cents via formatPrice(cents). Normalise here so the
    // templates don't have to know about the unit mismatch.
    return (data.products ?? []).map((p) => ({
      ...p,
      basePrice: Math.round(Number(p.basePrice) * 100),
    }));
  } catch {
    return [];
  }
}

export function formatPrice(cents: number, currency: string = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100);
}

/** Per-theme colour ramp. The merchant's primaryColor (if set) overrides. */
export function themeColors(theme: WebStoreSettings['theme'], override: string | null) {
  const presets: Record<WebStoreSettings['theme'], string> = {
    minimal: '#0a0a0a',
    modern: '#1d4ed8',
    warm: '#b45309',
    classic: '#0f766e',
  };
  return { primary: override ?? presets[theme] };
}
