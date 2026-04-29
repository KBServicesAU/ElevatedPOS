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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) notFound();

  const org = await fetchOrgBySlug(slug);
  if (!org) notFound();

  const ws = org.webStore;

  if (!ws.enabled) {
    return <ComingSoon businessName={org.name} primaryColor={ws.primaryColor} />;
  }

  // v2.7.86 — surface a confirmation banner when the user is redirected
  // back from /api/reservations or /api/bookings so they get a clear
  // success/failure signal instead of just landing on the homepage again.
  const sp = await searchParams;
  const reservationStatus = typeof sp['reservation'] === 'string' ? sp['reservation'] : null;
  const bookingStatus = typeof sp['booking'] === 'string' ? sp['booking'] : null;

  const banner = renderStatusBanner(reservationStatus, bookingStatus);

  const template = pickTemplate(org.industry);

  if (template === 'hospitality') {
    return (
      <>
        {banner}
        <HospitalityTemplate org={org} />
      </>
    );
  }
  if (template === 'services') {
    return (
      <>
        {banner}
        <ServicesTemplate org={org} />
      </>
    );
  }
  return (
    <>
      {banner}
      <RetailTemplate org={org} />
    </>
  );
}

function renderStatusBanner(reservation: string | null, booking: string | null) {
  const status = reservation ?? booking;
  if (!status) return null;
  const kind = reservation ? 'reservation' : 'booking';
  const messages: Record<string, { tone: 'ok' | 'pending' | 'err'; text: string }> = {
    confirmed: { tone: 'ok', text: `Your ${kind} is confirmed — we'll be in touch shortly.` },
    'pending-deposit': {
      tone: 'pending',
      text: `Your ${kind} is reserved pending a deposit. The merchant will follow up to take payment.`,
    },
    'missing-fields': { tone: 'err', text: 'Some required details were missing. Please try again.' },
    failed: { tone: 'err', text: 'Something went wrong submitting your request. Please try again.' },
  };
  const m = messages[status];
  if (!m) return null;
  const colors: Record<typeof m.tone, string> = {
    ok: 'bg-green-50 border-green-200 text-green-800',
    pending: 'bg-amber-50 border-amber-200 text-amber-800',
    err: 'bg-red-50 border-red-200 text-red-800',
  };
  return (
    <div className={`px-4 py-3 border-b text-sm text-center ${colors[m.tone]}`} role="status">
      {m.text}
    </div>
  );
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
