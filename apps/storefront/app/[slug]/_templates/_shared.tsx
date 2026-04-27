/**
 * Shared layout chrome for storefront templates — header with the merchant's
 * name + colour, footer with ElevatedPOS attribution.
 */

import type { OrgInfo } from '../_lib/fetch';
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
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
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
      <footer className="mt-20 border-t border-gray-200 py-8 text-center text-sm text-gray-500">
        <p>
          Powered by{' '}
          <a href="https://elevatedpos.com.au" className="font-medium hover:underline">
            ElevatedPOS
          </a>
        </p>
      </footer>
    </div>
  );
}

export function Hero({
  title,
  subtitle,
  primary,
  cta,
}: {
  title: string;
  subtitle?: string | null;
  primary: string;
  cta?: { label: string; href: string };
}) {
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
