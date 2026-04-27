/**
 * Hospitality template — menu by category with photos and prices, plus an
 * optional "Order Online" CTA and a "Reserve a table" panel.
 */

import { fetchProducts, formatPrice, themeColors, type OrgInfo } from '../_lib/fetch';
import { Hero, StorefrontShell } from './_shared';

export default async function HospitalityTemplate({ org }: { org: OrgInfo }) {
  const { primary } = themeColors(org.webStore.theme, org.webStore.primaryColor);
  const products = await fetchProducts(org.id);

  // Group by category — fall back to "Menu" when a product has no category.
  const grouped = new Map<string, typeof products>();
  for (const p of products) {
    const key = p.category?.name ?? 'Menu';
    const arr = grouped.get(key) ?? [];
    arr.push(p);
    grouped.set(key, arr);
  }

  return (
    <StorefrontShell org={org}>
      <Hero
        title={org.name}
        subtitle={org.webStore.description}
        primary={primary}
        {...(org.webStore.onlineOrderingEnabled
          ? { cta: { label: 'Order Online', href: '#menu' } }
          : {})}
      />

      {org.webStore.reservationsEnabled && (
        <section className="max-w-3xl mx-auto px-4 py-10">
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: `${primary}10`, border: `1px solid ${primary}33` }}
          >
            <h2 className="text-2xl font-bold mb-2">Reserve a table</h2>
            <p className="text-gray-600 mb-6">
              Pick a date and time that suits you — we'll confirm by SMS.
            </p>
            <ReservationPicker primary={primary} slug={org.slug} />
          </div>
        </section>
      )}

      <section id="menu" className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold mb-8">Menu</h2>
        {products.length === 0 ? (
          <p className="text-gray-500 text-center py-12">
            Menu coming soon — contact us for today's specials.
          </p>
        ) : (
          <div className="space-y-12">
            {Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-xl font-semibold mb-4 pb-2 border-b border-gray-200">
                  {category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {items.map((p) => (
                    <MenuItem key={p.id} product={p} primary={primary} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {org.webStore.onlineOrderingEnabled && products.length > 0 && (
          <div className="text-center mt-10">
            <a
              href={`/store/${org.slug}/cart`}
              className="inline-block px-6 py-3 rounded-xl text-white font-semibold hover:opacity-90"
              style={{ backgroundColor: primary }}
            >
              View cart →
            </a>
          </div>
        )}
      </section>
    </StorefrontShell>
  );
}

function MenuItem({
  product,
  primary,
}: {
  product: { id: string; name: string; basePrice: number; webDescription?: string; webImages?: { url: string; alt: string }[] };
  primary: string;
}) {
  const image = product.webImages?.[0];
  return (
    <div className="flex gap-4 p-4 rounded-xl border border-gray-200 hover:shadow-sm transition-shadow">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.url}
          alt={image.alt}
          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
          🍽️
        </div>
      )}
      <div className="flex-1">
        <div className="flex justify-between items-start gap-2">
          <h4 className="font-semibold text-gray-900">{product.name}</h4>
          <span className="font-bold flex-shrink-0" style={{ color: primary }}>
            {formatPrice(product.basePrice)}
          </span>
        </div>
        {product.webDescription && (
          <p className="text-sm text-gray-600 mt-1">{product.webDescription}</p>
        )}
      </div>
    </div>
  );
}

/**
 * MVP reservation picker — 7-day calendar with a fixed set of slots. Submits
 * to a placeholder endpoint; in a follow-up the integrations service will
 * wire this to the existing reservations module.
 */
function ReservationPicker({ primary, slug }: { primary: string; slug: string }) {
  const days: { date: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayName = d.toLocaleDateString('en-AU', { weekday: 'short' });
    const dayNum = d.getDate();
    days.push({
      date: d.toISOString().slice(0, 10),
      label: `${dayName} ${dayNum}`,
    });
  }
  const slots = ['12:00', '12:30', '13:00', '18:00', '18:30', '19:00', '19:30', '20:00'];
  return (
    <form
      action={`/api/reservations/${slug}`}
      method="post"
      className="text-left"
    >
      <div className="grid grid-cols-7 gap-2 mb-4">
        {days.map((d, i) => (
          <label key={d.date} className="cursor-pointer">
            <input type="radio" name="date" value={d.date} defaultChecked={i === 0} className="sr-only peer" />
            <div
              className="text-center p-2 rounded-lg border border-gray-300 text-sm peer-checked:text-white peer-checked:border-transparent transition-colors"
              style={{ '--c': primary } as React.CSSProperties}
            >
              {d.label}
            </div>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {slots.map((s, i) => (
          <label key={s} className="cursor-pointer">
            <input type="radio" name="time" value={s} defaultChecked={i === 0} className="sr-only peer" />
            <div className="text-center p-2 rounded-lg border border-gray-300 text-sm hover:border-gray-400">
              {s}
            </div>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        <input
          name="name"
          required
          placeholder="Your name"
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
        />
        <input
          name="phone"
          required
          placeholder="Phone"
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
        />
      </div>
      <input
        name="party"
        type="number"
        min="1"
        max="20"
        defaultValue="2"
        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm mb-4"
        placeholder="Party size"
      />
      <button
        type="submit"
        className="w-full py-3 rounded-xl text-white font-semibold hover:opacity-90"
        style={{ backgroundColor: primary }}
      >
        Request reservation
      </button>
      <p className="text-xs text-gray-500 mt-2 text-center">
        We'll confirm by SMS within 30 minutes.
      </p>
    </form>
  );
}
