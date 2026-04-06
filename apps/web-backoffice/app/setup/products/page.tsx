'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus, Sparkles, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Demo product sets per industry
// ---------------------------------------------------------------------------

interface DemoProduct {
  name: string;
  sku: string;
  basePrice: number;
}

const INDUSTRY_PRODUCTS: Record<string, DemoProduct[]> = {
  cafe: [
    { name: 'Flat White', sku: 'CAFE-001', basePrice: 4.5 },
    { name: 'Long Black', sku: 'CAFE-002', basePrice: 4.0 },
    { name: 'Cappuccino', sku: 'CAFE-003', basePrice: 4.5 },
    { name: 'Latte', sku: 'CAFE-004', basePrice: 4.5 },
    { name: 'Chai Latte', sku: 'CAFE-005', basePrice: 5.0 },
    { name: 'Croissant', sku: 'CAFE-006', basePrice: 5.5 },
    { name: 'Muffin', sku: 'CAFE-007', basePrice: 5.0 },
    { name: 'Banana Bread', sku: 'CAFE-008', basePrice: 6.0 },
    { name: 'Avocado Toast', sku: 'CAFE-009', basePrice: 16.0 },
    { name: 'Eggs Benedict', sku: 'CAFE-010', basePrice: 19.0 },
  ],
  restaurant: [
    { name: 'Margherita Pizza', sku: 'REST-001', basePrice: 18.0 },
    { name: 'Caesar Salad', sku: 'REST-002', basePrice: 14.0 },
    { name: 'Fish & Chips', sku: 'REST-003', basePrice: 22.0 },
    { name: 'Steak', sku: 'REST-004', basePrice: 35.0 },
    { name: 'Pasta Carbonara', sku: 'REST-005', basePrice: 20.0 },
    { name: 'Garlic Bread', sku: 'REST-006', basePrice: 8.0 },
    { name: 'Soup of the Day', sku: 'REST-007', basePrice: 10.0 },
    { name: 'Chocolate Cake', sku: 'REST-008', basePrice: 12.0 },
    { name: 'Cheesecake', sku: 'REST-009', basePrice: 12.0 },
    { name: 'Tiramisu', sku: 'REST-010', basePrice: 13.0 },
  ],
  bar: [
    { name: 'Beer', sku: 'BAR-001', basePrice: 9.0 },
    { name: 'Wine', sku: 'BAR-002', basePrice: 12.0 },
    { name: 'Cocktail', sku: 'BAR-003', basePrice: 18.0 },
    { name: 'Spirits', sku: 'BAR-004', basePrice: 12.0 },
    { name: 'Soft Drink', sku: 'BAR-005', basePrice: 4.0 },
    { name: 'Juice', sku: 'BAR-006', basePrice: 5.0 },
    { name: 'Nachos', sku: 'BAR-007', basePrice: 14.0 },
    { name: 'Wings', sku: 'BAR-008', basePrice: 15.0 },
    { name: 'Sliders', sku: 'BAR-009', basePrice: 16.0 },
    { name: 'Fries', sku: 'BAR-010', basePrice: 8.0 },
  ],
  retail: [
    { name: 'T-Shirt', sku: 'RET-001', basePrice: 29.0 },
    { name: 'Hoodie', sku: 'RET-002', basePrice: 59.0 },
    { name: 'Jeans', sku: 'RET-003', basePrice: 79.0 },
    { name: 'Sneakers', sku: 'RET-004', basePrice: 120.0 },
    { name: 'Cap', sku: 'RET-005', basePrice: 25.0 },
    { name: 'Tote Bag', sku: 'RET-006', basePrice: 35.0 },
    { name: 'Socks', sku: 'RET-007', basePrice: 12.0 },
    { name: 'Belt', sku: 'RET-008', basePrice: 40.0 },
    { name: 'Sunglasses', sku: 'RET-009', basePrice: 55.0 },
    { name: 'Watch', sku: 'RET-010', basePrice: 150.0 },
  ],
  fashion: [
    { name: 'Dress', sku: 'FASH-001', basePrice: 89.0 },
    { name: 'Blouse', sku: 'FASH-002', basePrice: 55.0 },
    { name: 'Skirt', sku: 'FASH-003', basePrice: 65.0 },
    { name: 'Jacket', sku: 'FASH-004', basePrice: 120.0 },
    { name: 'Trousers', sku: 'FASH-005', basePrice: 75.0 },
    { name: 'Scarf', sku: 'FASH-006', basePrice: 30.0 },
    { name: 'Handbag', sku: 'FASH-007', basePrice: 95.0 },
    { name: 'Heels', sku: 'FASH-008', basePrice: 110.0 },
    { name: 'Earrings', sku: 'FASH-009', basePrice: 25.0 },
    { name: 'Bracelet', sku: 'FASH-010', basePrice: 35.0 },
  ],
  grocery: [
    { name: 'Milk 2L', sku: 'GROC-001', basePrice: 3.5 },
    { name: 'Bread Loaf', sku: 'GROC-002', basePrice: 4.0 },
    { name: 'Dozen Eggs', sku: 'GROC-003', basePrice: 6.5 },
    { name: 'Butter 250g', sku: 'GROC-004', basePrice: 5.0 },
    { name: 'Cheese 500g', sku: 'GROC-005', basePrice: 8.0 },
    { name: 'Chicken Breast 1kg', sku: 'GROC-006', basePrice: 12.0 },
    { name: 'Rice 1kg', sku: 'GROC-007', basePrice: 4.0 },
    { name: 'Pasta 500g', sku: 'GROC-008', basePrice: 3.0 },
    { name: 'Bananas 1kg', sku: 'GROC-009', basePrice: 3.5 },
    { name: 'Tomatoes 500g', sku: 'GROC-010', basePrice: 4.5 },
  ],
};

// Generic fallback for industries not listed above
const GENERIC_PRODUCTS: DemoProduct[] = [
  { name: 'Product A', sku: 'GEN-001', basePrice: 10.0 },
  { name: 'Product B', sku: 'GEN-002', basePrice: 20.0 },
  { name: 'Product C', sku: 'GEN-003', basePrice: 30.0 },
  { name: 'Product D', sku: 'GEN-004', basePrice: 40.0 },
  { name: 'Product E', sku: 'GEN-005', basePrice: 50.0 },
];

export default function SetupProductsPage() {
  const router = useRouter();
  const [industry, setIndustry] = useState<string>('other');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('elevatedpos_setup_industry');
    if (stored) setIndustry(stored);
  }, []);

  const demoProducts = INDUSTRY_PRODUCTS[industry] ?? GENERIC_PRODUCTS;

  async function handleQuickStart() {
    setLoading(true);
    setError('');
    setProgress({ done: 0, total: demoProducts.length });

    try {
      for (let i = 0; i < demoProducts.length; i++) {
        const p = demoProducts[i];
        await apiFetch('products', {
          method: 'POST',
          body: JSON.stringify({
            name: p.name,
            sku: p.sku,
            basePrice: p.basePrice,
            status: 'active',
            productType: 'standard',
            trackStock: false,
          }),
        });
        setProgress({ done: i + 1, total: demoProducts.length });
      }

      await apiFetch('organisations/onboarding', {
        method: 'POST',
        body: JSON.stringify({ step: 'products_added' }),
      });

      sessionStorage.setItem('elevatedpos_setup_products', String(demoProducts.length));
      router.push('/setup/complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create products. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    setLoading(true);
    setError('');

    try {
      await apiFetch('organisations/onboarding', {
        method: 'POST',
        body: JSON.stringify({ step: 'products_added' }),
      });

      sessionStorage.setItem('elevatedpos_setup_products', '0');
      router.push('/setup/complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const industryLabel = industry.charAt(0).toUpperCase() + industry.slice(1);

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
          <PackagePlus className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Add your first products
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Get started quickly with sample products or add your own later.
        </p>
      </div>

      <div className="space-y-4">
        {/* Quick Start option */}
        <button
          type="button"
          onClick={handleQuickStart}
          disabled={loading}
          className="group w-full rounded-xl border-2 border-gray-200 bg-white p-6 text-left transition hover:border-indigo-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-600"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-white">Quick Start</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Load {demoProducts.length} sample products for a {industryLabel} business
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {demoProducts.slice(0, 5).map((p) => (
                  <span
                    key={p.sku}
                    className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {p.name}
                  </span>
                ))}
                {demoProducts.length > 5 && (
                  <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    +{demoProducts.length - 5} more
                  </span>
                )}
              </div>
            </div>
            <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-gray-400 transition group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
          </div>
        </button>

        {/* Skip option */}
        <button
          type="button"
          onClick={handleSkip}
          disabled={loading}
          className="group w-full rounded-xl border-2 border-gray-200 bg-white p-6 text-left transition hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              <ArrowRight className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-white">
                I&apos;ll add my own products
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Skip for now and add products manually from the dashboard
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Progress indicator */}
      {progress && loading && (
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Creating products...</span>
            <span className="font-medium text-indigo-600 dark:text-indigo-400">
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mt-6 flex justify-start">
        <button
          type="button"
          onClick={() => router.push('/setup/location')}
          disabled={loading}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          Back
        </button>
      </div>
    </div>
  );
}
