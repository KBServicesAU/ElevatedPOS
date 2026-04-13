'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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

export default function CartPage() {
  const rawParams = useParams<{ slug: string }>();
  const params = { slug: rawParams?.slug ?? '' };
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('elevatedpos_cart');
    if (stored) setCart(JSON.parse(stored) as CartItem[]);
  }, []);

  function updateQty(id: string, delta: number) {
    setCart((prev) => {
      const updated = prev
        .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
        .filter((i) => i.quantity > 0);
      localStorage.setItem('elevatedpos_cart', JSON.stringify(updated));
      return updated;
    });
  }

  function removeItem(id: string) {
    setCart((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      localStorage.setItem('elevatedpos_cart', JSON.stringify(updated));
      return updated;
    });
  }

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href={`/store/${params.slug}`}
          className="text-sm text-gray-500 hover:text-gray-900 mb-6 inline-flex items-center gap-1"
        >
          ← Continue shopping
        </Link>
        <h1 className="text-3xl font-bold mb-8">Your Cart</h1>

        {cart.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-xl mb-4">Your cart is empty</p>
            <Link
              href={`/store/${params.slug}`}
              className="px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-8">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl"
                >
                  <div className="flex-1">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-gray-500 text-sm">{formatPrice(item.price)} each</p>
                  </div>
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="px-3 py-2 hover:bg-gray-50"
                    >
                      −
                    </button>
                    <span className="px-3 py-2 font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="px-3 py-2 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                  <p className="font-bold w-20 text-right">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-gray-400 hover:text-red-500 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 pt-6">
              <div className="flex justify-between items-center mb-6">
                <span className="text-xl font-semibold">Total</span>
                <span className="text-2xl font-bold">{formatPrice(subtotal)}</span>
              </div>
              <Link
                href={`/store/${params.slug}/checkout`}
                className="w-full block text-center py-4 bg-gray-900 text-white rounded-xl font-semibold text-lg hover:bg-gray-800 transition-colors"
              >
                Proceed to Checkout
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
