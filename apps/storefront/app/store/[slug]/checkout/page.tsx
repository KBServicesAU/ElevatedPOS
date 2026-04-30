'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
    cents / 100
  );
}

export default function CheckoutPage() {
  const rawParams = useParams<{ slug: string }>();
  const params = { slug: rawParams?.slug ?? '' };
  const [cart, setCart] = useState<CartItem[]>([]);
  // v2.7.93 — pickupTime is the customer's preferred collection time
  // (browser <input type="datetime-local"> value, e.g. "2026-04-30T14:30").
  // Empty string means "as soon as it's ready". specialInstructions is
  // free-text the merchant sees on the order ticket — allergies, parking
  // notes, gift wrapping, whatever.
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    pickupTime: '',
    specialInstructions: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('elevatedpos_cart');
    if (stored) setCart(JSON.parse(stored) as CartItem[]);
  }, []);

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/connect/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: params.slug,
          items: cart,
          customer: {
            name: form.name,
            email: form.email,
            phone: form.phone,
          },
          // v2.7.93 — fulfillment details. Both fields are optional; the
          // backend stores them on the fulfillment_request notes block so
          // the merchant sees them when they prep the order.
          fulfillment: {
            pickupTime: form.pickupTime || undefined,
            specialInstructions: form.specialInstructions || undefined,
          },
          successUrl: `${window.location.origin}/store/${params.slug}/order-confirmed`,
          cancelUrl: `${window.location.origin}/store/${params.slug}/cart`,
        }),
      });
      if (!res.ok) throw new Error('Checkout failed');
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  if (cart.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-500 mb-4">Your cart is empty</p>
          <Link
            href={`/store/${params.slug}`}
            className="px-6 py-3 bg-gray-900 text-white rounded-xl font-medium"
          >
            Back to store
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Checkout</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-xl font-semibold mb-4">Your details</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone (optional)
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {/* v2.7.93 — pickup time + special instructions. Both
                  optional. The merchant sees them on the order ticket
                  in the dashboard / POS. */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred pickup time (optional)
                </label>
                <input
                  type="datetime-local"
                  value={form.pickupTime}
                  onChange={(e) => setForm((f) => ({ ...f, pickupTime: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank for ASAP. Otherwise, choose when you&apos;d like to pick up — the merchant will email you when it&apos;s ready.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Special instructions (optional)
                </label>
                <textarea
                  value={form.specialInstructions}
                  onChange={(e) => setForm((f) => ({ ...f, specialInstructions: e.target.value }))}
                  rows={3}
                  placeholder="Allergies, dietary requirements, gift wrapping, parking notes…"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gray-900 text-white rounded-xl font-semibold text-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Redirecting to payment...' : `Pay ${formatPrice(subtotal)}`}
              </button>
              <p className="text-xs text-gray-500 text-center">
                Payments processed securely by Stripe. Your card details are never stored by us.
              </p>
            </form>
          </div>

          <div className="bg-gray-50 rounded-2xl p-6 h-fit">
            <h2 className="text-xl font-semibold mb-4">Order summary</h2>
            <div className="space-y-3 mb-6">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span className="font-medium">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 pt-4 flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
