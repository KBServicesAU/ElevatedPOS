'use client';

import { useState } from 'react';
import Link from 'next/link';

const monthly = [
  { id: 'starter', name: 'Starter', price: '$49', features: ['1 location', '2 devices', 'POS + Kiosk', 'Email support', 'Basic reports'], featured: false },
  { id: 'growth', name: 'Growth', price: '$149', features: ['3 locations', '10 devices', 'Everything in Starter', 'Kitchen Display (KDS)', 'Phone support', 'Advanced analytics', 'Loyalty programs'], featured: true },
  { id: 'enterprise', name: 'Enterprise', price: 'Custom', features: ['Unlimited locations & devices', 'Dedicated account manager', 'Custom integrations', 'SLA guarantee', 'Priority support'], featured: false, contactUs: true },
];

const annual = [
  { id: 'starter', name: 'Starter', price: '$490', features: ['1 location', '2 devices', 'POS + Kiosk', 'Email support', 'Basic reports'], featured: false },
  { id: 'growth', name: 'Growth', price: '$1,490', features: ['3 locations', '10 devices', 'Everything in Starter', 'Kitchen Display (KDS)', 'Phone support', 'Advanced analytics', 'Loyalty programs'], featured: true },
  { id: 'enterprise', name: 'Enterprise', price: 'Custom', features: ['Unlimited locations & devices', 'Dedicated account manager', 'Custom integrations', 'SLA guarantee', 'Priority support'], featured: false, contactUs: true },
];

export function PricingSection() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const plans = billing === 'monthly' ? monthly : annual;

  return (
    <section id="pricing" className="bg-white py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Simple, honest pricing</h2>
          <p className="text-lg text-gray-500">No lock-in contracts. Cancel any time.</p>
          <div className="inline-flex items-center gap-3 mt-6 bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${billing === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${billing === 'annual' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Annual <span className="text-emerald-600 text-xs font-semibold ml-1">Save 2 months</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl p-8 flex flex-col relative ${
                plan.featured
                  ? 'border-2 border-indigo-500 shadow-xl shadow-indigo-100'
                  : 'border border-gray-200'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Most popular</span>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                  {plan.price !== 'Custom' && (
                    <span className="text-gray-500">{billing === 'monthly' ? '/mo' : '/yr'}</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {plan.id === 'starter' ? 'For small and growing businesses' : plan.id === 'growth' ? 'For multi-location businesses' : 'For enterprise and franchise groups'}
                </p>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {'contactUs' in plan && plan.contactUs ? (
                <a
                  href="mailto:sales@elevatedpos.com.au"
                  className="block text-center text-sm font-semibold border border-gray-300 hover:border-indigo-400 hover:text-indigo-600 text-gray-700 px-6 py-3 rounded-xl transition-colors"
                >
                  Contact us
                </a>
              ) : (
                <Link
                  href="/onboard"
                  className={`block text-center text-sm font-semibold px-6 py-3 rounded-xl transition-colors ${
                    plan.featured
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-200'
                      : 'border border-gray-300 hover:border-indigo-400 hover:text-indigo-600 text-gray-700'
                  }`}
                >
                  Get started
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
