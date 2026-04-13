'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const planDetails: Record<string, { name: string; price: string; period: string; features: string[] }> = {
  starter: {
    name: 'Starter',
    price: '$49',
    period: '/month after trial',
    features: ['1 location', '2 devices', 'POS + Kiosk', 'Email support', 'Basic reports'],
  },
  growth: {
    name: 'Growth',
    price: '$149',
    period: '/month after trial',
    features: ['3 locations', '10 devices', 'Kitchen Display (KDS)', 'Phone support', 'Advanced analytics', 'Loyalty programs'],
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    features: ['Unlimited locations & devices', 'Dedicated account manager', 'Custom integrations', 'SLA guarantee'],
  },
};

function SubscriptionContent() {
  const searchParams = useSearchParams();
  const orgId = searchParams?.get('orgId') || '';
  const plan = searchParams?.get('plan') || 'starter';
  const token = searchParams?.get('token') || '';
  const connected = searchParams?.get('connected') === 'true';

  const selectedPlan = planDetails[plan] ?? planDetails['starter']!;
  const continueHref = `/onboard/complete?orgId=${orgId}&plan=${plan}${token ? `&token=${token}` : ''}`;

  return (
    <div className="flex-1 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {connected && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
            <svg className="h-5 w-5 flex-shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-emerald-300">Payment account connected successfully!</span>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Activate your subscription</h1>
          <p className="text-neutral-500 text-sm">Review your plan and start your free trial.</p>
        </div>

        {/* Plan summary card */}
        <div className="border border-[#7c3aed]/20 rounded-2xl p-6 bg-[#7c3aed]/[0.03] mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-sm text-[#7c3aed] font-semibold uppercase tracking-wide">Selected plan</div>
              <div className="text-2xl font-bold text-white mt-1">{selectedPlan.name}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">{selectedPlan.price}</div>
              {selectedPlan.period && (
                <div className="text-xs text-neutral-500">{selectedPlan.period}</div>
              )}
            </div>
          </div>
          <ul className="space-y-1.5">
            {selectedPlan.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-neutral-400">
                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Trial message */}
        <div className="border border-emerald-500/20 rounded-2xl p-6 bg-emerald-500/[0.05] mb-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-white text-sm">Your 14-day trial has started</div>
              <div className="text-sm text-neutral-400 mt-1 leading-relaxed">
                No payment required until your trial ends. You&#39;ll receive a reminder 3 days before you&#39;re charged.
              </div>
            </div>
          </div>
        </div>

        <Link
          href={continueHref}
          className="block w-full text-center bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Continue
        </Link>

        <p className="text-xs text-neutral-600 text-center mt-4">
          You can change or cancel your plan at any time from your dashboard.
        </p>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-neutral-600">Loading…</div>}>
      <SubscriptionContent />
    </Suspense>
  );
}
