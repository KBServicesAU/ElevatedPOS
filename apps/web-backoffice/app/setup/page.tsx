'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Coffee,
  UtensilsCrossed,
  Wine,
  ShoppingBag,
  Shirt,
  Apple,
  Scissors,
  Dumbbell,
  Briefcase,
  LayoutGrid,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

const INDUSTRIES = [
  { id: 'cafe', label: 'Cafe', description: 'Coffee shops & bakeries', icon: Coffee },
  { id: 'restaurant', label: 'Restaurant', description: 'Dine-in & takeaway', icon: UtensilsCrossed },
  { id: 'bar', label: 'Bar', description: 'Bars & nightclubs', icon: Wine },
  { id: 'retail', label: 'Retail', description: 'General retail stores', icon: ShoppingBag },
  { id: 'fashion', label: 'Fashion', description: 'Clothing & accessories', icon: Shirt },
  { id: 'grocery', label: 'Grocery', description: 'Supermarkets & grocers', icon: Apple },
  { id: 'salon', label: 'Salon', description: 'Hair & beauty salons', icon: Scissors },
  { id: 'gym', label: 'Gym', description: 'Fitness & wellness', icon: Dumbbell },
  { id: 'services', label: 'Services', description: 'Professional services', icon: Briefcase },
  { id: 'other', label: 'Other', description: 'Something else', icon: LayoutGrid },
] as const;

type IndustryId = (typeof INDUSTRIES)[number]['id'];

export default function SetupIndustryPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<IndustryId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleContinue() {
    if (!selected) return;
    setLoading(true);
    setError('');

    try {
      await apiFetch('organisations/onboarding', {
        method: 'POST',
        body: JSON.stringify({ step: 'industry_selected', industry: selected }),
      });

      // Store industry in sessionStorage so later steps can access it
      sessionStorage.setItem('elevatedpos_setup_industry', selected);
      router.push('/setup/location');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome to ElevatedPOS!
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Let&apos;s set up your business. What industry are you in?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {INDUSTRIES.map((industry) => {
          const Icon = industry.icon;
          const isSelected = selected === industry.id;
          return (
            <button
              key={industry.id}
              type="button"
              onClick={() => setSelected(industry.id)}
              className={`group flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50 shadow-md shadow-indigo-600/10 dark:border-indigo-500 dark:bg-indigo-950/40'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:group-hover:bg-gray-600'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p
                  className={`text-sm font-medium ${
                    isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {industry.label}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {industry.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selected || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </div>
  );
}
