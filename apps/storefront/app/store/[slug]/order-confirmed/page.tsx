'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function OrderConfirmedPage() {
  const rawParams = useParams<{ slug: string }>();
  const params = { slug: rawParams?.slug ?? '' };

  useEffect(() => {
    localStorage.removeItem('elevatedpos_cart');
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-3xl font-bold mb-3">Order confirmed!</h1>
        <p className="text-gray-600 mb-8">
          Thank you for your order. You&apos;ll receive a confirmation email shortly.
        </p>
        <Link
          href={`/store/${params.slug}`}
          className="px-8 py-4 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
        >
          Continue shopping
        </Link>
      </div>
    </main>
  );
}
