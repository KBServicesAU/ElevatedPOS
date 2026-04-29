/**
 * Shared layout chrome for storefront templates.
 *
 * v2.7.86 — extended for the Shopify/Squarespace-lite customisation pass:
 *   • Hero supports an optional background image + custom CTA text
 *   • New AboutBlock, ContactBlock, HoursBlock for cross-industry reuse
 *   • Footer renders the merchant's contact info + social icons
 */

import type { OrgInfo, BusinessHours, DayHours } from '../_lib/fetch';
import { themeColors } from '../_lib/fetch';
import Link from 'next/link';

export function StorefrontShell({
  org,
  rightSlot,
  children,
}: {
  org: OrgInfo;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { primary } = themeColors(org.webStore.theme, org.webStore.primaryColor);
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={`/${org.slug}`} className="flex items-center gap-3">
            {org.webStore.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.webStore.logoUrl} alt={org.name} className="h-8 w-auto" />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: primary }}
              >
                {org.name[0]?.toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-lg">{org.name}</span>
          </Link>
          <div>{rightSlot}</div>
        </div>
      </header>
      {children}
      <SiteFooter org={org} />
    </div>
  );
}

export function Hero({
  title,
  subtitle,
  primary,
  cta,
  imageUrl,
}: {
  title: string;
  subtitle?: string | null;
  primary: string;
  cta?: { label: string; href: string };
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      <section
        className="relative py-32 px-4 text-center text-white bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(${JSON.stringify(imageUrl).slice(1, -1)})`,
        }}
      >
        <h1 className="text-4xl sm:text-6xl font-bold mb-4 drop-shadow-lg">{title}</h1>
        {subtitle && <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto mb-6">{subtitle}</p>}
        {cta && (
          <a
            href={cta.href}
            className="inline-block px-6 py-3 rounded-xl text-white font-semibold text-base hover:opacity-90 transition-opacity"
            style={{ backgroundColor: primary }}
          >
            {cta.label}
          </a>
        )}
      </section>
    );
  }
  return (
    <section
      className="py-20 px-4 text-center"
      style={{ background: `linear-gradient(180deg, ${primary}1a 0%, transparent 100%)` }}
    >
      <h1 className="text-4xl sm:text-5xl font-bold mb-4">{title}</h1>
      {subtitle && <p className="text-lg text-gray-600 max-w-xl mx-auto mb-6">{subtitle}</p>}
      {cta && (
        <a
          href={cta.href}
          className="inline-block px-6 py-3 rounded-xl text-white font-semibold text-base hover:opacity-90 transition-opacity"
          style={{ backgroundColor: primary }}
        >
          {cta.label}
        </a>
      )}
    </section>
  );
}

/** Long-form About copy. Hidden when there's nothing to show. */
export function AboutBlock({ text, primary }: { text: string | null; primary: string }) {
  if (!text || !text.trim()) return null;
  return (
    <section className="max-w-3xl mx-auto px-4 py-12">
      <h2 className="text-2xl font-bold mb-4" style={{ color: primary }}>About</h2>
      <p className="text-gray-700 leading-relaxed whitespace-pre-line">{text}</p>
    </section>
  );
}

/** Two-column Contact + Hours panel. Hidden if both are empty. */
export function ContactAndHoursBlock({
  contact,
  hours,
  primary,
}: {
  contact: OrgInfo['webStore']['contact'];
  hours: BusinessHours;
  primary: string;
}) {
  const hasContact = contact.phone || contact.email || contact.address;
  const hasHours = Object.values(hours).some((h) => h !== null);
  if (!hasContact && !hasHours) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {hasContact && (
          <div>
            <h2 className="text-2xl font-bold mb-4" style={{ color: primary }}>Visit / Contact</h2>
            <ul className="space-y-3 text-gray-700">
              {contact.address && (
                <li className="flex items-start gap-3">
                  <span aria-hidden="true">📍</span>
                  <span className="whitespace-pre-line">{contact.address}</span>
                </li>
              )}
              {contact.phone && (
                <li className="flex items-start gap-3">
                  <span aria-hidden="true">📞</span>
                  <a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="hover:underline">
                    {contact.phone}
                  </a>
                </li>
              )}
              {contact.email && (
                <li className="flex items-start gap-3">
                  <span aria-hidden="true">✉️</span>
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}
        {hasHours && (
          <div>
            <h2 className="text-2xl font-bold mb-4" style={{ color: primary }}>Opening hours</h2>
            <HoursList hours={hours} />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Compact 7-row hours table. "Closed" rendered when the day is null.
 * Today's row is bolded so customers immediately see whether the place
 * is open right now.
 */
export function HoursList({ hours }: { hours: BusinessHours }) {
  const order: { key: keyof BusinessHours; label: string }[] = [
    { key: 'mon', label: 'Monday' },
    { key: 'tue', label: 'Tuesday' },
    { key: 'wed', label: 'Wednesday' },
    { key: 'thu', label: 'Thursday' },
    { key: 'fri', label: 'Friday' },
    { key: 'sat', label: 'Saturday' },
    { key: 'sun', label: 'Sunday' },
  ];
  const todayIdx = (new Date().getDay() + 6) % 7; // Mon = 0
  return (
    <ul className="space-y-1.5 text-gray-700">
      {order.map((d, i) => (
        <li
          key={d.key}
          className={`flex justify-between text-sm ${i === todayIdx ? 'font-semibold text-gray-900' : ''}`}
        >
          <span>{d.label}</span>
          <span>{formatDayHours(hours[d.key])}</span>
        </li>
      ))}
    </ul>
  );
}

function formatDayHours(d: DayHours): string {
  if (!d) return 'Closed';
  return `${d.open} – ${d.close}`;
}

function SiteFooter({ org }: { org: OrgInfo }) {
  const { socials, contact } = org.webStore;
  const hasAnySocial = Object.values(socials).some((v) => !!v);
  return (
    <footer className="mt-20 border-t border-gray-200 py-10 px-4">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="text-sm text-gray-600">
          <p className="font-semibold text-gray-900 mb-1">{org.name}</p>
          {contact.address && <p className="whitespace-pre-line">{contact.address}</p>}
          {contact.phone && (
            <p>
              <a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="hover:underline">
                {contact.phone}
              </a>
            </p>
          )}
          {contact.email && (
            <p>
              <a href={`mailto:${contact.email}`} className="hover:underline">
                {contact.email}
              </a>
            </p>
          )}
        </div>
        {hasAnySocial && (
          <div className="flex items-center gap-3">
            <SocialLink href={socials.instagram} label="Instagram" emoji="📷" />
            <SocialLink href={socials.facebook} label="Facebook" emoji="📘" />
            <SocialLink href={socials.twitter} label="X / Twitter" emoji="🐦" />
            <SocialLink href={socials.tiktok} label="TikTok" emoji="🎵" />
            <SocialLink href={socials.website} label="Website" emoji="🌐" />
          </div>
        )}
      </div>
      <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row sm:justify-between items-center gap-2 text-xs text-gray-500">
        <p>© {new Date().getFullYear()} {org.name}. All rights reserved.</p>
        <p>
          Powered by{' '}
          <a href="https://elevatedpos.com.au" className="font-medium hover:underline">
            ElevatedPOS
          </a>
        </p>
      </div>
    </footer>
  );
}

function SocialLink({ href, label, emoji }: { href: string | null; label: string; emoji: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-lg"
      title={label}
    >
      <span aria-hidden="true">{emoji}</span>
    </a>
  );
}
