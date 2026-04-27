/**
 * Customer-facing storefront entry — site.elevatedpos.com.au/<slug>
 *
 * Reads the merchant's web-store config from the auth service, then renders
 * the right industry template:
 *   - hospitality → Menu (with optional Online Ordering + Reservations)
 *   - services    → Bookings
 *   - retail      → Ecommerce
 *
 * Static marketing routes (/about, /blog, /contact, etc.) continue to win
 * over this dynamic route because Next.js prioritises specific paths.
 *
 * v2.7.51-F2
 */

import { notFound } from 'next/navigation';
import { fetchOrgBySlug } from './_lib/fetch';
import HospitalityTemplate from './_templates/hospitality';
import ServicesTemplate from './_templates/services';
import RetailTemplate from './_templates/retail';
import ComingSoon from './_templates/coming-soon';

export const revalidate = 300; // 5 minutes

// Marketing static routes that should never reach this catch-all. If the
// dynamic route is hit with one of these (e.g. someone wires a redirect that
// drops the static priority), fall through to a 404 instead of treating it
// as a slug.
const RESERVED_SLUGS = new Set([
  'about', 'blog', 'careers', 'contact', 'demo', 'downloads', 'help',
  'onboard', 'privacy', 'status', 'terms', 'store', 'api', 'login',
  'signup', 'pricing', 'features', '_next', 'favicon.ico', 'robots.txt',
]);

function pickTemplate(industry: string | null): 'hospitality' | 'services' | 'retail' {
  if (!industry) return 'retail';
  if (['cafe', 'restaurant', 'bar', 'quick_service', 'hospitality'].includes(industry)) return 'hospitality';
  if (['salon', 'gym', 'services', 'barber'].includes(industry)) return 'services';
  return 'retail';
}

export default async function PublicStorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) notFound();

  const org = await fetchOrgBySlug(slug);
  if (!org) notFound();

  const ws = org.webStore;

  if (!ws.enabled) {
    return <ComingSoon businessName={org.name} primaryColor={ws.primaryColor} />;
  }

  const template = pickTemplate(org.industry);

  if (template === 'hospitality') {
    return <HospitalityTemplate org={org} />;
  }
  if (template === 'services') {
    return <ServicesTemplate org={org} />;
  }
  return <RetailTemplate org={org} />;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) return {};
  const org = await fetchOrgBySlug(slug);
  if (!org) return {};
  return {
    title: org.name,
    description: org.webStore.description ?? `Shop with ${org.name}`,
  };
}
