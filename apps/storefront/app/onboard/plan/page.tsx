'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    period: '/mo',
    description: 'For small and growing businesses',
    features: ['1 location', '2 devices', 'POS + Kiosk', 'Email support', 'Basic reports'],
    featured: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$149',
    period: '/mo',
    description: 'For multi-location businesses',
    features: ['3 locations', '10 devices', 'Everything in Starter', 'Kitchen Display (KDS)', 'Phone support', 'Advanced analytics', 'Loyalty programs'],
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For enterprise and franchise groups',
    features: ['Unlimited locations & devices', 'Dedicated account manager', 'Custom integrations', 'SLA guarantee', 'Priority support'],
    featured: false,
    contactUs: true,
  },
];

function PlanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = searchParams?.get('orgId') || '';
  const token = searchParams?.get('token') || '';

  function selectPlan(planId: string) {
    const params = new URLSearchParams({ orgId });
    if (token) params.set('token', token);
    params.set('plan', planId);
    router.push(`/onboard/payment-account?${params.toString()}`);
  }

  function skipPlan() {
    const params = new URLSearchParams({ orgId });
    if (token) params.set('token', token);
    params.set('plan', 'starter');
    router.push(`/onboard/payment-account?${params.toString()}`);
  }

  return (
    <div className="flex-1 px-4 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-bold text-white mb-2">Choose your plan</h1>
          <p className="text-neutral-500">All plans include a 14-day free trial. No credit card required.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl p-8 flex flex-col relative ${
                plan.featured
                  ? 'border border-[#7c3aed] bg-[#7c3aed]/[0.03]'
                  : 'border border-white/[0.08] bg-white/[0.02]'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-[#7c3aed] text-white text-xs font-semibold px-3 py-1 rounded-full">Most popular</span>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                  {plan.period && <span className="text-neutral-500">{plan.period}</span>}
                </div>
                <p className="text-sm text-neutral-500 mt-1">{plan.description}</p>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-neutral-400">
                    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {plan.contactUs ? (
                <a
                  href="mailto:sales@elevatedpos.com.au"
                  className="block text-center text-sm font-semibold border border-white/[0.15] hover:border-white/30 text-white px-6 py-3 rounded-xl transition-colors"
                >
                  Contact us
                </a>
              ) : (
                <button
                  onClick={() => selectPlan(plan.id)}
                  className={`w-full text-sm font-semibold px-6 py-3 rounded-xl transition-colors ${
                    plan.featured
                      ? 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white'
                      : 'border border-white/[0.15] hover:border-white/30 text-white'
                  }`}
                >
                  Choose {plan.name}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={skipPlan}
            className="text-sm text-neutral-600 hover:text-neutral-400 underline transition-colors"
          >
            I&#39;ll decide later — continue with Starter
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-neutral-600">Loading…</div>}>
      <PlanPageContent />
    </Suspense>
  );
}
