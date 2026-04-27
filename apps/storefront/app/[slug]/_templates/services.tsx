/**
 * Services template — pick a service, pick a date+slot, enter your details,
 * pay deposit via Stripe (placeholder for now). MVP grid + form, no real
 * calendar integration.
 */

import { formatPrice, themeColors, type OrgInfo } from '../_lib/fetch';
import { Hero, StorefrontShell } from './_shared';

export default function ServicesTemplate({ org }: { org: OrgInfo }) {
  const { primary } = themeColors(org.webStore.theme, org.webStore.primaryColor);
  const services = org.webStore.bookingServices;

  return (
    <StorefrontShell org={org}>
      <Hero
        title={org.name}
        subtitle={org.webStore.description ?? 'Book online — pick a service and time that suits you.'}
        primary={primary}
        {...(services.length > 0 ? { cta: { label: 'Book now', href: '#book' } } : {})}
      />

      <section id="book" className="max-w-3xl mx-auto px-4 py-12">
        {!org.webStore.bookingsEnabled ? (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Bookings closed</h2>
            <p className="text-gray-600">Online bookings are temporarily unavailable. Please call us to book.</p>
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Services coming soon</h2>
            <p className="text-gray-600">We're adding our services to the site. Please call us to book in the meantime.</p>
          </div>
        ) : (
          <BookingForm org={org} primary={primary} />
        )}
      </section>
    </StorefrontShell>
  );
}

function BookingForm({ org, primary }: { org: OrgInfo; primary: string }) {
  const services = org.webStore.bookingServices;

  // Build the next 7 days for the date picker
  const days: { date: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayName = d.toLocaleDateString('en-AU', { weekday: 'short' });
    const dayNum = d.getDate();
    const month = d.toLocaleDateString('en-AU', { month: 'short' });
    days.push({ date: d.toISOString().slice(0, 10), label: `${dayName} ${dayNum} ${month}` });
  }

  // Default 9-5 in 30-min slots — a real impl would intersect with the
  // merchant's calendar via the integrations service.
  const slots: string[] = [];
  for (let h = 9; h < 17; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }

  return (
    <form action={`/api/bookings/${org.slug}`} method="post" className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-3">1. Pick a service</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((s, i) => (
            <label key={s.name} className="cursor-pointer">
              <input type="radio" name="service" value={s.name} defaultChecked={i === 0} className="sr-only peer" />
              <div className="p-4 rounded-xl border-2 border-gray-200 peer-checked:border-current transition-colors" style={{ color: primary }}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    <p className="text-sm text-gray-500">{s.durationMinutes} min</p>
                  </div>
                  <span className="font-bold" style={{ color: primary }}>
                    {formatPrice(s.priceCents)}
                  </span>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-3">2. Pick a date</h3>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          {days.map((d, i) => (
            <label key={d.date} className="cursor-pointer">
              <input type="radio" name="date" value={d.date} defaultChecked={i === 0} className="sr-only peer" />
              <div className="text-center p-2 rounded-lg border border-gray-300 text-sm peer-checked:text-white peer-checked:border-transparent" style={{ background: 'transparent' }}>
                {d.label}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-3">3. Pick a time</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map((s, i) => (
            <label key={s} className="cursor-pointer">
              <input type="radio" name="time" value={s} defaultChecked={i === 0} className="sr-only peer" />
              <div className="text-center p-2 rounded-lg border border-gray-300 text-sm hover:border-gray-400">
                {s}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-3">4. Your details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input name="name" required placeholder="Full name" className="px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          <input name="phone" required placeholder="Phone" className="px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          <input name="email" type="email" placeholder="Email (optional)" className="px-3 py-2 rounded-lg border border-gray-300 text-sm sm:col-span-2" />
          <textarea name="notes" rows={2} placeholder="Notes (optional)" className="px-3 py-2 rounded-lg border border-gray-300 text-sm sm:col-span-2" />
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-3 rounded-xl text-white font-semibold hover:opacity-90"
        style={{ backgroundColor: primary }}
      >
        Continue to payment →
      </button>
      <p className="text-xs text-gray-500 text-center">
        Secure payment via Stripe. You'll receive a confirmation by SMS.
      </p>
    </form>
  );
}
